import User from "../../models/User.js";
import { env } from "../../config/env.js";
import { hashPassword } from "./passwordService.js";

const DEFAULT_ADMIN_NAME = "AgentPay Admin";

export async function provisionAdminAccount({
  users = User,
  email = env.ADMIN_EMAIL,
  password = env.ADMIN_PASSWORD,
  name = DEFAULT_ADMIN_NAME,
} = {}) {
  if (!password) {
    return { status: "skipped", reason: "ADMIN_PASSWORD is not configured." };
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  const query = users.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        name,
        email: normalizedEmail,
        authProvider: "local",
        passwordHash,
        role: "admin",
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const user = typeof query.lean === "function" ? await query.lean() : await query;

  return { status: "provisioned", userId: String(user._id), email: user.email, role: user.role };
}