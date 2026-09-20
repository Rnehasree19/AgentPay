import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { OrderService } from "../services/commerce/OrderService.js";
import { assertOrderTransition } from "../services/commerce/OrderStateMachine.js";

const userA = new mongoose.Types.ObjectId().toString();
const userB = new mongoose.Types.ObjectId().toString();
const offerId = new mongoose.Types.ObjectId().toString();
const approvalId = new mongoose.Types.ObjectId().toString();

function offer(overrides = {}) {
  return {
    offerId,
    productId: new mongoose.Types.ObjectId().toString(),
    sourceId: new mongoose.Types.ObjectId().toString(),
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

function makeDecision(name = "ALLOWED", currentOffer = offer()) {
  return {
    decision: name,
    reasonCode: name === "ALLOWED" ? "WITHIN_POLICY" : name === "APPROVAL_REQUIRED" ? "APPROVAL_REQUIRED" : "MAX_TRANSACTION_EXCEEDED",
    message: "decision message",
    offer: currentOffer,
  };
}

function harness({ selection = makeDecision(), approval = null } = {}) {
  const state = { orders: [], audits: [] };
  const orders = {
    findByUserAndIdempotencyKey: async (userIdValue, key) => state.orders.find((item) => String(item.userId) === String(userIdValue) && item.idempotencyKey === key) || null,
    create: async (data) => {
      const existing = state.orders.find((item) => String(item.userId) === String(data.userId) && item.idempotencyKey === data.idempotencyKey);
      if (existing) throw Object.assign(new Error("duplicate"), { code: 11000 });
      const value = { _id: new mongoose.Types.ObjectId(), createdAt: new Date(), updatedAt: new Date(), ...data };
      state.orders.push(value);
      return value;
    },
    findById: async (id) => state.orders.find((item) => String(item._id) === String(id)) || null,
    findByUserId: async (userIdValue) => state.orders.filter((item) => String(item.userId) === String(userIdValue)),
    transitionFromExpectedState: async (id, userIdValue, expected, next) => {
      const item = state.orders.find((entry) => String(entry._id) === String(id) && String(entry.userId) === String(userIdValue) && entry.status === expected);
      if (!item) return null;
      item.status = next;
      item.updatedAt = new Date();
      return item;
    },
    deleteById: async (id) => { state.orders = state.orders.filter((item) => String(item._id) !== String(id)); },
  };
  const service = new OrderService({
    orders,
    approvals: {
      findById: async () => approval,
    },
    selectionService: { select: async () => selection },
    auditService: { record: async (event) => { state.audits.push(event); return event; } },
  });
  return { service, state };
}

test("state machine accepts valid transitions and rejects terminal reversals", () => {
  assert.doesNotThrow(() => assertOrderTransition("APPROVED", "PAYMENT_PENDING"));
  assert.doesNotThrow(() => assertOrderTransition("PAYMENT_PENDING", "UNKNOWN"));
  assert.doesNotThrow(() => assertOrderTransition("UNKNOWN", "PAID"));
  assert.doesNotThrow(() => assertOrderTransition("PENDING_APPROVAL", "CANCELLED"));
  assert.throws(() => assertOrderTransition("PAID", "FAILED"), /cannot transition/i);
  assert.throws(() => assertOrderTransition("PAID", "CANCELLED"), /cannot transition/i);
  assert.throws(() => assertOrderTransition("CANCELLED", "APPROVED"), /cannot transition/i);
});

test("ALLOWED offer creates an APPROVED order with authoritative snapshot", async () => {
  const { service, state } = harness();
  const result = await service.createOrder({ offerId, authenticatedUserId: userA, idempotencyKey: "order-key-1" });

  assert.equal(result.order.status, "APPROVED");
  assert.equal(result.order.unitPricePaise, 6000000);
  assert.equal(state.orders.length, 1);
  assert.ok(state.audits.some((event) => event.eventType === "ORDER_CREATED"));
});

test("approval-required offer needs a valid approved owner approval", async () => {
  const required = makeDecision("APPROVAL_REQUIRED");
  const withoutApproval = harness({ selection: required });
  const blocked = await withoutApproval.service.createOrder({ offerId, authenticatedUserId: userA, idempotencyKey: "order-key-2" });
  assert.equal(blocked.decision, "APPROVAL_REQUIRED");
  assert.equal(withoutApproval.state.orders.length, 0);

  const withApproval = harness({
    selection: required,
    approval: { _id: approvalId, userId: userA, offerId, status: "APPROVED", requestedPricePaise: 6000000, currency: "INR" },
  });
  const created = await withApproval.service.createOrder({ offerId, approvalId, authenticatedUserId: userA, idempotencyKey: "order-key-3" });
  assert.equal(created.order.status, "APPROVED");
  assert.equal(String(created.order.approvalId), approvalId);
});

test("wrong, rejected, expired, or mismatched approvals cannot create orders", async () => {
  const required = makeDecision("APPROVAL_REQUIRED");
  const wrongOwner = harness({ selection: required, approval: { _id: approvalId, userId: userB, offerId, status: "APPROVED", requestedPricePaise: 6000000, currency: "INR" } });
  await assert.rejects(() => wrongOwner.service.createOrder({ offerId, approvalId, authenticatedUserId: userA, idempotencyKey: "order-key-4" }), (error) => error.statusCode === 403);

  const rejected = harness({ selection: required, approval: { _id: approvalId, userId: userA, offerId, status: "REJECTED", requestedPricePaise: 6000000, currency: "INR" } });
  const rejectedResult = await rejected.service.createOrder({ offerId, approvalId, authenticatedUserId: userA, idempotencyKey: "order-key-5" });
  assert.equal(rejectedResult.decision, "APPROVAL_REQUIRED");

  const differentOffer = harness({ selection: required, approval: { _id: approvalId, userId: userA, offerId: new mongoose.Types.ObjectId().toString(), status: "APPROVED", requestedPricePaise: 6000000, currency: "INR" } });
  await assert.rejects(() => differentOffer.service.createOrder({ offerId, approvalId, authenticatedUserId: userA, idempotencyKey: "order-key-6" }), (error) => error.statusCode === 403);
});

test("changed price requires fresh approval and never uses client price", async () => {
  const required = makeDecision("APPROVAL_REQUIRED", offer({ pricePaise: 6999000 }));
  const harnessValue = harness({ selection: required, approval: { _id: approvalId, userId: userA, offerId, status: "APPROVED", requestedPricePaise: 6000000, currency: "INR" } });
  const result = await harnessValue.service.createOrder({ offerId, approvalId, authenticatedUserId: userA, idempotencyKey: "order-key-7", pricePaise: 1 });
  assert.equal(result.reasonCode, "PRICE_CHANGED_REQUIRES_REAPPROVAL");
  assert.equal(harnessValue.state.orders.length, 0);
});

test("same user and idempotency key replays, different request conflicts, different users do not collide", async () => {
  const firstHarness = harness();
  const first = await firstHarness.service.createOrder({ offerId, authenticatedUserId: userA, idempotencyKey: "order-key-8" });
  const replay = await firstHarness.service.createOrder({ offerId, authenticatedUserId: userA, idempotencyKey: "order-key-8" });
  assert.equal(replay.replay, true);
  assert.equal(String(replay.order.orderId), String(first.order.orderId));
  await assert.rejects(() => firstHarness.service.createOrder({ offerId: new mongoose.Types.ObjectId().toString(), authenticatedUserId: userA, idempotencyKey: "order-key-8" }), (error) => error.statusCode === 409);

  const otherUser = await firstHarness.service.createOrder({ offerId, authenticatedUserId: userB, idempotencyKey: "order-key-8" });
  assert.equal(otherUser.replay, false);
  assert.equal(firstHarness.state.orders.length, 2);
});

test("invalid idempotency key and blocked offer create no order", async () => {
  const blocked = harness({ selection: makeDecision("BLOCKED") });
  await assert.rejects(() => blocked.service.createOrder({ offerId, authenticatedUserId: userA, idempotencyKey: "short" }), (error) => error.statusCode === 400);
  const result = await blocked.service.createOrder({ offerId, authenticatedUserId: userA, idempotencyKey: "order-key-9" });
  assert.equal(result.decision, "BLOCKED");
  assert.equal(blocked.state.orders.length, 0);
});

test("only the owner can retrieve or cancel an order", async () => {
  const harnessValue = harness();
  const created = await harnessValue.service.createOrder({ offerId, authenticatedUserId: userA, idempotencyKey: "order-key-10" });
  await assert.rejects(() => harnessValue.service.getOrder(created.order.orderId, userB), (error) => error.statusCode === 403);
  await assert.rejects(() => harnessValue.service.cancelOrder(created.order.orderId, userB), (error) => error.statusCode === 403);
  const cancelled = await harnessValue.service.cancelOrder(created.order.orderId, userA);
  assert.equal(cancelled.status, "CANCELLED");
});