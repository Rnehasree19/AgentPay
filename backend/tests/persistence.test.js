import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { OfferSelectionService } from "../services/commerce/OfferSelectionService.js";
import { ProductPersistenceService } from "../services/productSearch/ProductPersistenceService.js";
import { ProductSearchQuery } from "../services/productSearch/ProductSearchQuery.js";
import { ProductSourceAdapter } from "../services/productSearch/sources/ProductSourceAdapter.js";
import { ProductSourceManager } from "../services/productSearch/ProductSourceManager.js";
import { SearchOrchestrator } from "../services/productSearch/SearchOrchestrator.js";

function createRepositories() {
  const state = {
    products: new Map(),
    sources: new Map(),
    offers: new Map(),
    searches: [],
    searchResults: [],
  };

  const repositories = {
    products: {
      upsertByCanonicalKey: async (canonicalKey, data) => {
        const existing = state.products.get(canonicalKey);
        const product = { _id: existing?._id || new mongoose.Types.ObjectId(), ...data, canonicalKey };
        state.products.set(canonicalKey, product);
        return product;
      },
    },
    sources: {
      upsertByCode: async (code, data) => {
        const existing = state.sources.get(code);
        const source = { _id: existing?._id || new mongoose.Types.ObjectId(), ...data, code };
        state.sources.set(code, source);
        return source;
      },
    },
    offers: {
      upsertBySourceProduct: async (sourceId, sourceProductId, data) => {
        const key = `${sourceId}:${sourceProductId}`;
        const existing = state.offers.get(key);
        const offer = {
          _id: existing?._id || new mongoose.Types.ObjectId(),
          sourceId,
          sourceProductId,
          ...data,
        };
        state.offers.set(key, offer);
        return offer;
      },
    },
    searches: {
      create: async (data) => {
        const search = { _id: new mongoose.Types.ObjectId(), ...data };
        state.searches.push(search);
        return search;
      },
    },
    searchResults: {
      createMany: async (data) => {
        state.searchResults.push(...data);
        return data;
      },
    },
  };

  return { state, repositories };
}

