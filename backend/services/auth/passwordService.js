import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString("base64url")}:${Buffer.from(derivedKey).toString("base64url")}`;
}

export async function verifyPassword(password, encodedHash) {
  if (typeof encodedHash !== "string") return false;
  const [algorithm, encodedSalt, encodedKey] = encodedHash.split(":");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedKey) return false;

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expectedKey = Buffer.from(encodedKey, "base64url");
    const derivedKey = await scrypt(password, salt, expectedKey.length);
    return crypto.timingSafeEqual(Buffer.from(derivedKey), expectedKey);
  } catch {
    return false;
  }
}