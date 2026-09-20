import mongoose from "mongoose";

const userPolicySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    maxTransactionAmountPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "maxTransactionAmountPaise must be an integer number of paise.",
      },
    },
    approvalRequiredAbovePaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "approvalRequiredAbovePaise must be an integer number of paise.",
      },
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
      uppercase: true,
      trim: true,
      maxlength: 3,
    },
    active: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const UserPolicy = mongoose.model("UserPolicy", userPolicySchema);

export default UserPolicy;
