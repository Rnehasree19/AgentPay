const SERVER_ME_URL = "/api/auth/me";
const SERVER_LOGOUT_URL = "/api/auth/logout";
const SERVER_SIGNUP_URL = "/api/auth/signup";
const SERVER_LOGIN_URL = "/api/auth/login";
const SERVER_ADMIN_USERS_URL = "/api/auth/admin/users";

async function postAuth(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        "Authentication failed. Please try again."
    );
  }

  return payload;
}

export const signup = (body) =>
  postAuth(SERVER_SIGNUP_URL, body);

export const login = (email, password) =>
  postAuth(SERVER_LOGIN_URL, {
    email,
    password,
  });

export async function getAdminUsers() {
  const response = await fetch(SERVER_ADMIN_USERS_URL, {
    credentials: "include",
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.error?.message || "Could not load users."
    );
  }

  return payload.users || [];
}

export async function getServerCurrentUser() {
  try {
    const response = await fetch(SERVER_ME_URL, {
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();

    return payload?.user || null;
  } catch {
    return null;
  }
}

export async function logoutServer() {
  const response = await fetch(SERVER_LOGOUT_URL, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Logout failed. Please try again.");
  }
}