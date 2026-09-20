import { ValidationError } from "../errors/ValidationError.js";

export function validateCreateOrderBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Request body must be an object.");
  }

  if (typeof body.offerId !== "string" || !body.offerId.trim()) {
    throw new ValidationError("offerId is required.");
  }

  if (body.variant !== undefined && (!body.variant || typeof body.variant !== "object" || Array.isArray(body.variant))) {
    throw new ValidationError("variant must be an object when provided.");
  }

  for (const key of ["size", "color"]) {
    if (body.variant?.[key] !== undefined && (typeof body.variant[key] !== "string" || !body.variant[key].trim())) {
      throw new ValidationError(`${key} must be a non-empty string when provided.`);
    }
  }
}

export default validateCreateOrderBody;