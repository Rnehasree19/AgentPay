import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { DEFAULT_USER_POLICY, UserPolicyService } from "../services/auth/UserPolicyService.js";
import { PolicyEngine } from "../services/commerce/PolicyEngine.js";
import { createGoogleLoginHandler } from "../controllers/authController.js";

const userId = new mongoose.Types.ObjectId().toString();

function createPolicyRepository({ existing = null, createError = null } = {}) {
  const state = { policy: existing, createCalls: 0 };

  return {
    state,
    repository: {
      findByUserId: async () => state.policy,
      create: async (data) => {
        state.createCalls += 1;
        if (createError) throw createError;
        state.policy = { _id: new mongoose.Types.ObjectId(), ...data };
        return state.policy;
      },
    },
  };
}

test("new user without a policy receives the default policy", async () => {
  const harness = createPolicyRepository();
  const policy = await new UserPolicyService({ policies: harness.repository }).ensureDefaultUserPolicy(userId);

  assert.equal(policy.currency, "INR");
  assert.equal(policy.maxTransactionAmountPaise, 10000000);
  assert.equal(policy.approvalRequiredAbovePaise, 5000000);
  assert.equal(policy.active, true);
  assert.equal(harness.state.createCalls, 1);
});

test("existing policy is preserved without overwrite", async () => {
  const existing = {
    _id: new mongoose.Types.ObjectId(),
    userId,
    currency: "USD",
    maxTransactionAmountPaise: 200000,
    approvalRequiredAbovePaise: 150000,
    active: false,
  };
  const harness = createPolicyRepository({ existing });
  const policy = await new UserPolicyService({ policies: harness.repository }).ensureDefaultUserPolicy(userId);

  assert.deepEqual(policy, existing);
  assert.equal(harness.state.createCalls, 0);
});

test("existing user without a policy receives exactly one policy after a duplicate-key race", async () => {
  const racedPolicy = { _id: new mongoose.Types.ObjectId(), userId, ...DEFAULT_USER_POLICY };
  const harness = createPolicyRepository({ createError: { code: 11000 } });
  let lookupCount = 0;
  harness.repository.findByUserId = async () => {
    lookupCount += 1;
    return lookupCount === 1 ? null : racedPolicy;
  };

  const policy = await new UserPolicyService({ policies: harness.repository }).ensureDefaultUserPolicy(userId);

  assert.deepEqual(policy, racedPolicy);
  assert.equal(harness.state.createCalls, 1);
});

test("default policy requires approval for the demo laptop price", () => {
  const engine = new PolicyEngine();
  const offer = { pricePaise: 6499900, currency: "INR", active: true, availability: "in_stock" };
  const decision = engine.decide(offer, { userId, ...DEFAULT_USER_POLICY });

  assert.equal(decision.decision, "APPROVAL_REQUIRED");
});

test("amount above maximum is blocked", () => {
  const decision = new PolicyEngine().decide(
    { pricePaise: 10000001, currency: "INR", active: true, availability: "in_stock" },
    { userId, ...DEFAULT_USER_POLICY },
  );

  assert.equal(decision.decision, "BLOCKED");
  assert.equal(decision.reasonCode, "MAX_TRANSACTION_EXCEEDED");
});

test("amount below approval threshold is allowed", () => {
  const decision = new PolicyEngine().decide(
    { pricePaise: 4000000, currency: "INR", active: true, availability: "in_stock" },
    { userId, ...DEFAULT_USER_POLICY },
  );

  assert.equal(decision.decision, "ALLOWED");
});

test("Google login provisions a policy before creating the session", async () => {
  const calls = [];
  const handler = createGoogleLoginHandler({
    verifyToken: async () => ({ email: "new-user@example.com", email_verified: true, sub: "google-sub", name: "New User" }),
    users: {
      findByProvider: async () => null,
      findByEmail: async () => null,
      create: async (data) => ({ _id: userId, ...data }),
    },
    policies: {
      ensureDefaultUserPolicy: async (id) => {
        calls.push(["policy", id]);
        return { userId: id, ...DEFAULT_USER_POLICY };
      },
    },
    sessions: {
      createSession: async (id) => {
        calls.push(["session", id]);
        return { token: "session-token" };
      },
    },
  });
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, json(value) { this.body = value; return this; } };

  await handler({ body: { credential: "google-credential" } }, response, (error) => { throw error; });

  assert.deepEqual(calls, [["policy", userId], ["session", userId]]);
  assert.equal(response.body.success, true);
});