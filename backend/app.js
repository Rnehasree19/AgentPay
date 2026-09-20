import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";

import { isDatabaseConnected } from "./config/database.js";
import authRoutes from "./routes/authRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import productSearchRoutes from "./routes/productSearchRoutes.js";
import commerceRoutes from "./routes/commerceRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { optionalAuthentication } from "./middleware/optionalAuthentication.js";

const frontendDistPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../frontend/dist"
);

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
  app.use(requestLogger);

  // Razorpay webhook signatures are computed over the raw request body, so this
  // route is mounted with express.raw() before the global express.json() parser.
  app.use("/api/webhooks", express.raw({ type: () => true, limit: "1mb" }), webhookRoutes);

  app.use(express.json());
  app.use(optionalAuthentication);

  app.get("/health", (req, res) => {
    const isConnected = isDatabaseConnected();

    res.status(isConnected ? 200 : 503).json({
      success: isConnected,
      status: isConnected ? "ok" : "database-unavailable",
      database: isConnected ? "connected" : "disconnected",
    });
  });

  app.use("/api/chat", chatRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/products", productSearchRoutes);
  app.use("/api/commerce", commerceRoutes);

  app.use(express.static(frontendDistPath));
  app.get("/", (req, res, next) => {
    if (req.path !== "/") return next();

    return res.json({
      message: "AgentPay backend is running",
    });
  });
  app.use((req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || req.path.startsWith("/api/")) {
      return next();
    }

    return res.sendFile(path.join(frontendDistPath, "index.html"), (error) => {
      if (error) next(error);
    });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp();
