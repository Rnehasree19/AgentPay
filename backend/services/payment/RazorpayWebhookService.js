import crypto from "node:crypto";

import { ValidationError } from "../../errors/ValidationError.js";
import { WebhookRejectionError } from "../../errors/WebhookRejectionError.js";
import { orderRepository } from "../../repositories/orderRepository.js";
import { paymentRepository } from "../../repositories/paymentRepository.js";
import { paymentWebhookRepository } from "../../repositories/paymentWebhookRepository.js";
import { AuditService } from "../audit/AuditService.js";
import { AUDIT_EVENT_TYPES } from "../audit/AuditEventTypes.js";
import { OrderService } from "../commerce/OrderService.js";
import { ORDER_STATUSES } from "../commerce/OrderStatus.js";
import { assertPaymentTransition } from "./PaymentStateMachine.js";
import { RazorpayService } from "./RazorpayService.js";

const PROVIDER = "razorpay";
const SIGNATURE_HEADER = "x-razorpay-signature";
const EVENT_ID_HEADER = "x-razorpay-event-id";
const MAX_EVENT_ID_LENGTH = 200;
const REJECTED_FAILURE_PREFIX = "REJECTED:";
const RETRYABLE_FAILURE_PREFIX = "ERROR:";
const UNKNOWN_EVENT_TYPE = "unknown";

export const RAZORPAY_WEBHOOK_EVENTS = Object.freeze({
  AUTHORIZED: "payment.authorized",
  CAPTURED: "payment.captured",
  FAILED: "payment.failed",
  REFUNDED: "payment.refunded",
});

export const WEBHOOK_REJECTION_REASONS = Object.freeze({
  MALFORMED_PAYLOAD: "MALFORMED_PAYLOAD",
  UNSUPPORTED_WEBHOOK_EVENT: "UNSUPPORTED_WEBHOOK_EVENT",
  PAYMENT_NOT_FOUND: "PAYMENT_NOT_FOUND",
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  PROVIDER_ORDER_MISMATCH: "PROVIDER_ORDER_MISMATCH",
  PROVIDER_PAYMENT_MISMATCH: "PROVIDER_PAYMENT_MISMATCH",
  AMOUNT_MISMATCH: "AMOUNT_MISMATCH",
  CURRENCY_MISMATCH: "CURRENCY_MISMATCH",
  INVALID_PAYMENT_TRANSITION: "INVALID_PAYMENT_TRANSITION",
  INVALID_ORDER_TRANSITION: "INVALID_ORDER_TRANSITION",
});

const EVENT_TARGET_STATUS = Object.freeze({
  [RAZORPAY_WEBHOOK_EVENTS.AUTHORIZED]: "AUTHORIZED",
  [RAZORPAY_WEBHOOK_EVENTS.CAPTURED]: "CAPTURED",
  [RAZORPAY_WEBHOOK_EVENTS.FAILED]: "FAILED",
  [RAZORPAY_WEBHOOK_EVENTS.REFUNDED]: "REFUNDED",
});

const EVENT_STATUS_AUDIT = Object.freeze({
  [RAZORPAY_WEBHOOK_EVENTS.AUTHORIZED]: AUDIT_EVENT_TYPES.PAYMENT_AUTHORIZED,
  [RAZORPAY_WEBHOOK_EVENTS.CAPTURED]: AUDIT_EVENT_TYPES.PAYMENT_CAPTURED,
  [RAZORPAY_WEBHOOK_EVENTS.FAILED]: AUDIT_EVENT_TYPES.PAYMENT_FAILED,
  [RAZORPAY_WEBHOOK_EVENTS.REFUNDED]: AUDIT_EVENT_TYPES.PAYMENT_REFUNDED,
});

