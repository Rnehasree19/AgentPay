import { AppError } from "./AppError.js";

export class ExternalServiceError extends AppError {
  constructor(message, details = null) {
    super(message, 502, "EXTERNAL_SERVICE_ERROR", details);
  }
}
