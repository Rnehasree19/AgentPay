import { ValidationError } from "../errors/ValidationError.js";

export function validateOfferSelectionRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Request body must be an object.");
  }

  if (typeof body.offerId !== "string" || !body.offerId.trim()) {
    throw new ValidationError("offerId is required.");
  }

  validateVariant(body.variant);

  return true;
}

export function validateVariant(variant) {
  if (variant === undefined || variant === null) {
    return true;
  }

  if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
    throw new ValidationError("variant must be an object.");
  }

  for (const key of ["size", "color"]) {
    if (variant[key] !== undefined && (typeof variant[key] !== "string" || !variant[key].trim())) {
      throw new ValidationError(`${key} must be a non-empty string when provided.`);
    }
  }

  return true;
}

export default validateOfferSelectionRequest;