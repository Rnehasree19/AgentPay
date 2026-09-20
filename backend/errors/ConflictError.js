import { AppError } from "./AppError.js";

export class ConflictError extends AppError {
  constructor(message, details = null) {
    super(message, 409, "CONFLICT_ERROR", details);
  }
}

export default ConflictError;