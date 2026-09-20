import Order from "../models/Order.js";

export const orderRepository = {
  async create(data) {
    const order = await Order.create(data);
    return order.toObject();
  },

  async findById(id) {
    return Order.findById(id).lean();
  },

  async findByUserId(userId) {
    return Order.find({ userId }).sort({ createdAt: -1 }).lean();
  },

  async findByUserAndIdempotencyKey(userId, idempotencyKey) {
    return Order.findOne({ userId, idempotencyKey }).lean();
  },

  async transitionFromExpectedState(id, userId, expectedState, nextState) {
    return Order.findOneAndUpdate(
      { _id: id, userId, status: expectedState },
      { $set: { status: nextState } },
      { new: true }
    ).lean();
  },

  async updateState(id, userId, nextState) {
    return Order.findOneAndUpdate(
      { _id: id, userId },
      { $set: { status: nextState } },
      { new: true }
    ).lean();
  },

  async deleteById(id) {
    return Order.deleteOne({ _id: id });
  },
};

export default orderRepository;