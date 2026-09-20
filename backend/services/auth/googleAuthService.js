import { OAuth2Client } from "google-auth-library";

import { AuthenticationError } from "../../errors/AuthenticationError.js";
import { env } from "../../config/env.js";

export async function verifyGoogleToken(idToken) {
  if (!idToken || typeof idToken !== "string") {
    throw new AuthenticationError("Google credential is required.");
  }

  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });

    return ticket.getPayload();
  } catch (error) {
    throw new AuthenticationError("Google sign-in failed.", {
      originalError: error.message,
    });
  }
}
