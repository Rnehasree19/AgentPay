import mongoose from "mongoose";

import { env } from "./env.js";

export const databaseConfig = {
  enabled: Boolean(env.MONGODB_URI),
  uri: env.MONGODB_URI || null,
};

let isConnected = false;

export async function connectDatabase() {
  if (!databaseConfig.uri) {
    return {
      connected: false,
      status: "not-configured",
    };
  }

  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return {
      connected: true,
      status: "connected",
    };
  }

  try {
    await mongoose.connect(databaseConfig.uri, {
      serverSelectionTimeoutMS: 5000,
    });

    isConnected = true;

    return {
      connected: true,
      status: "connected",
    };
  } catch (error) {
    isConnected = false;
    throw new Error(
      `MongoDB connection failed: ${error.message}`
    );
  }
}

export function isDatabaseConnected() {
  return isConnected || mongoose.connection.readyState === 1;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
  isConnected = false;
}
