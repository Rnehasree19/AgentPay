import mongoose from "mongoose";

const allowedAvailability = ["in_stock", "out_of_stock", "limited", "unknown"];

const productOfferSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductSource",
      required: true,
      index: true,
    },
    sourceProductId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 250,
    },
    pricePaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "pricePaise must be an integer number of paise.",
      },
      index: true,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
      uppercase: true,
      trim: true,
      maxlength: 3,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: null,
    },
    reviewCount: {
      type: Number,
      min: 0,
      default: null,
      validate: {
        validator(value) {
          return value === null || Number.isInteger(value);
        },
        message: "reviewCount must be a non-negative integer or null.",
      },
    },
    availability: {
      type: String,
      enum: allowedAvailability,
      default: "unknown",
      index: true,
    },
    deliveryInfo: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    attributes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    fetchedAt: {
      type: Date,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    sourceType: {
      type: String,
      enum: ["demo", "api", "feed", "other"],
      default: "other",
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

productOfferSchema.index(
  { sourceId: 1, sourceProductId: 1 },
  { unique: true }
);

productOfferSchema.index({ productId: 1, active: 1, fetchedAt: -1 });
productOfferSchema.index({ sourceId: 1, active: 1, pricePaise: 1 });

export const ProductOffer = mongoose.model("ProductOffer", productOfferSchema);

export default ProductOffer;
