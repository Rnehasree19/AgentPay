import mongoose from "mongoose";

export const PAYMENT_STATUSES = ["CREATED", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED", "UNKNOWN"];

const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, required: true, enum: ["razorpay"], default: "razorpay" },
    providerOrderId: { type: String, default: "", trim: true, index: true },
    providerPaymentId: { type: String, default: "", trim: true, index: true },
    amountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 3 },
    status: { type: String, required: true, enum: PAYMENT_STATUSES, default: "CREATED", index: true },
  },
  { timestamps: true }
);

paymentSchema.index({ provider: 1, providerOrderId: 1 }, { unique: true, partialFilterExpression: { providerOrderId: { $type: "string", $ne: "" } } });

export const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;