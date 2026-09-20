import { AuthenticationError } from "../../errors/AuthenticationError.js";

export class McpToolError extends Error {
  constructor(message, code = "MCP_TOOL_ERROR", statusCode = 400) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

export function requireAuthenticatedContext(context = {}) {
  if (!context.authenticatedUserId) {
    throw new AuthenticationError("Authentication is required for this MCP tool.");
  }

  return String(context.authenticatedUserId);
}

export default McpToolError;
