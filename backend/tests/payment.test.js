import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";

import { PaymentService } from "../services/payment/PaymentService.js";
import { RazorpayService } from "../services/payment/RazorpayService.js";

const userId = new mongoose.Types.ObjectId().toString();
const orderId = new mongoose.Types.ObjectId().toString();
const paymentId = new mongoose.Types.ObjectId().toString();

function makeOrder(overrides = {}) {
  return {
    _id: orderId,
    userId,
    status: "APPROVED",
    totalAmountPaise: 6499900,
    currency: "INR",
    ...overrides,
  };
}

function makePayment(overrides = {}) {
  return {
    _id: paymentId,
    orderId,
    userId,
    provider: "razorpay",
    providerOrderId: "order_test_123",
    providerPaymentId: "",
    amountPaise: 6499900,
    currency: "INR",
    status: "CREATED",
    ...overrides,
  };
}

function makeHarness({ order = makeOrder(), payment = null, provider = { id: "order_test_123" }, providerPayment = null, providerError = null } = {}) {
  const state = { order, payment, createdProviderCalls: [], audits: [] };
  const service = new PaymentService({
    orders: {
      findById: async () => state.order,
      transitionFromExpectedState: async (id, owner, expected, next) => {
        if (String(state.order._id) !== String(id) || String(owner) !== String(state.order.userId) || state.order.status !== expected) return null;
        state.order = { ...state.order, status: next };
        return state.order;
      },
    },
    payments: {
      findByOrderId: async () => state.payment,
      findById: async () => state.payment,
      create: async (data) => {
        state.payment = { _id: paymentId, ...data };
        return state.payment;
      },
      updateStatus: async (id, status, updates = {}) => {
        state.payment = { ...state.payment, status, ...updates };
        return state.payment;
      },
    },
    razorpay: {
      keyId: "rzp_test_public",
      createOrder: async (data) => {
        state.createdProviderCalls.push(data);
        return provider;
      },
      verifyPaymentSignature: () => true,
      fetchOrder: async () => {
        if (providerError) throw providerError;
        return provider;
      },
      fetchPayment: async () => {
        if (providerError) throw providerError;
        return providerPayment;
      },
      fetchPaymentsForOrder: async () => {
        if (providerError) throw providerError;
        return providerPayment ? [providerPayment] : [];
      },
    },
    auditService: { record: async (event) => { state.audits.push(event); } },
  });
  return { service, state };
}

test("missing Razorpay test configuration fails safely", async () => {
  const service = new RazorpayService({ keyId: "", keySecret: "", testMode: false });
  await assert.rejects(() => service.createOrder({ amountPaise: 100, currency: "INR", receipt: "receipt" }), /not configured/i);
});

test("Razorpay provider failures keep the real provider code and status", async () => {
  const service = new RazorpayService({
    keyId: "rzp_test_public",
    keySecret: "test_secret",
    testMode: true,
    client: {
      orders: {
        create: async () => {
          const error = new Error("Authentication failed");
          error.statusCode = 401;
          error.error = { code: "BAD_REQUEST_ERROR", description: "Authentication failed" };
          throw error;
        },
      },
    },
  });

  await assert.rejects(() => service.createOrder({ amountPaise: 6499900, currency: "INR", receipt: "agentpay_order" }), (error) => {
    assert.equal(error.code, "PAYMENT_ERROR");
    assert.equal(error.details?.providerCode, "BAD_REQUEST_ERROR");
    assert.equal(error.details?.providerStatusCode, 401);
    assert.match(error.details?.providerMessage || "", /Authentication failed/i);
    return true;
  });
});

test("Razorpay service delegates provider order creation and signature verification", async () => {
  const calls = [];
  const service = new RazorpayService({
    keyId: "rzp_test_public",
    keySecret: "test_secret",
    testMode: true,
    client: {
      orders: { create: async (data) => { calls.push(data); return { id: "order_test_1", amount: data.amount, currency: data.currency }; } },
    },
  });

  const providerOrder = await service.createOrder({ amountPaise: 6499900, currency: "INR", receipt: "agentpay_order" });
  assert.equal(providerOrder.id, "order_test_1");
  assert.deepEqual(calls[0], { amount: 6499900, currency: "INR", receipt: "agentpay_order" });
  const validSignature = crypto
    .createHmac("sha256", "test_secret")
    .update("order_test_1|pay_1")
    .digest("hex");

  assert.equal(service.verifyPaymentSignature({ orderId: "order_test_1", paymentId: "pay_1", signature: validSignature }), true);
});

