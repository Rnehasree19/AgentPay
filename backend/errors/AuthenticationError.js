import { AppError } from "./AppError.js";

export class AuthenticationError extends AppError {
  constructor(message, details = null) {
    super(message, 401, "AUTHENTICATION_ERROR", details);
  }
}
