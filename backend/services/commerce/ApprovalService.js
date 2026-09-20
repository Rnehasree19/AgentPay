import mongoose from "mongoose";

import { env } from "../../config/env.js";
import { AuthorizationError } from "../../errors/AuthorizationError.js";
import { ConflictError } from "../../errors/ConflictError.js";
import { NotFoundError } from "../../errors/NotFoundError.js";
import { approvalRepository } from "../../repositories/approvalRepository.js";
import { productOfferRepository } from "../../repositories/productOfferRepository.js";
import { AuditService } from "../audit/AuditService.js";
import { AUDIT_EVENT_TYPES } from "../audit/AuditEventTypes.js";
import { COMMERCE_DECISIONS } from "./CommerceDecision.js";
import { OfferSelectionService } from "./OfferSelectionService.js";
import { assertApprovalTransition } from "./ApprovalStateMachine.js";

function safeApproval(approval, offer = null) {
  return {
    approvalId: String(approval._id || approval.approvalId),
    offerId: String(approval.offerId),
    status: approval.status,
    title: offer?.title || null,
    pricePaise: approval.requestedPricePaise,
    currency: approval.currency,
    reasonCode: approval.reasonCode,
    requestedAt: approval.requestedAt,
    decidedAt: approval.decidedAt || null,
    expiresAt: approval.expiresAt,
  };
}

export class ApprovalService {
  constructor({ approvals = approvalRepository, offers = productOfferRepository, selectionService = new OfferSelectionService(), auditService = new AuditService(), ttlSeconds = env.APPROVAL_TTL_SECONDS } = {}) {
    this.approvals = approvals;
    this.offers = offers;
    this.selectionService = selectionService;
    this.auditService = auditService;
    this.ttlSeconds = ttlSeconds;
  }

  validateId(id, fieldName) {
    if (!mongoose.isValidObjectId(id)) {
      const error = new Error(`${fieldName} must be a valid identifier.`);
      error.statusCode = 400;
      error.code = "VALIDATION_ERROR";
      error.isOperational = true;
      throw error;
    }
  }

  async recordDecisionAudit(userId, offerId, decision) {
    const eventType = decision.decision === COMMERCE_DECISIONS.BLOCKED
      ? AUDIT_EVENT_TYPES.POLICY_BLOCKED
      : decision.decision === COMMERCE_DECISIONS.APPROVAL_REQUIRED
        ? AUDIT_EVENT_TYPES.APPROVAL_REQUIRED
        : AUDIT_EVENT_TYPES.POLICY_CHECKED;

    await this.auditService.record({
      userId,
      eventType,
      entityType: "ProductOffer",
      entityId: offerId,
      metadata: {
        offerId,
        pricePaise: decision.offer?.pricePaise,
        currency: decision.offer?.currency,
        sourceCode: decision.offer?.sourceCode,
        decision: decision.decision,
        reasonCode: decision.reasonCode,
      },
    });
  }

  async requestApproval({ offerId, variant = null, authenticatedUserId }) {
    this.validateId(offerId, "offerId");
    const decision = await this.selectionService.select({ offerId, variant, authenticatedUserId });
    await this.recordDecisionAudit(authenticatedUserId, offerId, decision);

    if (decision.decision !== COMMERCE_DECISIONS.APPROVAL_REQUIRED) {
      return { decision, approval: null };
    }

    const existing = await this.approvals.findPendingByUserAndOffer(authenticatedUserId, offerId);
    if (existing) {
      return { decision, approval: safeApproval(existing, decision.offer) };
    }

    const now = new Date();
    const approval = await this.approvals.create({
      userId: authenticatedUserId,
      offerId,
      status: "PENDING",
      requestedPricePaise: decision.offer.pricePaise,
      currency: decision.offer.currency,
      reasonCode: decision.reasonCode,
      requestedAt: now,
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000),
    });

    try {
      await this.auditService.record({
        userId: authenticatedUserId,
        eventType: AUDIT_EVENT_TYPES.APPROVAL_CREATED,
        entityType: "Approval",
        entityId: approval._id,
        metadata: {
          approvalId: approval._id,
          offerId,
          pricePaise: approval.requestedPricePaise,
          currency: approval.currency,
          reasonCode: approval.reasonCode,
        },
      });
    } catch (error) {
      await this.approvals.deleteById?.(approval._id);
      throw error;
    }

