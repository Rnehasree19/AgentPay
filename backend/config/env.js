import dotenv from "dotenv";

dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 5000,
  AI_MODEL_ID: process.env.AI_MODEL_ID || "onnx-community/Qwen3-0.6B-ONNX",
  AI_DTYPE: process.env.AI_DTYPE || "q4f16",
  AI_MAX_NEW_TOKENS: Number(process.env.AI_MAX_NEW_TOKENS) || 256,
  AI_TIMEOUT_MS: Number(process.env.AI_TIMEOUT_MS) || 120000,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "adminneha@gmail.com",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
  MONGODB_URI: process.env.MONGODB_URI || "",
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME || "agentpay_session",
  SESSION_TTL_SECONDS: Number(process.env.SESSION_TTL_SECONDS) || 60 * 60 * 24 * 7,
  SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
  SESSION_COOKIE_SAME_SITE: process.env.SESSION_COOKIE_SAME_SITE || "lax",
  APPROVAL_TTL_SECONDS: Number(process.env.APPROVAL_TTL_SECONDS) || 60 * 60 * 24,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || "",
  RAZORPAY_TEST_MODE: process.env.RAZORPAY_TEST_MODE === "true",
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  SOURCE_ENABLED: process.env.SOURCE_ENABLED === "true",
  AMAZON_ENABLED: process.env.AMAZON_ENABLED === "true",
  AMAZON_CLIENT_ID: process.env.AMAZON_CLIENT_ID,
  AMAZON_CLIENT_SECRET: process.env.AMAZON_CLIENT_SECRET,
  AMAZON_PARTNER_TAG: process.env.AMAZON_PARTNER_TAG,
  AMAZON_MARKETPLACE: process.env.AMAZON_MARKETPLACE || "IN",
  BESTBUY_ENABLED: process.env.BESTBUY_ENABLED === "true",
  BESTBUY_API_KEY: process.env.BESTBUY_API_KEY || "",
};

const requiredEnv = ["GOOGLE_CLIENT_ID"];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}`
  );
}
