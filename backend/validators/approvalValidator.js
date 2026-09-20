import { ValidationError } from "../errors/ValidationError.js";

export function validateApprovalRequestBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Request body must be an object.");
  }

  if (typeof body.offerId !== "string" || !body.offerId.trim()) {
    throw new ValidationError("offerId is required.");
  }
}

export default validateApprovalRequestBody;