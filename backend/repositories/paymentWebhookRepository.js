import PaymentWebhookEvent from "../models/PaymentWebhookEvent.js";

export const paymentWebhookRepository = {
  async create(data) {
    const event = await PaymentWebhookEvent.create(data);
    return event.toObject();
  },
  async findByEventId(provider, eventId) {
    return PaymentWebhookEvent.findOne({ provider, eventId }).lean();
  },
  async markProcessed(id, updates = {}) {
    return PaymentWebhookEvent.findByIdAndUpdate(
      id,
      { $set: { processingStatus: "PROCESSED", processedAt: new Date(), ...updates } },
      { new: true }
    ).lean();
  },
  async markFailed(id, failureReason, updates = {}) {
    return PaymentWebhookEvent.findByIdAndUpdate(
      id,
      { $set: { processingStatus: "FAILED", failureReason, processedAt: new Date(), ...updates } },
      { new: true }
    ).lean();
  },
  async findByProviderPaymentId(providerPaymentId) {
    return PaymentWebhookEvent.find({ providerPaymentId }).sort({ receivedAt: -1 }).lean();
  },
  async findByProviderOrderId(providerOrderId) {
    return PaymentWebhookEvent.find({ providerOrderId }).sort({ receivedAt: -1 }).lean();
  },
};

export default paymentWebhookRepository;