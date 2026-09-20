import mongoose from "mongoose";

const searchSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    originalQuery: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    structuredQuery: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

searchSchema.index({ userId: 1, createdAt: -1 });

export const Search = mongoose.model("Search", searchSchema);

export default Search;