import UserMemory from "../models/UserMemory.js";

export const userMemoryRepository = {
  async findByUserId(userId) {
    return UserMemory.findOne({ userId }).lean();
  },

  async updateName(userId, name) {
    return UserMemory.findOneAndUpdate(
      { userId },
      { $set: { name } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
  },
};

export default userMemoryRepository;