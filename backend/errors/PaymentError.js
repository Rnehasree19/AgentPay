import { AppError } from "./AppError.js";

export class PaymentError extends AppError {
  constructor(message, details = null) {
    super(message, 502, "PAYMENT_ERROR", details);
  }
}

export default PaymentError;