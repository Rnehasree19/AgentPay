import AuditEvent from "../models/AuditEvent.js";

export const auditRepository = {
  async create(data) {
    const event = await AuditEvent.create(data);
    return event.toObject();
  },

  async findByEntity(entityType, entityId) {
    return AuditEvent.find({ entityType, entityId }).sort({ createdAt: 1 }).lean();
  },

  async findByUserId(userId) {
    return AuditEvent.find({ userId }).sort({ createdAt: -1 }).lean();
  },
};

export default auditRepository;