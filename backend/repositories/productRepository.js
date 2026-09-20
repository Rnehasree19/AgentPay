import Product from "../models/Product.js";

export const productRepository = {
  async findById(id) {
    return Product.findById(id).lean();
  },

  async findByCanonicalKey(canonicalKey) {
    return Product.findOne({ canonicalKey }).lean();
  },

  async upsertByCanonicalKey(canonicalKey, data) {
    return Product.findOneAndUpdate(
      { canonicalKey },
      { ...data, canonicalKey },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
  },

  async findActiveByCategory(category) {
    return Product.find({ category, active: true }).lean();
  },

  async create(data) {
    const product = await Product.create(data);
    return product.toObject();
  },

  async updateById(id, updates) {
    return Product.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).lean();
  },
};

export default productRepository;
