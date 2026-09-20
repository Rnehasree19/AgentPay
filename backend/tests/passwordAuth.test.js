import test from "node:test";
import assert from "node:assert/strict";

import { createPasswordAuthHandlers, currentUser } from "../controllers/authController.js";
import { createRequireAuthentication } from "../middleware/requireAuthentication.js";
import { hashPassword, verifyPassword } from "../services/auth/passwordService.js";
import { provisionAdminAccount } from "../services/auth/adminProvisioning.js";

function response() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function harness(existingUser = null) {
  const state = { user: existingUser, created: null, session: null };
  const handlers = createPasswordAuthHandlers({
    users: {
      findByEmail: async () => state.user,
      findLocalByEmail: async () => state.user,
      create: async (data) => {
        state.created = data;
        state.user = { _id: "user-id", ...data };
        return state.user;
      },
    },
    policies: { ensureDefaultUserPolicy: async () => ({}) },
    sessions: {
      createSession: async () => {
        state.session = { token: "session-token" };
        return state.session;
      },
    },
  });
  return { state, handlers };
}

test("signup hashes the password, creates a session, and never returns the hash", async () => {
  const { state, handlers } = harness();
  const res = response();
  await handlers.signup({ body: { name: " User ", email: "USER@Example.COM ", password: "secret1" } }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 201);
  assert.equal(state.created.email, "user@example.com");
  assert.match(state.created.passwordHash, /^scrypt:/);
  assert.notEqual(state.created.passwordHash, "secret1");
  assert.equal(res.body.user.passwordHash, undefined);
  assert.match(res.headers["Set-Cookie"], /agentpay_session=.*HttpOnly/);
});

test("duplicate signup returns a conflict error", async () => {
  const { handlers } = harness({ _id: "existing", email: "user@example.com" });
  const res = response();
  let error;
  await handlers.signup({ body: { name: "User", email: "USER@example.com", password: "secret1" } }, res, (value) => { error = value; });
  assert.equal(error.statusCode, 409);
  assert.equal(res.body, undefined);
});

test("login verifies the hash, creates the shared session cookie, and supports /me", async () => {
  const passwordHash = await hashPassword("secret1");
  const { state, handlers } = harness({ _id: "user-id", name: "User", email: "user@example.com", role: "user", passwordHash, authProvider: "local" });
  const res = response();
  await handlers.login({ body: { email: " USER@example.com ", password: "secret1" } }, res, (error) => { throw error; });

  assert.equal(res.body.success, true);
  assert.equal(res.body.user.passwordHash, undefined);
  assert.match(res.headers["Set-Cookie"], /agentpay_session=.*HttpOnly/);

  const middleware = createRequireAuthentication({ validateSession: async (token) => token === state.session.token ? res.body.user : null });
  const req = { headers: { cookie: "agentpay_session=session-token" } };
  await middleware(req, {}, (error) => { if (error) throw error; });
  const me = response();
  currentUser(req, me);
  assert.deepEqual(me.body.user, res.body.user);
});

test("admin local login preserves the admin role", async () => {
  const passwordHash = await hashPassword("admin-test-password");
  const { handlers } = harness({ _id: "admin-id", name: "Admin", email: "adminneha@gmail.com", role: "admin", passwordHash, authProvider: "local" });
  const res = response();

  await handlers.login({ body: { email: "adminneha@gmail.com", password: "admin-test-password" } }, res, (error) => { throw error; });

  assert.equal(res.body.success, true);
  assert.equal(res.body.user.email, "adminneha@gmail.com");
  assert.equal(res.body.user.role, "admin");
  assert.equal(res.body.user.passwordHash, undefined);
});

test("wrong passwords and unknown emails return the same authentication error", async () => {
  const passwordHash = await hashPassword("secret1");
  for (const user of [
    { _id: "user-id", email: "user@example.com", passwordHash },
    null,
  ]) {
    const { handlers } = harness(user);
    const res = response();
    let error;
    await handlers.login({ body: { email: "user@example.com", password: "wrong1" } }, res, (value) => { error = value; });
    assert.equal(error.statusCode, 401);
    assert.equal(error.message, "Invalid email or password.");
  }
});

test("password hashes verify without storing plaintext", async () => {
  const hash = await hashPassword("secret1");
  assert.equal(await verifyPassword("secret1", hash), true);
  assert.equal(await verifyPassword("wrong1", hash), false);
  assert.notEqual(hash, "secret1");
});

test("admin provisioning creates a local admin with a hashed password", async () => {
  let update;
  const result = await provisionAdminAccount({
    email: "adminneha@gmail.com",
    password: "admin-test-password",
    users: {
      findOneAndUpdate: async (filter, updates) => {
        update = { filter, updates };
        return { _id: "admin-id", email: updates.$set.email, role: updates.$set.role };
      },
    },
  });

  assert.equal(result.role, "admin");
  assert.equal(update.filter.email, "adminneha@gmail.com");
  assert.equal(update.updates.$set.authProvider, "local");
  assert.equal(update.updates.$set.role, "admin");
  assert.match(update.updates.$set.passwordHash, /^scrypt:/);
  assert.notEqual(update.updates.$set.passwordHash, "admin-test-password");
});