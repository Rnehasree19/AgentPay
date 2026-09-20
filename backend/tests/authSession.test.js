import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../app.js";
import { SessionService, hashToken } from "../services/auth/sessionService.js";
import { createRequireAuthentication } from "../middleware/requireAuthentication.js";

function createSessionStore(session = null) {
  const state = { session, deleted: [], updated: [] };

  return {
    state,
    repository: {
      create: async (value) => {
        state.session = { _id: "session-id", ...value };
        return state.session;
      },
      findByTokenHash: async (tokenHash) => state.session?.sessionTokenHash === tokenHash ? state.session : null,
      updateLastUsedAt: async (id, lastUsedAt) => {
        state.updated.push({ id, lastUsedAt });
        return state.session;
      },
      deleteByTokenHash: async (tokenHash) => {
        state.deleted.push(tokenHash);
        if (state.session?.sessionTokenHash === tokenHash) {
          state.session = null;
        }
      },
    },
  };
}

test("session service stores only a hash and returns a safe user", async () => {
  const store = createSessionStore();
  const service = new SessionService({
    sessions: store.repository,
    users: { findById: async () => ({ _id: "user-id", name: "User", email: "user@example.com", role: "user", password: "never-return" }) },
    ttlSeconds: 60,
  });

  const created = await service.createSession("user-id");
  assert.ok(created.token);
  assert.notEqual(store.state.session.sessionTokenHash, created.token);
  assert.equal(store.state.session.token, undefined);
  assert.equal(store.state.session.sessionTokenHash, hashToken(created.token));

  const user = await service.validateSession(created.token);
  assert.deepEqual(user, { id: "user-id", name: "User", email: "user@example.com", role: "user" });
  assert.equal(user.password, undefined);
});

test("missing, invalid, and expired sessions are rejected and expired sessions are deleted", async () => {
  const store = createSessionStore({
    _id: "expired-session",
    sessionTokenHash: hashToken("expired-token"),
    userId: "user-id",
    expiresAt: new Date(Date.now() - 1000),
  });
  const service = new SessionService({
    sessions: store.repository,
    users: { findById: async () => ({ _id: "user-id", name: "User", email: "user@example.com", role: "user" }) },
  });

  assert.equal(await service.validateSession(null), null);
  assert.equal(await service.validateSession("invalid-token"), null);
  assert.equal(await service.validateSession("expired-token"), null);
  assert.deepEqual(store.state.deleted, [hashToken("expired-token")]);
});

test("logout deletes the hashed session", async () => {
  const store = createSessionStore();
  const service = new SessionService({ sessions: store.repository, users: {}, ttlSeconds: 60 });
  await service.createSession("user-id");
  const tokenHash = store.state.session.sessionTokenHash;

  await service.deleteSession("session-token");
  assert.deepEqual(store.state.deleted, [hashToken("session-token")]);
  assert.equal(tokenHash.length, 64);
});

test("authentication middleware populates req.user from a valid session only", async () => {
  let nextValue;
  const middleware = createRequireAuthentication({
    validateSession: async (token) => token === "valid" ? { id: "user-id", email: "user@example.com", role: "user", name: "User" } : null,
  });

  await middleware({ headers: {} }, {}, (error) => { nextValue = error; });
  assert.equal(nextValue.statusCode, 401);

  let request = { headers: { cookie: "agentpay_session=valid" } };
  await middleware(request, {}, (error) => { nextValue = error; });
  assert.equal(nextValue, undefined);
  assert.deepEqual(request.user, { id: "user-id", email: "user@example.com", role: "user", name: "User" });
});

test("credentialed CORS does not return a wildcard origin", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const response = await fetch(`http://localhost:${server.address().port}/`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("/api/auth/me requires authentication and logout is safe without a session", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const baseUrl = `http://localhost:${server.address().port}`;
    const meResponse = await fetch(`${baseUrl}/api/auth/me`);
    const mePayload = await meResponse.json();
    assert.equal(meResponse.status, 401);
    assert.equal(mePayload.error.code, "AUTHENTICATION_ERROR");

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
    assert.equal(logoutResponse.status, 200);
    assert.deepEqual(await logoutResponse.json(), { success: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});