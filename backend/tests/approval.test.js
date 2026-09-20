import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { ApprovalService } from "../services/commerce/ApprovalService.js";
import { AuditService, sanitizeAuditMetadata } from "../services/audit/AuditService.js";
import { createApp } from "../app.js";

const userA = new mongoose.Types.ObjectId().toString();
const userB = new mongoose.Types.ObjectId().toString();
const offerId = new mongoose.Types.ObjectId().toString();

function offerSnapshot(overrides = {}) {
  return {
    offerId,
    productId: new mongoose.Types.ObjectId().toString(),
    sourceCode: "demo_store",
    sourceName: "Demo Source",
    title: "Demo laptop",
    pricePaise: 6000000,
    currency: "INR",
    availability: "in_stock",
    active: true,
    ...overrides,
  };
}

function decision(decisionName = "APPROVAL_REQUIRED", overrides = {}) {
  return {
    decision: decisionName,
    reasonCode: decisionName === "APPROVAL_REQUIRED" ? "APPROVAL_REQUIRED" : decisionName === "ALLOWED" ? "WITHIN_POLICY" : "MAX_TRANSACTION_EXCEEDED",
    message: "decision",
    offer: offerSnapshot(),
    ...overrides,
  };
}

function createApproval(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    userId: userA,
    offerId,
    status: "PENDING",
    requestedPricePaise: 6000000,
    currency: "INR",
    reasonCode: "APPROVAL_REQUIRED",
    requestedAt: new Date(),
    decidedAt: null,
    expiresAt: new Date(Date.now() + 60000),
    ...overrides,
  };
}

function createHarness(selectionDecision = decision()) {
  const state = { approvals: [], audit: [], deleted: [] };
  const approvals = {
    create: async (data) => {
      const value = createApproval({ ...data, _id: new mongoose.Types.ObjectId() });
      state.approvals.push(value);
      return value;
    },
    findById: async (id) => state.approvals.find((item) => String(item._id) === String(id)) || null,
    findPendingByUserAndOffer: async (userIdValue, offerIdValue) => state.approvals.find((item) => String(item.userId) === String(userIdValue) && String(item.offerId) === String(offerIdValue) && item.status === "PENDING") || null,
    findByUserId: async (userIdValue) => state.approvals.filter((item) => String(item.userId) === String(userIdValue)),
    transitionPendingToApproved: async (id, userIdValue, decidedBy, reason) => {
      const item = state.approvals.find((entry) => String(entry._id) === String(id) && String(entry.userId) === String(userIdValue) && entry.status === "PENDING");
      if (!item) return null;
      item.status = "APPROVED";
      item.decidedBy = decidedBy;
      item.decisionReason = reason;
      item.decidedAt = new Date();
      return item;
    },
    transitionPendingToRejected: async (id, userIdValue, decidedBy, reason) => {
      const item = state.approvals.find((entry) => String(entry._id) === String(id) && String(entry.userId) === String(userIdValue) && entry.status === "PENDING");
      if (!item) return null;
      item.status = "REJECTED";
      item.decidedBy = decidedBy;
      item.decisionReason = reason;
      item.decidedAt = new Date();
      return item;
    },
    transitionPendingToExpired: async (id, userIdValue) => {
      const item = state.approvals.find((entry) => String(entry._id) === String(id) && (!userIdValue || String(entry.userId) === String(userIdValue)) && entry.status === "PENDING");
      if (!item) return null;
      item.status = "EXPIRED";
      item.decidedAt = new Date();
      return item;
    },
    deleteById: async (id) => {
      state.deleted.push(String(id));
      state.approvals = state.approvals.filter((item) => String(item._id) !== String(id));
    },
  };
  const auditService = {
    record: async (event) => {
      state.audit.push(event);
      return event;
    },
  };
  const service = new ApprovalService({
    approvals,
    offers: { findById: async () => offerSnapshot() },
    selectionService: { select: async () => selectionDecision },
    auditService,
    ttlSeconds: 60,
  });
  return { state, approvals, service };
}

test("ALLOWED and BLOCKED decisions do not create approvals", async () => {
  const allowed = createHarness(decision("ALLOWED"));
  const allowedResult = await allowed.service.requestApproval({ offerId, authenticatedUserId: userA });
  assert.equal(allowedResult.approval, null);
  assert.equal(allowed.state.approvals.length, 0);

  const blocked = createHarness(decision("BLOCKED"));
  const blockedResult = await blocked.service.requestApproval({ offerId, authenticatedUserId: userA });
  assert.equal(blockedResult.approval, null);
  assert.equal(blocked.state.approvals.length, 0);
});

