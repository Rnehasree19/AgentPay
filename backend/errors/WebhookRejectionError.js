import { AppError } from "./AppError.js";

export class WebhookRejectionError extends AppError {
  constructor(reasonCode, message, auditEventType = null, details = null) {
    super(message, 400, "WEBHOOK_REJECTED", details);
    this.reasonCode = reasonCode;
    this.auditEventType = auditEventType;
  }
}

export default WebhookRejectionError;