test("Razorpay service rejects an invalid payment signature", async () => {
  const service = new RazorpayService({
    keyId: "rzp_test_public",
    keySecret: "test_secret",
    testMode: true,
    client: {},
  });

  assert.throws(
    () => service.verifyPaymentSignature({ orderId: "order_test_1", paymentId: "pay_1", signature: "invalid_signature" }),
    (error) => {
      assert.equal(error.code, "PAYMENT_VERIFICATION_ERROR");
      return true;
    }
  );
});

test("payment uses authoritative order amount/currency and moves order to PAYMENT_PENDING", async () => {
  const { service, state } = makeHarness();
  const result = await service.createPaymentForOrder({ orderId, authenticatedUserId: userId, amountPaise: 1, currency: "USD" });

  assert.equal(result.payment.amountPaise, 6499900);
  assert.equal(result.payment.currency, "INR");
  assert.equal(state.createdProviderCalls[0].amountPaise, 6499900);
  assert.equal(state.createdProviderCalls[0].currency, "INR");
  assert.equal(state.order.status, "PAYMENT_PENDING");
  assert.equal(state.payment.status, "CREATED");
  assert.equal(state.payment.providerOrderId, "order_test_123");
});

test("existing CREATED payment is idempotently replayed without another provider call", async () => {
  const { service, state } = makeHarness({ payment: makePayment() });
  const result = await service.createPaymentForOrder({ orderId, authenticatedUserId: userId });
  assert.equal(result.replay, true);
  assert.equal(state.createdProviderCalls.length, 0);
  assert.equal(state.order.status, "PAYMENT_PENDING");
});

test("wrong user and non-approved order cannot create payment", async () => {
  const wrongUser = makeHarness();
  await assert.rejects(() => wrongUser.service.createPaymentForOrder({ orderId, authenticatedUserId: new mongoose.Types.ObjectId().toString() }), (error) => error.statusCode === 403);

  const pending = makeHarness({ order: makeOrder({ status: "PAYMENT_PENDING" }) });
  await assert.rejects(() => pending.service.createPaymentForOrder({ orderId, authenticatedUserId: userId }), (error) => error.statusCode === 409);
});

test("verification requires the stored provider order and does not mark order PAID", async () => {
  const { service, state } = makeHarness({ payment: makePayment() });
  await assert.rejects(() => service.verifyPayment({ paymentId, authenticatedUserId: userId, razorpayPaymentId: "pay_1", razorpayOrderId: "other_order", razorpaySignature: "sig" }), /does not match/i);

  const result = await service.verifyPayment({ paymentId, authenticatedUserId: userId, razorpayPaymentId: "pay_1", razorpayOrderId: "order_test_123", razorpaySignature: "sig" });
  assert.equal(result.payment.status, "AUTHORIZED");
  assert.equal(state.order.status, "APPROVED");
  assert.equal(result.orderStatus, "APPROVED");
});

test("payment state machine rejects PAID to FAILED/CANCELLED", async () => {
  const { service } = makeHarness({ payment: makePayment({ status: "CAPTURED" }) });
  await assert.rejects(() => service.verifyPayment({ paymentId, authenticatedUserId: userId, razorpayPaymentId: "pay_1", razorpayOrderId: "order_test_123", razorpaySignature: "sig" }), /cannot transition/i);
});

function reconciliationProvider(overrides = {}) {
  return {
    id: "order_test_123",
    amount: 6499900,
    currency: "INR",
    status: "created",
    ...overrides,
  };
}

function reconciliationPayment(overrides = {}) {
  return {
    id: "pay_test_1",
    orderId: "order_test_123",
    amount: 6499900,
    currency: "INR",
    status: "captured",
    ...overrides,
  };
}

