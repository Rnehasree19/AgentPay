import { AppError } from "./AppError.js";

export class AuthorizationError extends AppError {
  constructor(message, details = null) {
    super(message, 403, "AUTHORIZATION_ERROR", details);
  }
}

export default AuthorizationError;