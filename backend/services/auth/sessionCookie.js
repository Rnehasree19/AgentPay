import { env } from "../../config/env.js";

export function getSessionToken(req) {
  const cookieHeader = req.headers.cookie || "";
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const prefix = `${env.SESSION_COOKIE_NAME}=`;
  const value = cookies.find((cookie) => cookie.startsWith(prefix))?.slice(prefix.length);

  return value ? decodeURIComponent(value) : null;
}

function cookieAttributes() {
  const attributes = [
    "Path=/",
    `Max-Age=${env.SESSION_TTL_SECONDS}`,
    `SameSite=${env.SESSION_COOKIE_SAME_SITE}`,
  ];

  if (env.SESSION_COOKIE_SECURE) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${env.SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; ${cookieAttributes()}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${env.SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=${env.SESSION_COOKIE_SAME_SITE}${env.SESSION_COOKIE_SECURE ? "; Secure" : ""}`
  );
}