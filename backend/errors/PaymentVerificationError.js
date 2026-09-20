import { AppError } from "./AppError.js";

export class PaymentVerificationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, "PAYMENT_VERIFICATION_ERROR", details);
  }
}

export default PaymentVerificationError;