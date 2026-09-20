import { AppError } from "./AppError.js";

export class NotFoundError extends AppError {
  constructor(message, details = null) {
    super(message, 404, "NOT_FOUND", details);
  }
}

export default NotFoundError;