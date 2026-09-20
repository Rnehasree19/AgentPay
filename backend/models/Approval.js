import mongoose from "mongoose";

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CANCELLED"];

const approvalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    offerId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductOffer", required: true, index: true },
    status: { type: String, enum: APPROVAL_STATUSES, required: true, default: "PENDING", index: true },
    requestedPricePaise: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 3 },
    reasonCode: { type: String, required: true },
    requestedAt: { type: Date, required: true },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decisionReason: { type: String, default: "" },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

approvalSchema.index(
  { userId: 1, offerId: 1 },
  { unique: true, partialFilterExpression: { status: "PENDING" } }
);

export const Approval = mongoose.model("Approval", approvalSchema);

export default Approval;