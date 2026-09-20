import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import express from "express";
import mongoose from "mongoose";

import { createApp } from "../app.js";
import { errorHandler } from "../middleware/errorHandler.js";
import { OrderService } from "../services/commerce/OrderService.js";
import { RazorpayService } from "../services/payment/RazorpayService.js";
import { RazorpayWebhookService, RAZORPAY_WEBHOOK_EVENTS, WEBHOOK_REJECTION_REASONS } from "../services/payment/RazorpayWebhookService.js";
import { createRazorpayWebhookHandler } from "../controllers/webhookController.js";
import { AUDIT_EVENT_TYPES } from "../services/audit/AuditEventTypes.js";

const WEBHOOK_SECRET = "whsec_test_webhook_secret";
const userId = new mongoose.Types.ObjectId();
const orderId = new mongoose.Types.ObjectId();
const paymentId = new mongoose.Types.ObjectId();

function signBody(rawBody, secret = WEBHOOK_SECRET) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function toRawBody(payload) {
  if (Buffer.isBuffer(payload)) return payload;
  if (typeof payload === "string") return Buffer.from(payload, "utf8");
  return Buffer.from(JSON.stringify(payload), "utf8");
}

function makeOrder(overrides = {}) {
  return {
    _id: orderId,
    userId,
    status: "PAYMENT_PENDING",
    totalAmountPaise: 6499900,
    currency: "INR",
    offerId: new mongoose.Types.ObjectId(),
    productId: new mongoose.Types.ObjectId(),
    sourceId: new mongoose.Types.ObjectId(),
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

function makePayload({
  event = RAZORPAY_WEBHOOK_EVENTS.CAPTURED,
  providerPaymentId = "pay_test_1",
  providerOrderId = "order_test_123",
  amount = 6499900,
  currency = "INR",
} = {}) {
  return {
    entity: "event",
    account_id: "acc_test",
    event,
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: providerPaymentId,
          entity: "payment",
          amount,
          currency,
          status: "captured",
          order_id: providerOrderId,
          method: "card",
          email: "buyer@example.com",
          contact: "+910000000000",
          created_at: 1758000000,
        },
      },
    },
    created_at: 1758000001,
  };
}