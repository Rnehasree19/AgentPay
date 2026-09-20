import mongoose from "mongoose";

import { AuthorizationError } from "../../errors/AuthorizationError.js";
import { ConflictError } from "../../errors/ConflictError.js";
import { NotFoundError } from "../../errors/NotFoundError.js";
import { orderRepository } from "../../repositories/orderRepository.js";
import { approvalRepository } from "../../repositories/approvalRepository.js";
import { AuditService } from "../audit/AuditService.js";
import { AUDIT_EVENT_TYPES } from "../audit/AuditEventTypes.js";
import { COMMERCE_DECISIONS } from "./CommerceDecision.js";
import { OfferSelectionService } from "./OfferSelectionService.js";
import { assertOrderTransition } from "./OrderStateMachine.js";
import { ORDER_STATUSES } from "./OrderStatus.js";

const APPROVAL_REQUIRED_REASON = "APPROVAL_REQUIRED";
const PRICE_CHANGED_REASON = "PRICE_CHANGED_REQUIRES_REAPPROVAL";

function safeOrder(order, source = null) {
  return {
    orderId: String(order._id || order.orderId),
    status: order.status,
    offerId: String(order.offerId),
    productId: String(order.productId),
    source: source?.name || source?.code || null,
    quantity: order.quantity,
    unitPricePaise: order.unitPricePaise,
    totalAmountPaise: order.totalAmountPaise,
    currency: order.currency,
    approvalId: order.approvalId ? String(order.approvalId) : null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function decisionResponse(decision, reasonCode, message) {
  return {
    decision,
    reasonCode,
    message,
    order: null,
  };
}

export class OrderService {
  constructor({ orders = orderRepository, approvals = approvalRepository, selectionService = new OfferSelectionService(), auditService = new AuditService(), sourceRepository = null } = {}) {
    this.orders = orders;
    this.approvals = approvals;
    this.selectionService = selectionService;
    this.auditService = auditService;
    this.sourceRepository = sourceRepository;
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

  validateIdempotencyKey(key) {
    if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{8,200}$/.test(key)) {
      const error = new Error("Idempotency-Key must be 8-200 safe characters.");
      error.statusCode = 400;
      error.code = "VALIDATION_ERROR";
      error.isOperational = true;
      throw error;
    }
  }

  async audit(userId, eventType, orderId, metadata = {}) {
    return this.auditService.record({ userId, eventType, entityType: "Order", entityId: orderId, metadata });
  }

  sameRequest(order, { offerId, approvalId }) {
    return String(order.offerId) === String(offerId) && String(order.approvalId || "") === String(approvalId || "");
  }

  async replayOrConflict(existing, request, userId) {
    if (this.sameRequest(existing, request)) {
      await this.audit(userId, AUDIT_EVENT_TYPES.ORDER_IDEMPOTENCY_REPLAY, existing._id, { orderId: existing._id, offerId: existing.offerId, status: existing.status });
      return { type: "order_result", replay: true, order: safeOrder(existing) };
    }

    await this.audit(userId, AUDIT_EVENT_TYPES.ORDER_IDEMPOTENCY_CONFLICT, existing._id, { orderId: existing._id, offerId: existing.offerId });
    throw new ConflictError("Idempotency-Key was already used for a different order request.");
  }

  async createOrder({ offerId, approvalId = null, variant = null, authenticatedUserId, idempotencyKey }) {
    this.validateId(offerId, "offerId");
    if (approvalId) this.validateId(approvalId, "approvalId");
    this.validateIdempotencyKey(idempotencyKey);

    const existing = await this.orders.findByUserAndIdempotencyKey(authenticatedUserId, idempotencyKey);
    if (existing) return this.replayOrConflict(existing, { offerId, approvalId }, authenticatedUserId);

    const decision = await this.selectionService.select({ offerId, variant, authenticatedUserId });
    if (decision.decision === COMMERCE_DECISIONS.BLOCKED) {
      await this.audit(authenticatedUserId, AUDIT_EVENT_TYPES.ORDER_CREATION_BLOCKED, offerId, { offerId, pricePaise: decision.offer?.pricePaise, currency: decision.offer?.currency, reasonCode: decision.reasonCode });
      return { type: "commerce_decision", ...decisionResponse(COMMERCE_DECISIONS.BLOCKED, decision.reasonCode, decision.message) };
    }

    let verifiedApproval = null;
    if (decision.decision === COMMERCE_DECISIONS.APPROVAL_REQUIRED) {
      if (!approvalId) {
        await this.audit(authenticatedUserId, AUDIT_EVENT_TYPES.ORDER_CREATION_BLOCKED, offerId, { offerId, reasonCode: APPROVAL_REQUIRED_REASON });
        return { type: "commerce_decision", ...decisionResponse(COMMERCE_DECISIONS.APPROVAL_REQUIRED, APPROVAL_REQUIRED_REASON, "This purchase requires an approved approval request before an order can be created.") };
      }

      verifiedApproval = await this.approvals.findById(approvalId);
      if (!verifiedApproval || String(verifiedApproval.userId) !== String(authenticatedUserId) || String(verifiedApproval.offerId) !== String(offerId)) {
        throw new AuthorizationError("The approval request does not belong to this user and offer.");
      }

      if (verifiedApproval.status !== "APPROVED") {
        return { type: "commerce_decision", ...decisionResponse(COMMERCE_DECISIONS.APPROVAL_REQUIRED, APPROVAL_REQUIRED_REASON, "A valid approved request is required before an order can be created.") };
      }

      if (verifiedApproval.requestedPricePaise !== decision.offer.pricePaise || verifiedApproval.currency !== decision.offer.currency) {
        await this.audit(authenticatedUserId, AUDIT_EVENT_TYPES.ORDER_CREATION_BLOCKED, offerId, { offerId, approvalId, reasonCode: PRICE_CHANGED_REASON, pricePaise: decision.offer.pricePaise, currency: decision.offer.currency });
        return { type: "commerce_decision", ...decisionResponse(COMMERCE_DECISIONS.APPROVAL_REQUIRED, PRICE_CHANGED_REASON, "The offer price changed after approval. A fresh approval is required.") };
      }
    }

    const orderData = {
      userId: authenticatedUserId,
      offerId: decision.offer.offerId,
      productId: decision.offer.productId,
      sourceId: decision.offer.sourceId,
      status: ORDER_STATUSES.APPROVED,
      quantity: 1,
      unitPricePaise: decision.offer.pricePaise,
      totalAmountPaise: decision.offer.pricePaise,
      currency: decision.offer.currency,
      approvalId: verifiedApproval?._id || null,
      idempotencyKey,
    };

    let order;
    try {
      order = await this.orders.create(orderData);
    } catch (error) {
      if (error?.code === 11000) {
        const raced = await this.orders.findByUserAndIdempotencyKey(authenticatedUserId, idempotencyKey);
        if (raced) return this.replayOrConflict(raced, { offerId, approvalId }, authenticatedUserId);
      }
      throw error;
    }

    try {
      await this.audit(authenticatedUserId, AUDIT_EVENT_TYPES.ORDER_CREATED, order._id, { orderId: order._id, offerId: order.offerId, approvalId: order.approvalId, pricePaise: order.unitPricePaise, currency: order.currency, status: order.status });
    } catch (error) {
      await this.orders.deleteById?.(order._id);
      throw error;
    }

    return { type: "order_result", replay: false, order: safeOrder(order) };
  }

  async getOrder(orderId, authenticatedUserId) {
    this.validateId(orderId, "orderId");
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError("Order was not found.");
    if (String(order.userId) !== String(authenticatedUserId)) throw new AuthorizationError("You are not allowed to access this order.");
    await this.audit(authenticatedUserId, AUDIT_EVENT_TYPES.ORDER_VIEWED, order._id, { orderId: order._id, offerId: order.offerId, status: order.status });
    return safeOrder(order);
  }

  async listOrders(authenticatedUserId) {
    const orders = await this.orders.findByUserId(authenticatedUserId);
    return orders.map((order) => safeOrder(order));
  }

  async transitionOrder(orderId, authenticatedUserId, expectedState, nextState) {
    this.validateId(orderId, "orderId");
    assertOrderTransition(expectedState, nextState);
    const order = await this.orders.transitionFromExpectedState(orderId, authenticatedUserId, expectedState, nextState);
    if (!order) throw new ConflictError("Order state changed before this operation completed.");
    await this.audit(authenticatedUserId, AUDIT_EVENT_TYPES.ORDER_STATE_CHANGED, order._id, { orderId: order._id, from: expectedState, to: nextState, status: nextState });
    return safeOrder(order);
  }

  async cancelOrder(orderId, authenticatedUserId) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError("Order was not found.");
    if (String(order.userId) !== String(authenticatedUserId)) throw new AuthorizationError("You are not allowed to cancel this order.");
    const cancelled = await this.transitionOrder(orderId, authenticatedUserId, order.status, ORDER_STATUSES.CANCELLED);
    await this.audit(authenticatedUserId, AUDIT_EVENT_TYPES.ORDER_CANCELLED, orderId, { orderId, status: cancelled.status });
    return cancelled;
  }
}

export { safeOrder };
export default OrderService;