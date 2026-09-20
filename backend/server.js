import dns from "node:dns";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = createApp();

async function startServer() {
  if (env.MONGODB_URI) {
    try {
      await connectDatabase();
      console.log("MongoDB connected successfully.");
    } catch (error) {
      console.error("MongoDB startup error:", error.message);
      process.exit(1);
    }
  } else {
    console.log("MongoDB not configured. Continuing without database connection.");
  }

  const server = app.listen(env.PORT, () => {
    console.log(`Server running on http://localhost:${env.PORT}`);
  });

  const shutdown = async () => {
    await disconnectDatabase();
    server.close(() => {
      console.log("Server shutdown complete.");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();