import { auditRepository } from "../../repositories/auditRepository.js";

const SENSITIVE_KEY = /(token|secret|password|cookie|authorization|credential)/i;

function sanitize(value) {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, entry]) => [key, sanitize(entry)])
  );
}

export class AuditService {
  constructor({ repository = auditRepository } = {}) {
    this.repository = repository;
  }

  async record({ userId = null, eventType, entityType, entityId, metadata = {} }) {
    return this.repository.create({
      userId: userId || null,
      eventType,
      entityType,
      entityId: String(entityId),
      metadata: sanitize(metadata),
    });
  }
}

export { sanitize as sanitizeAuditMetadata };
export default AuditService;