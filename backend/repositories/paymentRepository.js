import Payment from "../models/Payment.js";

export const paymentRepository = {
  async create(data) {
    const payment = await Payment.create(data);
    return payment.toObject();
  },

  async findById(id) {
    return Payment.findById(id).lean();
  },

  async findByOrderId(orderId) {
    return Payment.findOne({ orderId }).lean();
  },

  async findByProviderOrderId(providerOrderId) {
    return Payment.findOne({ providerOrderId }).lean();
  },

  async findByProviderPaymentId(providerPaymentId) {
    return Payment.findOne({ providerPaymentId }).lean();
  },

  async updateStatus(id, status, updates = {}) {
    return Payment.findByIdAndUpdate(id, { $set: { status, ...updates } }, { new: true, runValidators: true }).lean();
  },
};

export default paymentRepository;