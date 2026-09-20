import mongoose from "mongoose";

import { AuthorizationError } from "../../errors/AuthorizationError.js";
import { ConflictError } from "../../errors/ConflictError.js";
import { NotFoundError } from "../../errors/NotFoundError.js";
import { PaymentError } from "../../errors/PaymentError.js";
import { PaymentVerificationError } from "../../errors/PaymentVerificationError.js";
import { orderRepository } from "../../repositories/orderRepository.js";
import { paymentRepository } from "../../repositories/paymentRepository.js";
import { AuditService } from "../audit/AuditService.js";
import { AUDIT_EVENT_TYPES } from "../audit/AuditEventTypes.js";
import { assertOrderTransition } from "../commerce/OrderStateMachine.js";
import { assertPaymentTransition } from "./PaymentStateMachine.js";
import { ORDER_STATUSES } from "../commerce/OrderStatus.js";
import { RazorpayService } from "./RazorpayService.js";

function safePayment(payment, keyId = "") {
  return {
    paymentId: String(payment._id || payment.paymentId),
    orderId: String(payment.orderId),
    provider: payment.provider,
    providerOrderId: payment.providerOrderId,
    providerPaymentId: payment.providerPaymentId || null,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    status: payment.status,
    keyId,
  };
}

export class PaymentService {
  constructor({ orders = orderRepository, payments = paymentRepository, razorpay = new RazorpayService(), auditService = new AuditService() } = {}) {
    this.orders = orders;
    this.payments = payments;
    this.razorpay = razorpay;
    this.auditService = auditService;
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

  async createPaymentForOrder({ orderId, authenticatedUserId }) {
    this.validateId(orderId, "orderId");
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError("Order was not found.");
    if (String(order.userId) !== String(authenticatedUserId)) throw new AuthorizationError("You are not allowed to pay for this order.");

    const existing = await this.payments.findByOrderId(orderId);
    if (existing?.status === "CREATED" && existing.providerOrderId) {
      if (order.status === "APPROVED") {
        await this.transitionOrderToPaymentPending(order, authenticatedUserId);
      }
      return { type: "payment_creation", replay: true, payment: safePayment(existing, this.razorpay.keyId) };
    }

    if (order.status !== "APPROVED") {
      throw new ConflictError("Only APPROVED orders can create a payment.");
    }

    if (!Number.isInteger(order.totalAmountPaise) || order.totalAmountPaise < 0 || order.currency !== "INR") {
      throw new PaymentError("The order contains an invalid payment amount or currency.", { code: "INVALID_PAYMENT_AMOUNT" });
    }

    const providerOrder = await this.razorpay.createOrder({
      amountPaise: order.totalAmountPaise,
      currency: order.currency,
      receipt: `agentpay_${String(order._id)}`,
    });

    let payment;
    try {
      payment = await this.payments.create({
        orderId: order._id,
        userId: order.userId,
        provider: "razorpay",
        providerOrderId: providerOrder.id,
        providerPaymentId: "",
        amountPaise: order.totalAmountPaise,
        currency: order.currency,
        status: "CREATED",
      });
    } catch (error) {
      if (error?.code === 11000) {
        const raced = await this.payments.findByOrderId(orderId);
        if (raced?.providerOrderId) return { type: "payment_creation", replay: true, payment: safePayment(raced, this.razorpay.keyId) };
      }
      throw new PaymentError("Payment was created by the provider but could not be recorded safely.", { code: "PAYMENT_PERSISTENCE_UNCERTAIN" });
    }

    await this.transitionOrderToPaymentPending(order, authenticatedUserId);
    await this.auditService.record({ userId: authenticatedUserId, eventType: AUDIT_EVENT_TYPES.PAYMENT_CREATED, entityType: "Payment", entityId: payment._id, metadata: { paymentId: payment._id, orderId: order._id, amountPaise: payment.amountPaise, currency: payment.currency, status: payment.status } });
    await this.auditService.record({ userId: authenticatedUserId, eventType: AUDIT_EVENT_TYPES.PAYMENT_PROVIDER_ORDER_CREATED, entityType: "Payment", entityId: payment._id, metadata: { paymentId: payment._id, orderId: order._id, provider: "razorpay", providerOrderId: payment.providerOrderId } });

    return { type: "payment_creation", replay: false, payment: safePayment(payment, this.razorpay.keyId) };
  }

  async transitionOrderToPaymentPending(order, userId) {
    const transitioned = await this.orders.transitionFromExpectedState(order._id, userId, "APPROVED", "PAYMENT_PENDING");
    if (!transitioned) throw new PaymentError("The order could not safely enter PAYMENT_PENDING.", { code: "ORDER_STATE_UNCERTAIN" });
    return transitioned;
  }

  async verifyPayment({ paymentId, authenticatedUserId, razorpayPaymentId, razorpayOrderId, razorpaySignature }) {
    this.validateId(paymentId, "paymentId");
    const payment = await this.payments.findById(paymentId);
    if (!payment) throw new NotFoundError("Payment was not found.");
    if (String(payment.userId) !== String(authenticatedUserId)) throw new AuthorizationError("You are not allowed to verify this payment.");
    const order = await this.orders.findById(payment.orderId);
    if (!order || String(order.userId) !== String(authenticatedUserId)) throw new AuthorizationError("Payment order ownership could not be verified.");

    if (payment.providerOrderId !== razorpayOrderId) throw new PaymentVerificationError("Provider order ID does not match the stored payment.");

    await this.auditService.record({ userId: authenticatedUserId, eventType: AUDIT_EVENT_TYPES.PAYMENT_VERIFICATION_STARTED, entityType: "Payment", entityId: payment._id, metadata: { paymentId: payment._id, orderId: order._id, provider: payment.provider } });

    try {
      this.razorpay.verifyPaymentSignature({ orderId: razorpayOrderId, paymentId: razorpayPaymentId, signature: razorpaySignature });
    } catch (error) {
      await this.payments.updateStatus(payment._id, "FAILED");
      await this.auditService.record({ userId: authenticatedUserId, eventType: AUDIT_EVENT_TYPES.PAYMENT_VERIFICATION_FAILED, entityType: "Payment", entityId: payment._id, metadata: { paymentId: payment._id, orderId: order._id, reasonCode: error.code || "INVALID_SIGNATURE" } });
      if (error instanceof PaymentVerificationError) throw error;
      throw new PaymentVerificationError("Payment verification failed.");
    }

    assertPaymentTransition(payment.status, "AUTHORIZED");
    const authorized = await this.payments.updateStatus(payment._id, "AUTHORIZED", { providerPaymentId: razorpayPaymentId });
    return { type: "payment_verification", payment: safePayment(authorized, this.razorpay.keyId), orderStatus: order.status, authoritative: true, note: "Payment verification established the verified provider payment relationship; webhook processing and authoritative reconciliation can subsequently confirm the final payment and order state." };
  }

  async reconcilePayment({ paymentId, authenticatedUserId }) {
    this.validateId(paymentId, "paymentId");
    const payment = await this.payments.findById(paymentId);
    if (!payment) throw new NotFoundError("Payment was not found.");
    if (String(payment.userId) !== String(authenticatedUserId)) throw new AuthorizationError("You are not allowed to reconcile this payment.");

    const order = await this.orders.findById(payment.orderId);
    if (!order || String(order.userId) !== String(authenticatedUserId)) throw new AuthorizationError("Payment order ownership could not be verified.");
    if (payment.provider !== "razorpay") throw new PaymentVerificationError("Payment provider is not supported for reconciliation.");
    if (!payment.providerOrderId) throw new PaymentVerificationError("Payment does not have a provider order ID.");

    if (payment.status === "CAPTURED" && order.status === ORDER_STATUSES.PAID) {
      return this.reconciliationResponse(payment, order, "CONFIRMED", true);
    }

    await this.auditService.record({
      userId: authenticatedUserId,
      eventType: AUDIT_EVENT_TYPES.PAYMENT_RECONCILIATION_STARTED,
      entityType: "Payment",
      entityId: payment._id,
      metadata: { paymentId: payment._id, orderId: order._id, provider: payment.provider },
    });

    let providerPayment;
    try {
      const providerOrder = await this.razorpay.fetchOrder(payment.providerOrderId);
      this.assertReconciliationConsistency({ payment, order, providerOrder });

      if (payment.providerPaymentId) {
        providerPayment = await this.razorpay.fetchPayment(payment.providerPaymentId);
      } else {
        const providerPayments = await this.razorpay.fetchPaymentsForOrder(payment.providerOrderId);
        if (providerPayments.length !== 1) return this.markReconciliationUnknown({ payment, order, userId: authenticatedUserId, reasonCode: "PROVIDER_PAYMENT_AMBIGUOUS" });
        providerPayment = providerPayments[0];
      }

      this.assertReconciliationConsistency({ payment, order, providerOrder, providerPayment });
    } catch (error) {
      if (error instanceof PaymentVerificationError) {
        await this.recordReconciliation(payment, order, authenticatedUserId, AUDIT_EVENT_TYPES.PAYMENT_RECONCILIATION_FAILED, error.code);
        throw error;
      }
      return this.markReconciliationUnknown({ payment, order, userId: authenticatedUserId, reasonCode: error.code || "PAYMENT_PROVIDER_FAILURE" });
    }

    const providerStatus = String(providerPayment.status || "").toLowerCase();
    if (providerStatus === "captured") {
      return this.confirmCapturedPayment({ payment, order, providerPayment, userId: authenticatedUserId });
    }
    if (["failed", "error"].includes(providerStatus)) {
      return this.failReconciledPayment({ payment, order, providerPayment, userId: authenticatedUserId });
    }
    return this.markReconciliationUnknown({ payment, order, userId: authenticatedUserId, reasonCode: "PROVIDER_PAYMENT_NOT_CAPTURED" });
  }

  assertReconciliationConsistency({ payment, order, providerOrder, providerPayment = null }) {
    if (providerOrder.id !== payment.providerOrderId || (providerPayment && providerPayment.orderId !== payment.providerOrderId)) {
      throw new PaymentVerificationError("Provider order ID does not match the stored payment.", { code: "PAYMENT_PROVIDER_ORDER_MISMATCH" });
    }
    if (providerOrder.amount !== payment.amountPaise || payment.amountPaise !== order.totalAmountPaise || (providerPayment && providerPayment.amount !== payment.amountPaise)) {
      throw new PaymentVerificationError("Provider amount does not match the persisted payment.", { code: "PAYMENT_AMOUNT_MISMATCH" });
    }
    const currency = String(payment.currency).toUpperCase();
    if (String(providerOrder.currency).toUpperCase() !== currency || currency !== String(order.currency).toUpperCase() || (providerPayment && String(providerPayment.currency).toUpperCase() !== currency)) {
      throw new PaymentVerificationError("Provider currency does not match the persisted payment.", { code: "PAYMENT_CURRENCY_MISMATCH" });
    }
    if (providerPayment && payment.providerPaymentId && providerPayment.id !== payment.providerPaymentId) {
      throw new PaymentVerificationError("Provider payment ID does not match the stored payment.", { code: "PAYMENT_PROVIDER_PAYMENT_MISMATCH" });
    }
  }

  async confirmCapturedPayment({ payment, order, providerPayment, userId }) {
    let updatedPayment = payment;
    if (payment.status !== "CAPTURED") {
      assertPaymentTransition(payment.status, "CAPTURED");
      updatedPayment = await this.payments.updateStatus(payment._id, "CAPTURED", { providerPaymentId: providerPayment.id });
      if (!updatedPayment) throw new PaymentError("Payment state could not be updated safely.", { code: "PAYMENT_STATE_UPDATE_FAILED" });
      await this.auditService.record({ userId, eventType: AUDIT_EVENT_TYPES.PAYMENT_STATE_CHANGED, entityType: "Payment", entityId: payment._id, metadata: { provider: "razorpay", from: payment.status, to: "CAPTURED", paymentId: payment._id, orderId: order._id } });
    }

    let updatedOrder = order;
    if (order.status !== ORDER_STATUSES.PAID) {
      assertOrderTransition(order.status, ORDER_STATUSES.PAID);
      updatedOrder = await this.orders.transitionFromExpectedState(order._id, userId, order.status, ORDER_STATUSES.PAID);
      if (!updatedOrder) throw new PaymentError("Order state could not be updated safely.", { code: "ORDER_STATE_UPDATE_FAILED" });
      await this.auditService.record({ userId, eventType: AUDIT_EVENT_TYPES.ORDER_STATE_CHANGED, entityType: "Order", entityId: order._id, metadata: { from: order.status, to: ORDER_STATUSES.PAID, paymentId: payment._id } });
    }

    await this.recordReconciliation(payment, updatedOrder, userId, AUDIT_EVENT_TYPES.PAYMENT_RECONCILIATION_COMPLETED, "PROVIDER_CAPTURED");
    return this.reconciliationResponse(updatedPayment, updatedOrder, "CONFIRMED", true);
  }

  async failReconciledPayment({ payment, order, providerPayment, userId }) {
    let updatedPayment = payment;
    if (payment.status !== "FAILED") {
      assertPaymentTransition(payment.status, "FAILED");
      updatedPayment = await this.payments.updateStatus(payment._id, "FAILED", { providerPaymentId: providerPayment.id });
    }
    let updatedOrder = order;
    if (order.status === ORDER_STATUSES.PAYMENT_PENDING) {
      assertOrderTransition(order.status, ORDER_STATUSES.FAILED);
      updatedOrder = await this.orders.transitionFromExpectedState(order._id, userId, order.status, ORDER_STATUSES.FAILED);
    }
    await this.recordReconciliation(payment, updatedOrder, userId, AUDIT_EVENT_TYPES.PAYMENT_RECONCILIATION_FAILED, "PROVIDER_FAILED");
    return this.reconciliationResponse(updatedPayment, updatedOrder, "FAILED", true);
  }

  async markReconciliationUnknown({ payment, order, userId, reasonCode }) {
    let updatedPayment = payment;
    if (["CREATED", "AUTHORIZED"].includes(payment.status)) {
      assertPaymentTransition(payment.status, "UNKNOWN");
      updatedPayment = await this.payments.updateStatus(payment._id, "UNKNOWN");
    }
    let updatedOrder = order;
    if (order.status === ORDER_STATUSES.PAYMENT_PENDING) {
      assertOrderTransition(order.status, ORDER_STATUSES.UNKNOWN);
      updatedOrder = await this.orders.transitionFromExpectedState(order._id, userId, order.status, ORDER_STATUSES.UNKNOWN);
    }
    await this.recordReconciliation(payment, updatedOrder, userId, AUDIT_EVENT_TYPES.PAYMENT_RECONCILIATION_UNKNOWN, reasonCode);
    return this.reconciliationResponse(updatedPayment, updatedOrder, "UNKNOWN", false);
  }

  async recordReconciliation(payment, order, userId, eventType, reasonCode) {
    return this.auditService.record({ userId, eventType, entityType: "Payment", entityId: payment._id, metadata: { paymentId: payment._id, orderId: order._id, provider: "razorpay", reasonCode } });
  }

  reconciliationResponse(payment, order, reconciliationStatus, authoritative) {
    return { payment: safePayment(payment, this.razorpay.keyId), orderStatus: order.status, reconciliationStatus, authoritative };
  }
}

export { safePayment };
export default PaymentService;