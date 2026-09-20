export function requestLogger(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();

    const logData = {
      timestamp,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      ...(req.user?.id ? { userId: req.user.id } : {}),
    };

    console.log(JSON.stringify(logData));
  });

  next();
}