const REJECTION_AUDIT = Object.freeze({
  [WEBHOOK_REJECTION_REASONS.PROVIDER_ORDER_MISMATCH]: AUDIT_EVENT_TYPES.PAYMENT_PROVIDER_ORDER_MISMATCH,
  [WEBHOOK_REJECTION_REASONS.PROVIDER_PAYMENT_MISMATCH]: AUDIT_EVENT_TYPES.PAYMENT_PROVIDER_PAYMENT_MISMATCH,
  [WEBHOOK_REJECTION_REASONS.AMOUNT_MISMATCH]: AUDIT_EVENT_TYPES.PAYMENT_AMOUNT_MISMATCH,
  [WEBHOOK_REJECTION_REASONS.CURRENCY_MISMATCH]: AUDIT_EVENT_TYPES.PAYMENT_CURRENCY_MISMATCH,
  [WEBHOOK_REJECTION_REASONS.UNSUPPORTED_WEBHOOK_EVENT]: AUDIT_EVENT_TYPES.WEBHOOK_UNSUPPORTED_EVENT,
});

const STATUS_RANK = Object.freeze({
  CREATED: 0,
  AUTHORIZED: 1,
  CAPTURED: 2,
  REFUNDED: 3,
});

function readHeader(headers, name) {
  const value = headers?.[name];

  if (Array.isArray(value)) {
    return String(value[0] ?? "").trim();
  }

  return String(value ?? "").trim();
}

