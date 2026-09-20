import User from "../models/User.js";

export const userRepository = {
  async findById(id) {
    return User.findById(id).lean();
  },

  async findByEmail(email) {
    return User.findOne({ email: String(email).toLowerCase().trim() }).lean();
  },

  async findLocalByEmail(email) {
    return User.findOne({ email: String(email).toLowerCase().trim(), authProvider: "local" })
      .select("+passwordHash")
      .lean();
  },

  async listUsers() {
    return User.find({}, "name email role createdAt")
      .sort({ createdAt: 1 })
      .lean();
  },

  async findByProvider(provider, providerId) {
    return User.findOne({ authProvider: provider, providerId }).lean();
  },

  async create(data) {
    const user = await User.create(data);
    return user.toObject();
  },

  async updateById(id, updates) {
    const user = await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).lean();

    return user;
  },
};

export default userRepository;
