import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200,
    },
    brand: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    pricePaise: {
      type: Number,
      min: 0,
      default: 0,
    },
    currency: {
      type: String,
      uppercase: true,
      trim: true,
      default: "INR",
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
    },
    availability: {
      type: String,
      enum: ["in_stock", "out_of_stock", "limited", "unknown"],
      default: "unknown",
      index: true,
    },
    sizes: {
      type: [String],
      default: [],
    },
    colors: {
      type: [String],
      default: [],
    },
    stock: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    material: {
      type: String,
      trim: true,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },
    url: {
      type: String,
      trim: true,
      default: "",
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
    canonicalKey: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
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

export const Product = mongoose.model("Product", productSchema);

export default Product;
