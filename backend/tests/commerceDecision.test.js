import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { createApp } from "../app.js";
import { OfferSelectionService } from "../services/commerce/OfferSelectionService.js";
import { PolicyEngine } from "../services/commerce/PolicyEngine.js";

const offerId = new mongoose.Types.ObjectId().toString();
const userId = new mongoose.Types.ObjectId().toString();
const anotherUserId = new mongoose.Types.ObjectId().toString();
const sourceId = new mongoose.Types.ObjectId().toString();

function makeOffer(overrides = {}) {
  return {
    _id: offerId,
    productId: new mongoose.Types.ObjectId().toString(),
    sourceId,
    title: "Authoritative laptop",
    pricePaise: 6499900,
    currency: "INR",
    availability: "in_stock",
    active: true,
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePolicy(overrides = {}) {
  return {
    userId,
    maxTransactionAmountPaise: 7000000,
    approvalRequiredAbovePaise: 5000000,
    currency: "INR",
    active: true,
    ...overrides,
  };
}

function makeService({ offer = makeOffer(), policy = makePolicy(), source = { code: "demo_store", name: "Demo Source" }, onPolicyLookup } = {}) {
  return new OfferSelectionService({
    offerRepository: { findById: async () => offer },
    sourceRepository: { findById: async () => source },
    policyRepository: {
      findByUserId: async (id) => {
        onPolicyLookup?.(id);
        return policy;
      },
    },
  });
}

test("policy engine blocks missing, inactive, and unavailable offers", () => {
  const engine = new PolicyEngine();
  assert.equal(engine.decide(null, makePolicy()).reasonCode, "OFFER_NOT_FOUND");
  assert.equal(engine.decide(makeOffer({ active: false }), makePolicy()).reasonCode, "OFFER_INACTIVE");
  assert.equal(engine.decide(makeOffer({ availability: "out_of_stock" }), makePolicy()).reasonCode, "OFFER_UNAVAILABLE");
});

test("policy engine blocks missing/inactive policy and currency mismatch", () => {
  const engine = new PolicyEngine();
  assert.equal(engine.decide(makeOffer(), null).reasonCode, "POLICY_NOT_FOUND");
  assert.equal(engine.decide(makeOffer(), makePolicy({ active: false })).reasonCode, "POLICY_INACTIVE");
  assert.equal(engine.decide(makeOffer(), makePolicy({ currency: "USD" })).reasonCode, "CURRENCY_MISMATCH");
});

test("policy engine applies exact integer-paise thresholds", () => {
  const engine = new PolicyEngine();
  const policy = makePolicy();

  assert.equal(engine.decide(makeOffer({ pricePaise: 4999999 }), policy).decision, "ALLOWED");
  assert.equal(engine.decide(makeOffer({ pricePaise: 5000000 }), policy).decision, "ALLOWED");
  assert.equal(engine.decide(makeOffer({ pricePaise: 5000001 }), policy).decision, "APPROVAL_REQUIRED");
  assert.equal(engine.decide(makeOffer({ pricePaise: 7000000 }), policy).decision, "APPROVAL_REQUIRED");
  assert.equal(engine.decide(makeOffer({ pricePaise: 7000001 }), policy).reasonCode, "MAX_TRANSACTION_EXCEEDED");
});

test("valid allowed, approval, and blocked decisions expose stable codes", () => {
  const engine = new PolicyEngine();
  assert.equal(engine.decide(makeOffer({ pricePaise: 4000000 }), makePolicy()).reasonCode, "WITHIN_POLICY");
  assert.equal(engine.decide(makeOffer({ pricePaise: 6000000 }), makePolicy()).reasonCode, "APPROVAL_REQUIRED");
  assert.equal(engine.decide(makeOffer({ pricePaise: 8000000 }), makePolicy()).reasonCode, "MAX_TRANSACTION_EXCEEDED");
});

test("selection uses authoritative offer and authenticated policy identity", async () => {
  let policyLookupId;
  const service = makeService({ onPolicyLookup: (id) => { policyLookupId = id; } });

  const decision = await service.select({
    offerId,
    authenticatedUserId: userId,
    userId: anotherUserId,
    pricePaise: 100,
    currency: "USD",
    availability: "in_stock",
    sourceCode: "fake_source",
    sourceName: "Fake Source",
  });

  assert.equal(policyLookupId, userId);
  assert.equal(decision.decision, "APPROVAL_REQUIRED");
  assert.equal(decision.offer.pricePaise, 6499900);
  assert.equal(decision.offer.currency, "INR");
  assert.equal(decision.offer.sourceCode, "demo_store");
});

test("selection rejects an out-of-stock hoodie size", async () => {
  const service = makeService({
    offer: makeOffer({
      attributes: {
        sizes: ["S", "M", "L"],
        colors: ["black"],
        stock: { S: 0, M: 3, L: 1 },
      },
    }),
  });

  await assert.rejects(
    service.select({
      offerId,
      variant: { size: "S", color: "black" },
      authenticatedUserId: userId,
    }),
    /out of stock/i
  );
});

test("selection fails closed for missing authoritative offer and invalid policy data", async () => {
  const missingService = makeService({ offer: null });
  assert.equal((await missingService.select({ offerId, authenticatedUserId: userId })).reasonCode, "OFFER_NOT_FOUND");

  const invalidPolicyService = makeService({ policy: makePolicy({ maxTransactionAmountPaise: 70.5 }) });
  assert.equal((await invalidPolicyService.select({ offerId, authenticatedUserId: userId })).reasonCode, "POLICY_INVALID");
});

test("commerce endpoint requires server authentication", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const response = await fetch(`http://localhost:${server.address().port}/api/commerce/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId }),
    });

    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.error.code, "AUTHENTICATION_ERROR");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});