test("APPROVAL_REQUIRED creates a pending approval from authoritative price", async () => {
  const harness = createHarness();
  const result = await harness.service.requestApproval({ offerId, authenticatedUserId: userA, userId: userB, pricePaise: 1, currency: "USD" });

  assert.equal(result.approval.status, "PENDING");
  assert.equal(result.approval.pricePaise, 6000000);
  assert.equal(harness.state.approvals.length, 1);
  assert.ok(harness.state.audit.some((event) => event.eventType === "APPROVAL_CREATED"));
});

test("duplicate pending approval returns the existing request", async () => {
  const harness = createHarness();
  const first = await harness.service.requestApproval({ offerId, authenticatedUserId: userA });
  const second = await harness.service.requestApproval({ offerId, authenticatedUserId: userA });

  assert.equal(String(first.approval.approvalId), String(second.approval.approvalId));
  assert.equal(harness.state.approvals.length, 1);
});

test("only the owner can access, approve, or reject an approval", async () => {
  const harness = createHarness();
  const created = await harness.service.requestApproval({ offerId, authenticatedUserId: userA });

  await assert.rejects(() => harness.service.getApproval(created.approval.approvalId, userB), (error) => error.statusCode === 403);
  await assert.rejects(() => harness.service.approve(created.approval.approvalId, userB), (error) => error.statusCode === 403);
  await assert.rejects(() => harness.service.reject(created.approval.approvalId, userB), (error) => error.statusCode === 403);
});

test("pending approval can be approved and cannot be approved twice", async () => {
  const harness = createHarness();
  const created = await harness.service.requestApproval({ offerId, authenticatedUserId: userA });
  const approved = await harness.service.approve(created.approval.approvalId, userA);

  assert.equal(approved.approval.status, "APPROVED");
  await assert.rejects(() => harness.service.approve(created.approval.approvalId, userA), (error) => error.statusCode === 409);
  assert.ok(harness.state.audit.some((event) => event.eventType === "APPROVAL_APPROVED"));
});

test("pending approval can be rejected and cannot be rejected twice", async () => {
  const harness = createHarness();
  const created = await harness.service.requestApproval({ offerId, authenticatedUserId: userA });
  const rejected = await harness.service.reject(created.approval.approvalId, userA);

  assert.equal(rejected.approval.status, "REJECTED");
  await assert.rejects(() => harness.service.reject(created.approval.approvalId, userA), (error) => error.statusCode === 409);
});

test("expired pending approval becomes EXPIRED and cannot be approved", async () => {
  const harness = createHarness();
  const created = await harness.service.requestApproval({ offerId, authenticatedUserId: userA });
  harness.state.approvals[0].expiresAt = new Date(Date.now() - 1000);

  const viewed = await harness.service.getApproval(created.approval.approvalId, userA);
  assert.equal(viewed.status, "EXPIRED");
  await assert.rejects(() => harness.service.approve(created.approval.approvalId, userA), (error) => error.statusCode === 409);
  assert.ok(harness.state.audit.some((event) => event.eventType === "APPROVAL_EXPIRED"));
});

test("current authoritative offer is re-evaluated before approval", async () => {
  const harness = createHarness();
  const created = await harness.service.requestApproval({ offerId, authenticatedUserId: userA });
  harness.service.selectionService.select = async () => decision("BLOCKED", {
    reasonCode: "MAX_TRANSACTION_EXCEEDED",
    offer: offerSnapshot({ pricePaise: 8000000 }),
  });
  const result = await harness.service.approve(created.approval.approvalId, userA);

  assert.equal(result.decision.decision, "BLOCKED");
  assert.equal(result.approval.status, "REJECTED");
});

test("audit metadata removes sensitive values", () => {
  const sanitized = sanitizeAuditMetadata({ offerId, token: "secret", nested: { password: "secret", decision: "APPROVAL_REQUIRED" } });
  assert.equal(sanitized.token, undefined);
  assert.equal(sanitized.nested.password, undefined);
  assert.equal(sanitized.nested.decision, "APPROVAL_REQUIRED");
});

test("audit service writes append-only events through its repository", async () => {
  const events = [];
  const service = new AuditService({ repository: { create: async (event) => { events.push(event); return event; } } });
  await service.record({ userId: userA, eventType: "APPROVAL_CREATED", entityType: "Approval", entityId: "approval-1", metadata: { offerId } });
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "APPROVAL_CREATED");
});

test("approval request endpoint requires authentication", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const response = await fetch(`http://localhost:${server.address().port}/api/commerce/approval-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId }),
    });
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.error.code, "AUTHENTICATION_ERROR");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});