import mongoose from "mongoose";

import { env } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import User from "./models/User.js";
import { UserPolicyService } from "./services/auth/UserPolicyService.js";
import { seedHoodieCatalog } from "./seed/hoodieCatalog.js";
import { provisionAdminAccount } from "./services/auth/adminProvisioning.js";

async function seed() {
  const connection = await connectDatabase();

  if (!connection.connected) {
    console.log("MongoDB is not configured. Seed skipped.");
    return;
  }

  const admin = await provisionAdminAccount();
  if (admin.status === "provisioned") {
    console.log(`Provisioned ${admin.role} account: ${admin.email}`);
  } else {
    console.log("Admin provisioning skipped: set ADMIN_PASSWORD to provision the admin account.");
  }

  const demoUser = await User.findOneAndUpdate(
    { email: "demo@example.com" },
    {
      name: "Demo User",
      email: "demo@example.com",
      authProvider: "google",
      providerId: "demo-google-user",
      role: "user",
      picture: "",
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  await new UserPolicyService().ensureDefaultUserPolicy(demoUser._id);
  await seedHoodieCatalog();

  console.log("Seed completed for demo user and hoodie catalog.");
}

seed()
  .then(() => mongoose.disconnect())
  .catch((error) => {
    console.error("Seed failed:", error.message);
    mongoose.disconnect();
    process.exit(1);
  });
