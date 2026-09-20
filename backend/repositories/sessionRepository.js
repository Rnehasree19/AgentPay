import Session from "../models/Session.js";

export const sessionRepository = {
  async create(data) {
    const session = await Session.create(data);
    return session.toObject();
  },

  async findByTokenHash(sessionTokenHash) {
    return Session.findOne({ sessionTokenHash }).lean();
  },

  async updateLastUsedAt(id, lastUsedAt) {
    return Session.findByIdAndUpdate(id, { lastUsedAt }, { new: true }).lean();
  },

  async deleteByTokenHash(sessionTokenHash) {
    return Session.deleteOne({ sessionTokenHash });
  },
};

export default sessionRepository;