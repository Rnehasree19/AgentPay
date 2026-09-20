import Search from "../models/Search.js";

export const searchRepository = {
  async create(data) {
    const search = await Search.create(data);
    return search.toObject();
  },

  async findById(id) {
    return Search.findById(id).lean();
  },

  async findByUserId(userId) {
    return Search.find({ userId }).sort({ createdAt: -1 }).lean();
  },
};

export default searchRepository;