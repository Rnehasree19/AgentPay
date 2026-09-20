import { ValidationError } from "../errors/ValidationError.js";

export function validateGoogleLoginBody(body) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body is required.");
  }

  const { credential } = body;

  if (!credential || typeof credential !== "string") {
    throw new ValidationError("Google credential is required.");
  }

  return true;
}

function validateEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validatePasswordAuthBody(body, { requireName = false } = {}) {
  if (!body || typeof body !== "object") throw new ValidationError("Request body is required.");
  const { name, email, password } = body;
  if (requireName && (typeof name !== "string" || !name.trim())) throw new ValidationError("Name is required.");
  if (!validateEmail(email)) throw new ValidationError("A valid email is required.");
  if (typeof password !== "string" || password.length < 6) {
    throw new ValidationError("Password must contain at least 6 characters.");
  }
  return { name: name?.trim(), email: email.trim().toLowerCase(), password };
}
