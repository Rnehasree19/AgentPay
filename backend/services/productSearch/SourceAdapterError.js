export class SourceAdapterError extends Error {
  constructor(code, message, { retryable = false, statusCode = null } = {}) {
    super(message);
    this.name = "SourceAdapterError";
    this.code = code;
    this.retryable = retryable;
    this.statusCode = statusCode;
  }
}

export default SourceAdapterError;