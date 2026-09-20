import mongoose from "mongoose";
import { AUDIT_EVENT_TYPES } from "../services/audit/AuditEventTypes.js";

const auditEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    eventType: { type: String, enum: Object.values(AUDIT_EVENT_TYPES), required: true, index: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: String, required: true, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const AuditEvent = mongoose.model("AuditEvent", auditEventSchema);

export default AuditEvent;