function hashRawBody(rawBody) {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

function normalizeRawBody(rawBody) {
  if (Buffer.isBuffer(rawBody) && rawBody.length > 0) {
    return rawBody;
  }

  if (typeof rawBody === "string" && rawBody.length > 0) {
    return Buffer.from(rawBody, "utf8");
  }

  throw new ValidationError("Raw webhook body is required for signature verification.");
}

function parsePayload(rawBody) {
  try {
    const parsed = JSON.parse(rawBody.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Webhook payload must be an object.");
    }
    return parsed;
  } catch {
    throw new ValidationError("Webhook payload could not be parsed.");
  }
}
export class RazorpayWebhookService {
  constructor({
    payments = paymentRepository,
    orders = orderRepository,
    webhookEvents = paymentWebhookRepository,
    razorpay = new RazorpayService(),
    auditService = new AuditService(),
    orderService = new OrderService(),
  } = {}) {
    this.payments = payments;
    this.orders = orders;
    this.webhookEvents = webhookEvents;
    this.razorpay = razorpay;
    this.auditService = auditService;
    this.orderService = orderService;
  }

  response(statusCode, body) {
    return { statusCode, body };
  }

  async handle({ rawBody, signature, headers } = {}) {
    const body = normalizeRawBody(rawBody);
    const payloadHash = hashRawBody(body);

    this.razorpay.verifyWebhookSignature({
      rawBody: body,
      signature: signature ?? readHeader(headers, SIGNATURE_HEADER),
    });

    const payload = parsePayload(body);
    const eventType = String(payload.event || "").trim();

    if (!eventType) {
      await this.auditService.record({
        eventType: AUDIT_EVENT_TYPES.WEBHOOK_REJECTED,
        entityType: "PaymentWebhookEvent",
        entityId: payloadHash,
        metadata: { provider: PROVIDER, payloadHash, reasonCode: WEBHOOK_REJECTION_REASONS.MALFORMED_PAYLOAD },
      });
      throw new ValidationError("Webhook payload is missing an event type.");
    }

    const eventId = this.resolveEventId(headers, payloadHash);
    const claim = await this.claimEvent({ eventId, eventType, payloadHash, payload });

    if (claim.duplicate) {
      await this.auditService.record({
        eventType: AUDIT_EVENT_TYPES.WEBHOOK_DUPLICATE,
        entityType: "PaymentWebhookEvent",
        entityId: eventId,
        metadata: {
          provider: PROVIDER,
          eventId,
          eventType,
          payloadHash,
          processingStatus: claim.processingStatus || "PROCESSED",
        },
      });

      return this.response(200, {
        success: true,
        received: true,
        duplicate: true,
        processed: false,
        eventId,
        eventType,
      });
    }

    await this.auditService.record({
      eventType: AUDIT_EVENT_TYPES.WEBHOOK_RECEIVED,
      entityType: "PaymentWebhookEvent",
      entityId: eventId,
      metadata: { provider: PROVIDER, eventId, eventType, payloadHash, retry: claim.retry === true },
    });

    return this.completeProcessing({ claim, eventId, eventType, payload, payloadHash });
  }

  async completeProcessing({ claim, eventId, eventType, payload, payloadHash }) {
    try {
      const outcome = await this.processEvent({ eventType, payload, payloadHash });

      await this.webhookEvents.markProcessed(
        claim.event._id,
        outcome.paymentId ? { paymentId: outcome.paymentId } : {}
      );
      await this.auditService.record({
        eventType: AUDIT_EVENT_TYPES.PAYMENT_WEBHOOK_PROCESSED,
        entityType: "Payment",
        entityId: outcome.paymentId,
        metadata: {
          provider: PROVIDER,
          eventId,
          eventType,
          paymentId: outcome.paymentId,
          orderId: outcome.orderId,
          paymentStatus: outcome.paymentStatus,
          orderStatus: outcome.orderStatus,
          paymentChanged: outcome.paymentChanged,
          orderChanged: outcome.orderChanged,
          reasonCode: outcome.reasonCode,
        },
      });

      return this.response(200, {
        success: true,
        received: true,
        duplicate: false,
        processed: true,
        eventId,
        eventType,
        paymentId: outcome.paymentId,
        orderId: outcome.orderId,
      });
    } catch (error) {
      if (error instanceof WebhookRejectionError) {
        return this.rejectEvent({ claim, error, eventId, eventType, payloadHash });
      }

      try {
        await this.webhookEvents.markFailed(
          claim.event._id,
          `${RETRYABLE_FAILURE_PREFIX}${error?.code || "WEBHOOK_PROCESSING_ERROR"}`
        );
        await this.auditService.record({
          eventType: AUDIT_EVENT_TYPES.PAYMENT_WEBHOOK_FAILED,
          entityType: "PaymentWebhookEvent",
          entityId: eventId,
          metadata: { provider: PROVIDER, eventId, eventType, errorCode: error?.code || "WEBHOOK_PROCESSING_ERROR" },
        });
      } catch {
        // Failure bookkeeping must never mask the original error.
      }

      throw error;
    }
  }

  async rejectEvent({ claim, error, eventId, eventType, payloadHash }) {
    await this.webhookEvents.markFailed(
      claim.event._id,
      `${REJECTED_FAILURE_PREFIX}${error.reasonCode}`,
      error.details?.paymentId ? { paymentId: error.details.paymentId } : {}
    );

    await this.auditService.record({
      eventType: AUDIT_EVENT_TYPES.WEBHOOK_REJECTED,
      entityType: "PaymentWebhookEvent",
      entityId: eventId,
      metadata: {
        provider: PROVIDER,
        eventId,
        eventType,
        payloadHash,
        reasonCode: error.reasonCode,
        ...(error.details || {}),
      },
    });

    if (error.auditEventType) {
      await this.auditService.record({
        eventType: error.auditEventType,
        entityType: "Payment",
        entityId: error.details?.paymentId || eventId,
        metadata: {
          provider: PROVIDER,
          eventId,
          eventType,
          reasonCode: error.reasonCode,
          ...(error.details || {}),
        },
      });
    }

    return this.response(200, {
      success: true,
      received: true,
      duplicate: false,
      processed: false,
      rejected: true,
      reason: error.reasonCode,
      eventId,
      eventType,
    });
  }

  resolveEventId(headers, payloadHash) {
    const headerId = readHeader(headers, EVENT_ID_HEADER);

    if (headerId) {
      return headerId.slice(0, MAX_EVENT_ID_LENGTH);
    }

    return `derived_${payloadHash}`;
  }

  isRetryableEvent(event) {
    return Boolean(
      event &&
      event.processingStatus === "FAILED" &&
      typeof event.failureReason === "string" &&
      event.failureReason.startsWith(RETRYABLE_FAILURE_PREFIX)
    );
  }

  async claimEvent({ eventId, eventType, payloadHash, payload }) {
    const existing = await this.webhookEvents.findByEventId(PROVIDER, eventId);

    if (existing) {
      if (this.isRetryableEvent(existing)) {
        return { duplicate: false, retry: true, event: existing, eventId };
      }

      return {
        duplicate: true,
        retry: false,
        event: existing,
        eventId,
        processingStatus: existing.processingStatus,
      };
    }

    const entity = payload?.payload?.payment?.entity;

    try {
      const created = await this.webhookEvents.create({
        provider: PROVIDER,
        eventId,
        eventType,
        providerPaymentId: typeof entity?.id === "string" ? entity.id.trim() : "",
        providerOrderId: typeof entity?.order_id === "string" ? entity.order_id.trim() : "",
        payloadHash,
        receivedAt: new Date(),
        processingStatus: "RECEIVED",
      });

      return { duplicate: false, retry: false, event: created, eventId };
    } catch (error) {
      if (error?.code === 11000) {
        return { duplicate: true, retry: false, event: null, eventId, processingStatus: "DUPLICATE" };
      }

      throw error;
    }
  }

  async processEvent({ eventType, payload, payloadHash }) {
    if (!EVENT_TARGET_STATUS[eventType]) {
      throw new WebhookRejectionError(
        WEBHOOK_REJECTION_REASONS.UNSUPPORTED_WEBHOOK_EVENT,
        "This webhook event type is not supported.",
        AUDIT_EVENT_TYPES.WEBHOOK_UNSUPPORTED_EVENT,
        { payloadHash, eventType }
      );
    }

    const entity = this.extractPaymentEntity(payload, eventType, payloadHash);

    const payment = await this.payments.findByProviderOrderId(entity.orderId);
    if (!payment) {
      throw new WebhookRejectionError(
        WEBHOOK_REJECTION_REASONS.PAYMENT_NOT_FOUND,
        "No persisted AgentPay payment matches this provider order.",
        null,
        { payloadHash, eventType, providerOrderId: entity.orderId, providerPaymentId: entity.paymentId }
      );
    }

    const order = await this.orders.findById(payment.orderId);
    if (!order) {
      throw new WebhookRejectionError(
        WEBHOOK_REJECTION_REASONS.ORDER_NOT_FOUND,
        "No persisted AgentPay order matches this payment.",
        null,
        { payloadHash, eventType, paymentId: String(payment._id), orderId: String(payment.orderId) }
      );
    }

    this.assertProviderConsistency({ payment, order, entity, eventType, payloadHash });

    const paymentOutcome = await this.applyPaymentTransition({ payment, entity, eventType });
    const orderOutcome = await this.applyOrderTransition({ order, payment, eventType });

    return {
      paymentId: String(payment._id),
      orderId: String(order._id),
      paymentStatus: paymentOutcome.to,
      orderStatus: orderOutcome.to,
      paymentChanged: paymentOutcome.changed,
      orderChanged: orderOutcome.changed,
      reasonCode: orderOutcome.reasonCode || paymentOutcome.reasonCode || null,
    };
  }

  extractPaymentEntity(payload, eventType, payloadHash) {
    const entity = payload?.payload?.payment?.entity;

    if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
      throw new WebhookRejectionError(
        WEBHOOK_REJECTION_REASONS.MALFORMED_PAYLOAD,
        "Webhook payload does not contain a payment entity.",
        null,
        { payloadHash, eventType }
      );
    }

    const paymentId = String(entity.id || "").trim();
    const orderId = String(entity.order_id || "").trim();
    const amount = entity.amount;
    const currency = String(entity.currency || "").trim().toUpperCase();

    if (!paymentId || !orderId || !Number.isInteger(amount) || amount < 0 || !currency) {
      throw new WebhookRejectionError(
        WEBHOOK_REJECTION_REASONS.MALFORMED_PAYLOAD,
        "Webhook payment entity is incomplete.",
        null,
        { payloadHash, eventType, providerPaymentId: paymentId, providerOrderId: orderId }
      );
    }

    return { paymentId, orderId, amount, currency };
  }

  assertProviderConsistency({ payment, order, entity, eventType, payloadHash }) {
    const base = {
      payloadHash,
      eventType,
      paymentId: String(payment._id),
      orderId: String(order._id),
    };

    const storedProviderOrderId = String(payment.providerOrderId || "").trim();

    if (String(payment.provider || "") !== PROVIDER || !storedProviderOrderId || storedProviderOrderId !== entity.orderId) {
      throw new WebhookRejectionError(
        WEBHOOK_REJECTION_REASONS.PROVIDER_ORDER_MISMATCH,
        "Provider order ID does not match the persisted payment.",
        AUDIT_EVENT_TYPES.PAYMENT_PROVIDER_ORDER_MISMATCH,
        { ...base, providerOrderId: entity.orderId, expectedProviderOrderId: storedProviderOrderId }
      );
    }

    const storedProviderPaymentId = String(payment.providerPaymentId || "").trim();

    if (storedProviderPaymentId && storedProviderPaymentId !== entity.paymentId) {
      throw new WebhookRejectionError(
        WEBHOOK_REJECTION_REASONS.PROVIDER_PAYMENT_MISMATCH,
        "Provider payment ID does not match the persisted payment.",
        AUDIT_EVENT_TYPES.PAYMENT_PROVIDER_PAYMENT_MISMATCH,
        { ...base, providerPaymentId: entity.paymentId, expectedProviderPaymentId: storedProviderPaymentId }
      );
    }

    if (entity.amount !== payment.amountPaise || payment.amountPaise !== order.totalAmountPaise) {
      throw new WebhookRejectionError(
        WEBHOOK_REJECTION_REASONS.AMOUNT_MISMATCH,
        "Webhook amount does not match the persisted payment.",
        AUDIT_EVENT_TYPES.PAYMENT_AMOUNT_MISMATCH,
        {
          ...base,
          amountPaise: entity.amount,
          expectedAmountPaise: payment.amountPaise,
          orderAmountPaise: order.totalAmountPaise,
        }
      );
    }

    const paymentCurrency = String(payment.currency || "").trim().toUpperCase();
    const orderCurrency = String(order.currency || "").trim().toUpperCase();

    if (entity.currency !== paymentCurrency || paymentCurrency !== orderCurrency) {
      throw new WebhookRejectionError(
        WEBHOOK_REJECTION_REASONS.CURRENCY_MISMATCH,
        "Webhook currency does not match the persisted payment.",
        AUDIT_EVENT_TYPES.PAYMENT_CURRENCY_MISMATCH,
        { ...base, currency: entity.currency, expectedCurrency: paymentCurrency, orderCurrency }
      );
    }
  }

  async applyPaymentTransition({ payment, entity, eventType }) {
    const target = EVENT_TARGET_STATUS[eventType];
    const current = String(payment.status || "").trim();
    const providerPaymentId = String(payment.providerPaymentId || "").trim() || entity.paymentId;

    if (current === target) {
      return { changed: false, from: current, to: current, reasonCode: "PAYMENT_STATE_UNCHANGED" };
    }

    try {
      assertPaymentTransition(current, target);
    } catch {
      const currentRank = STATUS_RANK[current];
      const targetRank = STATUS_RANK[target];
      const alreadyAdvanced =
        currentRank !== undefined && targetRank !== undefined && targetRank <= currentRank;

      if (alreadyAdvanced) {
        return { changed: false, from: current, to: current, reasonCode: "PAYMENT_STATE_ALREADY_ADVANCED" };
      }

      throw new WebhookRejectionError(
        WEBHOOK_REJECTION_REASONS.INVALID_PAYMENT_TRANSITION,
        `Payment cannot move from ${current} to ${target}.`,
        null,
        {
          paymentId: String(payment._id),
          orderId: String(payment.orderId),
          from: current,
          to: target,
          eventType,
        }
      );
    }

    const updated = await this.payments.updateStatus(
      payment._id,
      target,
      providerPaymentId ? { providerPaymentId } : {}
    );

    if (!updated) {
      const error = new Error("Payment state could not be updated safely.");
      error.code = "PAYMENT_STATE_UPDATE_FAILED";
      error.statusCode = 500;
      throw error;
    }

    await this.auditService.record({
      userId: payment.userId,
      eventType: AUDIT_EVENT_TYPES.PAYMENT_STATE_CHANGED,
      entityType: "Payment",
      entityId: payment._id,
      metadata: {
        provider: PROVIDER,
        paymentId: String(payment._id),
        orderId: String(payment.orderId),
        from: current,
        to: target,
        status: target,
        amountPaise: updated.amountPaise,
        currency: updated.currency,
        providerOrderId: updated.providerOrderId,
      },
    });

    await this.auditService.record({
      userId: payment.userId,
      eventType: EVENT_STATUS_AUDIT[eventType],
      entityType: "Payment",
      entityId: payment._id,
      metadata: {
        provider: PROVIDER,
        paymentId: String(payment._id),
        orderId: String(payment.orderId),
        status: target,
      },
    });

    return { changed: true, from: current, to: target, reasonCode: null };
  }

  async applyOrderTransition({ order, payment, eventType }) {
    const currentStatus = String(order.status || "").trim();

    if (eventType === RAZORPAY_WEBHOOK_EVENTS.CAPTURED) {
      await this.auditService.record({
        userId: order.userId,
        eventType: AUDIT_EVENT_TYPES.PAYMENT_RECONCILIATION_REQUIRED,
        entityType: "Order",
        entityId: order._id,
        metadata: {
          provider: PROVIDER,
          orderId: String(order._id),
          paymentId: String(payment._id),
          status: currentStatus,
          reasonCode: "ORDER_PAID_REQUIRES_RECONCILIATION",
        },
      });

      return {
        changed: false,
        from: currentStatus,
        to: currentStatus,
        reasonCode: "ORDER_PAID_REQUIRES_RECONCILIATION",
      };
    }

    if (eventType === RAZORPAY_WEBHOOK_EVENTS.FAILED) {
      if (currentStatus !== ORDER_STATUSES.PAYMENT_PENDING) {
        return { changed: false, from: currentStatus, to: currentStatus, reasonCode: "ORDER_STATE_UNCHANGED" };
      }

      let transitioned;

      try {
        transitioned = await this.orderService.transitionOrder(
          order._id,
          order.userId,
          ORDER_STATUSES.PAYMENT_PENDING,
          ORDER_STATUSES.FAILED
        );
      } catch (error) {
        if (error?.code === "CONFLICT_ERROR") {
          return { changed: false, from: currentStatus, to: currentStatus, reasonCode: "ORDER_STATE_ALREADY_ADVANCED" };
        }

        throw error;
      }

      await this.auditService.record({
        userId: order.userId,
        eventType: AUDIT_EVENT_TYPES.ORDER_PAYMENT_FAILED,
        entityType: "Order",
        entityId: order._id,
        metadata: {
          provider: PROVIDER,
          orderId: String(order._id),
          paymentId: String(payment._id),
          status: transitioned.status,
        },
      });

      return { changed: true, from: ORDER_STATUSES.PAYMENT_PENDING, to: ORDER_STATUSES.FAILED, reasonCode: null };
    }

    return { changed: false, from: currentStatus, to: currentStatus, reasonCode: null };
  }
}

export default RazorpayWebhookService;