test("reconciliation confirms captured payment and marks order paid", async () => {
  const { service, state } = makeHarness({
    order: makeOrder({ status: "PAYMENT_PENDING" }),
    payment: makePayment(),
    provider: reconciliationProvider(),
    providerPayment: reconciliationPayment(),
  });

  const result = await service.reconcilePayment({ paymentId, authenticatedUserId: userId });

  assert.equal(result.payment.status, "CAPTURED");
  assert.equal(result.orderStatus, "PAID");
  assert.equal(result.reconciliationStatus, "CONFIRMED");
  assert.equal(state.payment.providerPaymentId, "pay_test_1");
  assert.equal(state.order.status, "PAID");
});

test("reconciliation is idempotent after payment is captured and order is paid", async () => {
  const { service, state } = makeHarness({
    order: makeOrder({ status: "PAID" }),
    payment: makePayment({ status: "CAPTURED", providerPaymentId: "pay_test_1" }),
    provider: reconciliationProvider(),
    providerPayment: reconciliationPayment(),
  });

  const result = await service.reconcilePayment({ paymentId, authenticatedUserId: userId });

  assert.equal(result.payment.status, "CAPTURED");
  assert.equal(result.orderStatus, "PAID");
  assert.equal(state.audits.length, 0);
});

test("reconciliation rejects provider amount, currency, and order mismatches", async () => {
  for (const provider of [
    reconciliationProvider({ amount: 1 }),
    reconciliationProvider({ currency: "USD" }),
    reconciliationProvider({ id: "other_order" }),
  ]) {
    const { service, state } = makeHarness({
      order: makeOrder({ status: "PAYMENT_PENDING" }),
      payment: makePayment(),
      provider,
      providerPayment: reconciliationPayment(),
    });

    await assert.rejects(() => service.reconcilePayment({ paymentId, authenticatedUserId: userId }), /does not match/i);
    assert.equal(state.order.status, "PAYMENT_PENDING");
    assert.equal(state.payment.status, "CREATED");
  }
});

test("reconciliation moves a provider failure through valid failure transitions", async () => {
  const { service, state } = makeHarness({
    order: makeOrder({ status: "PAYMENT_PENDING" }),
    payment: makePayment(),
    provider: reconciliationProvider(),
    providerPayment: reconciliationPayment({ status: "failed" }),
  });

  const result = await service.reconcilePayment({ paymentId, authenticatedUserId: userId });

  assert.equal(result.reconciliationStatus, "FAILED");
  assert.equal(state.payment.status, "FAILED");
  assert.equal(state.order.status, "FAILED");
});

test("reconciliation preserves uncertainty when Razorpay cannot be reached", async () => {
  const { service, state } = makeHarness({
    order: makeOrder({ status: "PAYMENT_PENDING" }),
    payment: makePayment(),
    providerError: new Error("network unavailable"),
  });

  const result = await service.reconcilePayment({ paymentId, authenticatedUserId: userId });

  assert.equal(result.reconciliationStatus, "UNKNOWN");
  assert.equal(result.authoritative, false);
  assert.equal(state.payment.status, "UNKNOWN");
  assert.equal(state.order.status, "UNKNOWN");
});

test("reconciliation enforces ownership and payment ID validation", async () => {
  const { service } = makeHarness({ payment: makePayment() });

  await assert.rejects(() => service.reconcilePayment({ paymentId, authenticatedUserId: new mongoose.Types.ObjectId().toString() }), (error) => error.statusCode === 403);
  await assert.rejects(() => service.reconcilePayment({ paymentId: "invalid", authenticatedUserId: userId }), (error) => error.statusCode === 400);
});

test("already captured and paid payment returns safely without provider access", async () => {
  const { service } = makeHarness({
    order: makeOrder({ status: "PAID" }),
    payment: makePayment({ status: "CAPTURED", providerPaymentId: "pay_test_1" }),
    providerError: new Error("should not be called"),
  });

  const result = await service.reconcilePayment({ paymentId, authenticatedUserId: userId });
  assert.equal(result.reconciliationStatus, "CONFIRMED");
  assert.equal(result.authoritative, true);
});