import ProductOffer from "../models/ProductOffer.js";

export const productOfferRepository = {
  async findById(id) {
    return ProductOffer.findById(id).lean();
  },

  async findBySourceAndSourceProductId(sourceId, sourceProductId) {
    return ProductOffer.findOne({
      sourceId,
      sourceProductId: String(sourceProductId).trim(),
    }).lean();
  },

  async findByProductId(productId) {
    return ProductOffer.find({ productId }).lean();
  },

  async findActiveByProductId(productId) {
    return ProductOffer.find({ productId, active: true }).lean();
  },

  async upsertBySourceProduct(sourceId, sourceProductId, data) {
    return ProductOffer.findOneAndUpdate(
      {
        sourceId,
        sourceProductId: String(sourceProductId).trim(),
      },
      {
        ...data,
        sourceId,
        sourceProductId: String(sourceProductId).trim(),
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    ).lean();
  },

  async updateById(id, updates) {
    return ProductOffer.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).lean();
  },
};

export default productOfferRepository;
