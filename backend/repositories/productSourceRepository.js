import ProductSource from "../models/ProductSource.js";

export const productSourceRepository = {
  async findById(id) {
    return ProductSource.findById(id).lean();
  },

  async findByCode(code) {
    return ProductSource.findOne({ code: String(code).trim().toLowerCase() }).lean();
  },

  async upsertByCode(code, data) {
    return ProductSource.findOneAndUpdate(
      { code: String(code).trim().toLowerCase() },
      { ...data, code: String(code).trim().toLowerCase() },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
  },

  async findEnabled() {
    return ProductSource.find({ enabled: true }).lean();
  },

  async create(data) {
    const source = await ProductSource.create(data);
    return source.toObject();
  },

  async updateById(id, updates) {
    return ProductSource.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).lean();
  },
};

export default productSourceRepository;
