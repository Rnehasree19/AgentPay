import Approval from "../models/Approval.js";

export const approvalRepository = {
  async create(data) {
    const approval = await Approval.create(data);
    return approval.toObject();
  },

  async findById(id) {
    return Approval.findById(id).lean();
  },

  async findPendingByUserAndOffer(userId, offerId) {
    return Approval.findOne({ userId, offerId, status: "PENDING" }).lean();
  },

  async findByUserId(userId) {
    return Approval.find({ userId }).sort({ requestedAt: -1 }).lean();
  },

  async transitionPendingToApproved(id, userId, decidedBy, decisionReason = "") {
    return Approval.findOneAndUpdate(
      { _id: id, userId, status: "PENDING" },
      { $set: { status: "APPROVED", decidedAt: new Date(), decidedBy, decisionReason } },
      { new: true }
    ).lean();
  },

  async transitionPendingToRejected(id, userId, decidedBy, decisionReason = "") {
    return Approval.findOneAndUpdate(
      { _id: id, userId, status: "PENDING" },
      { $set: { status: "REJECTED", decidedAt: new Date(), decidedBy, decisionReason } },
      { new: true }
    ).lean();
  },

  async transitionPendingToExpired(id, userId = null) {
    const filter = { _id: id, status: "PENDING" };
    if (userId) filter.userId = userId;

    return Approval.findOneAndUpdate(
      filter,
      { $set: { status: "EXPIRED", decidedAt: new Date(), decisionReason: "Approval expired." } },
      { new: true }
    ).lean();
  },

  async deleteById(id) {
    return Approval.deleteOne({ _id: id });
  },
};

export default approvalRepository;