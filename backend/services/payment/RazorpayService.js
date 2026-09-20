import crypto from "node:crypto";
import { createRequire } from "node:module";

import Razorpay from "razorpay";

import { env } from "../../config/env.js";
import { PaymentError } from "../../errors/PaymentError.js";
import { PaymentVerificationError } from "../../errors/PaymentVerificationError.js";

const require = createRequire(import.meta.url);
const { validatePaymentVerification } = require("razorpay/dist/utils/razorpay-utils");

export class RazorpayService {
  constructor({ client = null, keyId = env.RAZORPAY_KEY_ID, keySecret = env.RAZORPAY_KEY_SECRET, testMode = env.RAZORPAY_TEST_MODE, webhookSecret = env.RAZORPAY_WEBHOOK_SECRET } = {}) {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.testMode = testMode;
    this.webhookSecret = webhookSecret;
    this.client = client || (this.isAvailable() ? new Razorpay({ key_id: keyId, key_secret: keySecret }) : null);
  }

  isAvailable() {
    return Boolean(this.testMode && this.keyId && this.keySecret);
  }

  isWebhookConfigured() {
    return Boolean(this.webhookSecret);
  }

  buildProviderError(error, fallbackMessage) {
    const providerError = error?.error || error;
    const providerMessage = providerError?.description || providerError?.message || error?.message || fallbackMessage;
    const providerCode = providerError?.code || error?.code || "PAYMENT_PROVIDER_FAILURE";
    const providerStatusCode = error?.statusCode || error?.status || null;

    return new PaymentError(fallbackMessage, {
      code: "PAYMENT_PROVIDER_FAILURE",
      providerCode,
      providerStatusCode,
      providerMessage,
    });
  }

  verifyWebhookSignature({ rawBody, signature }) {
    if (!this.isWebhookConfigured()) {
      throw new PaymentVerificationError("Razorpay webhook verification is not configured.", {
        reasonCode: "WEBHOOK_NOT_CONFIGURED",
      });
    }

    if (!signature || typeof signature !== "string") {
      throw new PaymentVerificationError("Webhook signature is required.");
    }

    if (!Buffer.isBuffer(rawBody) && typeof rawBody !== "string") {
      throw new PaymentVerificationError("Webhook signature verification requires the raw request body.");
    }

    if (rawBody.length === 0) {
      throw new PaymentVerificationError("Webhook signature verification requires the raw request body.");
    }

    const expected = crypto.createHmac("sha256", this.webhookSecret).update(rawBody).digest();
    const provided = Buffer.from(signature, "utf8");

    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      throw new PaymentVerificationError("Webhook signature could not be verified.");
    }

    return true;
  }

  async createOrder({ amountPaise, currency, receipt }) {
    if (!this.isAvailable() || !this.client) {
      throw new PaymentError("Razorpay Test Mode is not configured.", { code: "PAYMENT_PROVIDER_UNAVAILABLE" });
    }

    try {
      const order = await this.client.orders.create({ amount: amountPaise, currency, receipt });
      if (!order?.id) {
        throw new Error("Razorpay returned no provider order ID.");
      }
      return { id: order.id, amount: order.amount, currency: order.currency };
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      throw this.buildProviderError(error, "Razorpay order creation failed.");
    }
  }

  async fetchOrder(providerOrderId) {
    if (!this.isAvailable() || !this.client) {
      throw new PaymentError("Razorpay Test Mode is not configured.", { code: "PAYMENT_PROVIDER_UNAVAILABLE" });
    }

    try {
      const order = await this.client.orders.fetch(providerOrderId);
      if (!order?.id) throw new Error("Razorpay returned no provider order.");
      return { id: order.id, amount: order.amount, currency: order.currency, status: order.status };
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      throw this.buildProviderError(error, "Razorpay order lookup failed.");
    }
  }

  async fetchPayment(providerPaymentId) {
    if (!this.isAvailable() || !this.client) {
      throw new PaymentError("Razorpay Test Mode is not configured.", { code: "PAYMENT_PROVIDER_UNAVAILABLE" });
    }

    try {
      const payment = await this.client.payments.fetch(providerPaymentId);
      if (!payment?.id) throw new Error("Razorpay returned no provider payment.");
      return {
        id: payment.id,
        orderId: payment.order_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
      };
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      throw this.buildProviderError(error, "Razorpay payment lookup failed.");
    }
  }

  async fetchPaymentsForOrder(providerOrderId) {
    if (!this.isAvailable() || !this.client) {
      throw new PaymentError("Razorpay Test Mode is not configured.", { code: "PAYMENT_PROVIDER_UNAVAILABLE" });
    }

    try {
      const response = await this.client.orders.fetchPayments(providerOrderId);
      return Array.isArray(response) ? response : response?.items || [];
    } catch (error) {
      throw this.buildProviderError(error, "Razorpay payment lookup failed.");
    }
  }

  verifyPaymentSignature({ orderId, paymentId, signature }) {
    if (!this.isAvailable() || !this.client) {
      throw new PaymentVerificationError("Razorpay Test Mode is not configured.");
    }

    if (!orderId || !paymentId || !signature) {
      throw new PaymentVerificationError("Payment verification data is incomplete.");
    }

    try {
      const valid = validatePaymentVerification(
        { order_id: orderId, payment_id: paymentId },
        signature,
        this.keySecret
      );
      if (!valid) throw new Error("Invalid payment signature.");
      return true;
    } catch (error) {
      throw new PaymentVerificationError("Payment signature could not be verified.");
    }
  }
}

export default RazorpayService;