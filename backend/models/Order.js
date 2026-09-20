import mongoose from "mongoose";

export const ORDER_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "PAYMENT_PENDING",
  "PAID",
  "FAILED",
  "CANCELLED",
  "UNKNOWN",
];

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    offerId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductOffer", required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductSource", required: true, index: true },
    status: { type: String, enum: ORDER_STATUSES, required: true, default: "APPROVED", index: true },
    quantity: { type: Number, required: true, min: 1, max: 1, default: 1 },
    unitPricePaise: { type: Number, required: true, min: 0 },
    totalAmountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 3 },
    approvalId: { type: mongoose.Schema.Types.ObjectId, ref: "Approval", default: null },
    idempotencyKey: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ userId: 1, createdAt: -1 });

export const Order = mongoose.model("Order", orderSchema);

export default Order;