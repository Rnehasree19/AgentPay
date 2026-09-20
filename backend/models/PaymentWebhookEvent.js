import mongoose from "mongoose";

export const WEBHOOK_PROCESSING_STATUSES = ["RECEIVED", "PROCESSED", "DUPLICATE", "FAILED"];

const paymentWebhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["razorpay"], required: true },
    eventId: { type: String, required: true, trim: true },
    eventType: { type: String, required: true, trim: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
    providerPaymentId: { type: String, default: "", trim: true },
    providerOrderId: { type: String, default: "", trim: true },
    payloadHash: { type: String, required: true },
    receivedAt: { type: Date, required: true },
    processedAt: { type: Date, default: null },
    processingStatus: { type: String, enum: WEBHOOK_PROCESSING_STATUSES, required: true, default: "RECEIVED" },
    failureReason: { type: String, default: "" },
  },
  { timestamps: true }
);

paymentWebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
paymentWebhookEventSchema.index({ providerPaymentId: 1 });
paymentWebhookEventSchema.index({ providerOrderId: 1 });

export const PaymentWebhookEvent = mongoose.model("PaymentWebhookEvent", paymentWebhookEventSchema);
export default PaymentWebhookEvent;