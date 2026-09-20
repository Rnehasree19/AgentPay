export function errorHandler(err, req, res, next) {
  const statusCode = err?.statusCode || 500;
  const code = err?.code || "INTERNAL_SERVER_ERROR";
  const message =
    err?.isOperational || statusCode < 500
      ? err?.message || "Request failed."
      : "Internal server error.";

  const response = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (process.env.NODE_ENV !== "production") {
    response.error.details = err?.details || null;
  }

  console.error("Unhandled error:", {
    method: req.method,
    path: req.path,
    code,
    statusCode,
    message,
    details: err?.details || null,
  });

  res.status(statusCode).json(response);
}