    return { decision, approval: safeApproval(approval, decision.offer) };
  }

  async getOwnedApproval(approvalId, authenticatedUserId) {
    this.validateId(approvalId, "approvalId");
    const approval = await this.approvals.findById(approvalId);
    if (!approval) throw new NotFoundError("Approval request was not found.");
    if (String(approval.userId) !== String(authenticatedUserId)) {
      throw new AuthorizationError("You are not allowed to access this approval request.");
    }

    if (approval.status === "PENDING" && new Date(approval.expiresAt).getTime() <= Date.now()) {
      const expired = await this.approvals.transitionPendingToExpired(approvalId, authenticatedUserId);
      if (expired) {
        await this.auditService.record({
          userId: authenticatedUserId,
          eventType: AUDIT_EVENT_TYPES.APPROVAL_EXPIRED,
          entityType: "Approval",
          entityId: approvalId,
          metadata: { approvalId, offerId: approval.offerId },
        });
        return expired;
      }
    }

    return approval;
  }

  async listApprovals(authenticatedUserId) {
    const approvals = await this.approvals.findByUserId(authenticatedUserId);
    return Promise.all(approvals.map(async (approval) => safeApproval(approval, await this.offers.findById(approval.offerId))));
  }

  async getApproval(approvalId, authenticatedUserId) {
    const approval = await this.getOwnedApproval(approvalId, authenticatedUserId);
    const offer = await this.offers.findById(approval.offerId);
    await this.auditService.record({
      userId: authenticatedUserId,
      eventType: AUDIT_EVENT_TYPES.APPROVAL_VIEWED,
      entityType: "Approval",
      entityId: approvalId,
      metadata: { approvalId, offerId: approval.offerId },
    });
    return safeApproval(approval, offer);
  }

  async approve(approvalId, authenticatedUserId) {
    const approval = await this.getOwnedApproval(approvalId, authenticatedUserId);
    if (approval.status !== "PENDING") throw new ConflictError(`Approval is already ${approval.status}.`);
    assertApprovalTransition(approval.status, "APPROVED");

    const decision = await this.selectionService.select({ offerId: approval.offerId, authenticatedUserId });
    if (decision.decision === COMMERCE_DECISIONS.BLOCKED) {
      const rejected = await this.approvals.transitionPendingToRejected(approvalId, authenticatedUserId, authenticatedUserId, decision.reasonCode);
      if (!rejected) throw new ConflictError("Approval was already decided.");
      await this.auditService.record({ userId: authenticatedUserId, eventType: AUDIT_EVENT_TYPES.APPROVAL_REJECTED, entityType: "Approval", entityId: approvalId, metadata: { approvalId, offerId: approval.offerId, reasonCode: decision.reasonCode } });
      return { decision, approval: safeApproval(rejected, decision.offer) };
    }

    const approved = await this.approvals.transitionPendingToApproved(approvalId, authenticatedUserId, authenticatedUserId, "User explicitly approved the current offer.");
    if (!approved) throw new ConflictError("Approval was already decided.");

    await this.auditService.record({ userId: authenticatedUserId, eventType: AUDIT_EVENT_TYPES.APPROVAL_APPROVED, entityType: "Approval", entityId: approvalId, metadata: { approvalId, offerId: approval.offerId, pricePaise: decision.offer?.pricePaise, currency: decision.offer?.currency, decision: decision.decision } });
    return { decision: { ...decision, decision: "APPROVED", reasonCode: "APPROVAL_APPROVED", message: "This approval was recorded. No order or payment has been created." }, approval: safeApproval(approved, decision.offer) };
  }

  async reject(approvalId, authenticatedUserId) {
    const approval = await this.getOwnedApproval(approvalId, authenticatedUserId);
    if (approval.status !== "PENDING") throw new ConflictError(`Approval is already ${approval.status}.`);
    assertApprovalTransition(approval.status, "REJECTED");

    const rejected = await this.approvals.transitionPendingToRejected(approvalId, authenticatedUserId, authenticatedUserId, "Rejected by the user.");
    if (!rejected) throw new ConflictError("Approval was already decided.");
    await this.auditService.record({ userId: authenticatedUserId, eventType: AUDIT_EVENT_TYPES.APPROVAL_REJECTED, entityType: "Approval", entityId: approvalId, metadata: { approvalId, offerId: approval.offerId } });
    return { approval: safeApproval(rejected), message: "Approval request rejected." };
  }
}

export { safeApproval };
export default ApprovalService;