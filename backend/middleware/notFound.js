export function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "Requested resource was not found.",
    },
  });
}
