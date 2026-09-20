import SearchResult from "../models/SearchResult.js";

export const searchResultRepository = {
  async createMany(data) {
    return SearchResult.insertMany(data, { ordered: true });
  },

  async findBySearchId(searchId) {
    return SearchResult.find({ searchId }).sort({ rank: 1 }).lean();
  },
};

export default searchResultRepository;