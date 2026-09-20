import mongoose from "mongoose";

const searchResultSchema = new mongoose.Schema(
  {
    searchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Search",
      required: true,
      index: true,
    },
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductOffer",
      required: true,
      index: true,
    },
    rank: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "rank must be an integer.",
      },
    },
    score: {
      type: Number,
      required: true,
    },
    rankingReasons: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

searchResultSchema.index({ searchId: 1, offerId: 1 }, { unique: true });
searchResultSchema.index({ searchId: 1, rank: 1 });

export const SearchResult = mongoose.model("SearchResult", searchResultSchema);

export default SearchResult;