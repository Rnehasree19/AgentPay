import crypto from "node:crypto";

import { env } from "../../config/env.js";
import { userRepository } from "../../repositories/userRepository.js";
import { sessionRepository } from "../../repositories/sessionRepository.js";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function toSafeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export class SessionService {
  constructor({ sessions = sessionRepository, users = userRepository, ttlSeconds = env.SESSION_TTL_SECONDS } = {}) {
    this.sessions = sessions;
    this.users = users;
    this.ttlSeconds = ttlSeconds;
  }

  async createSession(userId) {
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    await this.sessions.create({
      userId,
      sessionTokenHash: hashToken(rawToken),
      expiresAt,
      lastUsedAt: now,
    });

    return { token: rawToken, expiresAt };
  }

  async validateSession(token) {
    if (!token || typeof token !== "string") {
      return null;
    }

    const tokenHash = hashToken(token);
    const session = await this.sessions.findByTokenHash(tokenHash);

    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      if (session) {
        await this.sessions.deleteByTokenHash(tokenHash);
      }
      return null;
    }

    await this.sessions.updateLastUsedAt(session._id, new Date());
    return toSafeUser(await this.users.findById(session.userId));
  }

  async deleteSession(token) {
    if (!token || typeof token !== "string") {
      return;
    }

    await this.sessions.deleteByTokenHash(hashToken(token));
  }
}

export { hashToken };
export default SessionService;