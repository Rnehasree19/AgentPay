import UserPolicy from "../models/UserPolicy.js";

export const userPolicyRepository = {
  async findByUserId(userId) {
    return UserPolicy.findOne({ userId }).lean();
  },

  async create(data) {
    const policy = await UserPolicy.create(data);
    return policy.toObject();
  },

  async updateByUserId(userId, updates) {
    const policy = await UserPolicy.findOneAndUpdate(
      { userId },
      updates,
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    return policy;
  },
};

export default userPolicyRepository;
