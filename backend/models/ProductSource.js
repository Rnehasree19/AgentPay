import mongoose from "mongoose";

const allowedSourceTypes = ["demo", "api", "feed", "other"];
const allowedHealthStatus = ["healthy", "degraded", "unavailable", "unknown"];

const productSourceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    type: {
      type: String,
      enum: allowedSourceTypes,
      default: "other",
      required: true,
      index: true,
    },
    adapterKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    capabilities: {
      type: [String],
      default: [],
    },
    baseUrl: {
      type: String,
      trim: true,
      default: "",
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    healthStatus: {
      type: String,
      enum: allowedHealthStatus,
      default: "unknown",
      index: true,
    },
    lastSuccessfulFetchAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const ProductSource = mongoose.model("ProductSource", productSourceSchema);

export default ProductSource;