function offer(overrides = {}) {
  return {
    sourceCode: "demo_store",
    sourceName: "Demo Source",
    sourceType: "demo",
    sourceProductId: "demo-1",
    title: "AgentPay Studio 14",
    brand: "AgentPay Labs",
    category: "laptop",
    description: "Developer laptop",
    pricePaise: 6499900,
    currency: "INR",
    rating: 4.6,
    reviewCount: 240,
    availability: "in_stock",
    url: "https://demo.agentpay.local/products/laptop/studio-14",
    imageUrl: "https://demo.agentpay.local/images/laptop-studio-14.jpg",
    attributes: { ram: "16GB", storage: "512GB SSD" },
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createPersistence() {
  const setup = createRepositories();
  const service = new ProductPersistenceService({
    ...setup.repositories,
    database: { isConnected: () => true },
  });
  return { ...setup, service };
}

test("new offer creates canonical Product, ProductSource, and ProductOffer", async () => {
  const { state, service } = createPersistence();
  const persisted = await service.persistOffer(offer());

  assert.equal(state.products.size, 1);
  assert.equal(state.sources.size, 1);
  assert.equal(state.offers.size, 1);
  assert.ok(persisted._id);
  assert.equal(String(persisted.sourceId), String([...state.sources.values()][0]._id));
  assert.equal(String(persisted.productId), String([...state.products.values()][0]._id));
});

test("repeated source offer updates one ProductOffer and preserves its id", async () => {
  const { state, service } = createPersistence();
  const first = await service.persistOffer(offer());
  const second = await service.persistOffer(offer({ pricePaise: 6299900, availability: "limited" }));

  assert.equal(state.offers.size, 1);
  assert.equal(String(second._id), String(first._id));
  assert.equal(second.pricePaise, 6299900);
  assert.equal(second.availability, "limited");
});

test("different sources and source product ids remain separate offers", async () => {
  const { state, service } = createPersistence();
  await service.persistOffer(offer({ sourceProductId: "a" }));
  await service.persistOffer(offer({ sourceCode: "other_store", sourceName: "Other Store", sourceProductId: "b" }));

  assert.equal(state.offers.size, 2);
  assert.equal(state.sources.size, 2);
});

test("variant attributes produce separate canonical products", async () => {
  const { state, service } = createPersistence();
  await service.persistOffer(offer({ attributes: { ram: "16GB", storage: "512GB SSD" } }));
  await service.persistOffer(offer({ sourceProductId: "demo-2", attributes: { ram: "8GB", storage: "256GB SSD" } }));

  assert.equal(state.products.size, 2);
});

test("invalid source data is rejected before repository persistence", async () => {
  const { state, service } = createPersistence();
  await assert.rejects(() => service.persistOffer(offer({ pricePaise: 6499.5 })), /price/i);
  await assert.rejects(() => service.persistOffer(offer({ currency: "USD" })), /INR/i);
  await assert.rejects(() => service.persistOffer(offer({ sourceProductId: "" })), /identifier/i);
  await assert.rejects(() => service.persistOffer(offer({ url: "javascript:alert(1)" })), /URL/i);
  assert.equal(state.products.size, 0);
  assert.equal(state.sources.size, 0);
  assert.equal(state.offers.size, 0);
});

test("search and SearchResult records reference persisted offers", async () => {
  const { state, service } = createPersistence();
  const persisted = await service.persistOffer(offer());
  const result = await service.persistSearch({
    userId: new mongoose.Types.ObjectId().toString(),
    originalQuery: "laptop under 70000",
    structuredQuery: { category: "laptop", maxPricePaise: 7000000 },
    rankedResults: [{
      rank: 1,
      score: 0.9,
      rankingReasons: ["Within budget"],
      offers: [persisted],
    }],
  });

  assert.equal(state.searches.length, 1);
  assert.equal(state.searchResults.length, 1);
  assert.equal(String(state.searchResults[0].offerId), String(persisted._id));
  assert.equal(result.searchResults[0].rank, 1);
});

test("persistence failure is surfaced instead of claiming success", async () => {
  const service = new ProductPersistenceService({ database: { isConnected: () => false } });
  await assert.rejects(() => service.persistOffer(offer()), (error) => error.code === "PERSISTENCE_UNAVAILABLE");
});

class PersistedDemoAdapter extends ProductSourceAdapter {
  constructor() {
    super({ sourceCode: "demo_store", adapterKey: "demo_store", name: "Demo Source", type: "demo" });
  }

  async search() {
    return [offer()];
  }
}

test("orchestrator returned offer id resolves through OfferSelectionService", async () => {
  const { state, repositories, service } = createPersistence();
  const manager = new ProductSourceManager({ adapters: [new PersistedDemoAdapter()] });
  const orchestrator = new SearchOrchestrator({ manager, persistenceService: service });
  const result = await orchestrator.search(new ProductSearchQuery({ category: "laptop" }), { originalQuery: "laptop" });
  const returnedOffer = result.results[0].offers[0];

  const selection = new OfferSelectionService({
    offerRepository: { findById: async (id) => [...state.offers.values()].find((item) => String(item._id) === String(id)) },
    sourceRepository: { findById: async (id) => [...state.sources.values()].find((item) => String(item._id) === String(id)) },
    policyRepository: { findByUserId: async () => ({ active: true, currency: "INR", maxTransactionAmountPaise: 7000000, approvalRequiredAbovePaise: 7000000 }) },
  });

  const decision = await selection.select({ offerId: returnedOffer._id, authenticatedUserId: new mongoose.Types.ObjectId().toString() });
  assert.equal(String(returnedOffer._id), String(decision.offer.offerId));
  assert.equal(decision.reasonCode, "WITHIN_POLICY");
  assert.ok(state.searches.length === 1);
  assert.ok(state.searchResults.length === 1);
  assert.ok(repositories);
});