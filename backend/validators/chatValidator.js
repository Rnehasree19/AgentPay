import { ValidationError } from "../errors/ValidationError.js";

export function validateChatRequest(body) {
  if (!body) {
    throw new ValidationError("Request body is required.");
  }

  const { messages } = body;

  if (!messages) {
    throw new ValidationError("Messages are required.");
  }

  if (!Array.isArray(messages)) {
    throw new ValidationError("Messages must be an array.");
  }

  if (messages.length === 0) {
    throw new ValidationError("Messages array cannot be empty.");
  }

  for (const [index, message] of messages.entries()) {
    if (!message || typeof message !== "object") {
      throw new ValidationError(
        `Message at index ${index} must be an object.`
      );
    }

    if (!message.role || typeof message.role !== "string") {
      throw new ValidationError(
        `Message at index ${index} must include a valid role.`
      );
    }

    if (!message.content || typeof message.content !== "string") {
      throw new ValidationError(
        `Message at index ${index} must include string content.`
      );
    }
  }

  return true;
}
