import test from "node:test";
import assert from "node:assert/strict";

import { ProductDeduplicator } from "../services/productSearch/ProductDeduplicator.js";
import { ProductConstraintFilter } from "../services/productSearch/ProductConstraintFilter.js";
import { ProductRankingEngine } from "../services/productSearch/ProductRankingEngine.js";
import { ProductSearchQuery } from "../services/productSearch/ProductSearchQuery.js";
import { SearchOrchestrator } from "../services/productSearch/SearchOrchestrator.js";
import { ProductSourceManager } from "../services/productSearch/ProductSourceManager.js";
import { ProductSourceAdapter } from "../services/productSearch/sources/ProductSourceAdapter.js";
import { createApp } from "../app.js";

class SourceA extends ProductSourceAdapter {
  constructor() {
    super({ sourceCode: "source_a", adapterKey: "source_a", name: "Source A", enabled: true, type: "demo" });
  }

  async search(query) {
    return [
      {
        sourceCode: "source_a",
        sourceProductId: "p-1",
        title: "Lenovo IdeaPad Slim 5 16GB",
        brand: "Lenovo",
        category: "laptop",
        description: "Thin laptop for work.",
        pricePaise: 6500000,
        currency: "INR",
        rating: 4.5,
        reviewCount: 250,
        availability: "in_stock",
        deliveryInfo: "3 days",
        url: "https://demo.agentpay.local/products/laptop/source-a",
        imageUrl: "https://demo.agentpay.local/images/source-a.jpg",
        attributes: { ram: "16GB", storage: "512GB SSD", screen: "14 inch" },
        fetchedAt: new Date("2026-09-01T00:00:00.000Z").toISOString(),
      },
      {
        sourceCode: "source_a",
        sourceProductId: "p-2",
        title: "Sony WH-1000XM5",
        brand: "Sony",
        category: "headphones",
        description: "Noise-cancelling headphones.",
        pricePaise: 2990000,
        currency: "INR",
        rating: 4.8,
        reviewCount: 400,
        availability: "in_stock",
        deliveryInfo: "2 days",
        url: "https://demo.agentpay.local/products/headphones/sony",
        imageUrl: "https://demo.agentpay.local/images/sony.jpg",
        attributes: { wireless: "yes", battery: "30 hours" },
        fetchedAt: new Date("2026-09-02T00:00:00.000Z").toISOString(),
      },
    ];
  }

  async getProduct() {
    return null;
  }
}

class SourceB extends ProductSourceAdapter {
  constructor() {
    super({ sourceCode: "source_b", adapterKey: "source_b", name: "Source B", enabled: true, type: "demo" });
  }

  async search(query) {
    return [
      {
        sourceCode: "source_b",
        sourceProductId: "p-1b",
        title: "LENOVO IdeaPad Slim 5 - 16 GB",
        brand: "lenovo",
        category: "laptop",
        description: "Thin laptop for work.",
        pricePaise: 6350000,
        currency: "INR",
        rating: 4.4,
        reviewCount: 180,
        availability: "limited",
        deliveryInfo: "4 days",
        url: "https://demo.agentpay.local/products/laptop/source-b",
        imageUrl: "https://demo.agentpay.local/images/source-b.jpg",
        attributes: { ram: "16GB", storage: "512GB SSD", screen: "14 inch" },
        fetchedAt: new Date("2026-09-03T00:00:00.000Z").toISOString(),
      },
      {
        sourceCode: "source_b",
        sourceProductId: "p-3",
        title: "Dell XPS 13 16GB",
        brand: "Dell",
        category: "laptop",
        description: "Business laptop.",
        pricePaise: 7600000,
        currency: "INR",
        rating: null,
        reviewCount: null,
        availability: "unknown",
        deliveryInfo: null,
        url: "https://demo.agentpay.local/products/laptop/dell-xps",
        imageUrl: "https://demo.agentpay.local/images/dell-xps.jpg",
        attributes: { ram: "16GB", storage: "512GB SSD", screen: "13.4 inch" },
        fetchedAt: new Date("2026-09-04T00:00:00.000Z").toISOString(),
      },
    ];
  }

  async getProduct() {
    return null;
  }
}

test("Same product from two sources becomes one product group", () => {
  const deduplicator = new ProductDeduplicator();
  const offers = [
    {
      sourceCode: "source_a",
      sourceProductId: "p-1",
      title: "Lenovo IdeaPad Slim 5 16GB",
      brand: "Lenovo",
      category: "laptop",
      description: "Thin laptop for work.",
      pricePaise: 6500000,
      currency: "INR",
      rating: 4.5,
      reviewCount: 250,
      availability: "in_stock",
      url: "https://demo.agentpay.local/products/a",
      imageUrl: "https://demo.agentpay.local/images/a.jpg",
      attributes: { ram: "16GB", storage: "512GB SSD" },
      fetchedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      sourceCode: "source_b",
      sourceProductId: "p-1b",
      title: "LENOVO IdeaPad Slim 5 - 16 GB",
      brand: "lenovo",
      category: "laptop",
      description: "Thin laptop for work.",
      pricePaise: 6350000,
      currency: "INR",
      rating: 4.4,
      reviewCount: 180,
      availability: "limited",
      url: "https://demo.agentpay.local/products/b",
      imageUrl: "https://demo.agentpay.local/images/b.jpg",
      attributes: { ram: "16GB", storage: "512GB SSD" },
      fetchedAt: "2026-09-03T00:00:00.000Z",
    },
  ];

  const result = deduplicator.deduplicate(offers);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].offers.length, 2);
  assert.ok(result.groups[0].productKey.length > 0);
});

test("Two different storage variants remain separate", () => {
  const deduplicator = new ProductDeduplicator();
  const groups = deduplicator.deduplicate([
    { title: "Lenovo IdeaPad Slim 5 16GB 512GB", brand: "Lenovo", category: "laptop", attributes: { ram: "16GB", storage: "512GB SSD" } },
    { title: "Lenovo IdeaPad Slim 5 16GB 1TB", brand: "Lenovo", category: "laptop", attributes: { ram: "16GB", storage: "1TB SSD" } },
  ]).groups;

  assert.equal(groups.length, 2);
});

test("Two different RAM variants remain separate", () => {
  const deduplicator = new ProductDeduplicator();
  const groups = deduplicator.deduplicate([
    { title: "IdeaPad Slim 5", brand: "Lenovo", category: "laptop", attributes: { ram: "8GB", storage: "512GB SSD" } },
    { title: "IdeaPad Slim 5", brand: "Lenovo", category: "laptop", attributes: { ram: "16GB", storage: "512GB SSD" } },
  ]).groups;

  assert.equal(groups.length, 2);
});

test("Different model numbers are not incorrectly merged", () => {
  const deduplicator = new ProductDeduplicator();
  const groups = deduplicator.deduplicate([
    { title: "IdeaPad Slim 5 14", brand: "Lenovo", category: "laptop", attributes: { ram: "16GB", storage: "512GB SSD", model: "82K100" } },
    { title: "IdeaPad Slim 5 14", brand: "Lenovo", category: "laptop", attributes: { ram: "16GB", storage: "512GB SSD", model: "82K200" } },
  ]).groups;

  assert.equal(groups.length, 2);
});

test("Both source offers remain available after deduplication", () => {
  const deduplicator = new ProductDeduplicator();
  const result = deduplicator.deduplicate([
    { sourceCode: "a", sourceProductId: "1", title: "A", brand: "Brand", category: "laptop", pricePaise: 1000, currency: "INR", attributes: { ram: "16GB" } },
    { sourceCode: "b", sourceProductId: "2", title: "A", brand: "Brand", category: "laptop", pricePaise: 900, currency: "INR", attributes: { ram: "16GB" } },
  ]);
  assert.equal(result.groups[0].offers.length, 2);
});

test("Product above max price is rejected", () => {
  const filter = new ProductConstraintFilter();
  const result = filter.filter([
    { pricePaise: 7500000, category: "laptop", brand: "Lenovo", availability: "in_stock", rating: 4.5, attributes: { ram: "16GB" } },
  ], { category: "laptop", maxPricePaise: 7000000 });
  assert.equal(result.accepted.length, 0);
  assert.match(result.rejected[0].reasons.join(" "), /PRICE_ABOVE_MAX/i);
});

test("Product below min price is rejected", () => {
  const filter = new ProductConstraintFilter();
  const result = filter.filter([
    { pricePaise: 1000000, category: "laptop", brand: "Lenovo", availability: "in_stock", rating: 4.5, attributes: { ram: "16GB" } },
  ], { category: "laptop", minPricePaise: 2000000 });
  assert.equal(result.accepted.length, 0);
  assert.match(result.rejected[0].reasons.join(" "), /PRICE_BELOW_MIN/i);
});

test("Category mismatch is rejected", () => {
  const filter = new ProductConstraintFilter();
  const result = filter.filter([
    { category: "phone", brand: "Lenovo", pricePaise: 2000000, availability: "in_stock", attributes: { ram: "8GB" } },
  ], { category: "laptop" });
  assert.equal(result.accepted.length, 0);
});

test("Brand mismatch is rejected when requested", () => {
  const filter = new ProductConstraintFilter();
  const result = filter.filter([
    { category: "laptop", brand: "Dell", pricePaise: 2000000, availability: "in_stock", attributes: { ram: "16GB" } },
  ], { category: "laptop", brand: "Lenovo" });
  assert.equal(result.accepted.length, 0);
});

test("Required attribute mismatch is rejected", () => {
  const filter = new ProductConstraintFilter();
  const result = filter.filter([
    { category: "laptop", brand: "Lenovo", pricePaise: 2000000, availability: "in_stock", attributes: { ram: "8GB" } },
  ], { category: "laptop", attributes: { ram: "16GB" } });
  assert.equal(result.accepted.length, 0);
});

test("Missing required rating does not satisfy a rating requirement", () => {
  const filter = new ProductConstraintFilter();
  const result = filter.filter([
    { category: "laptop", brand: "Lenovo", pricePaise: 2000000, availability: "in_stock", rating: null, attributes: { ram: "16GB" } },
  ], { category: "laptop", ratingMin: 4 });
  assert.equal(result.accepted.length, 0);
});

test("Unknown availability does not satisfy an explicit in-stock requirement", () => {
  const filter = new ProductConstraintFilter();
  const result = filter.filter([
    { category: "laptop", brand: "Lenovo", pricePaise: 2000000, availability: "unknown", attributes: { ram: "16GB" } },
  ], { category: "laptop", availability: "in_stock" });
  assert.equal(result.accepted.length, 0);
});

test("Missing optional data does not cause unrelated rejection", () => {
  const filter = new ProductConstraintFilter();
  const result = filter.filter([
    { category: "laptop", brand: "Lenovo", pricePaise: 2000000, availability: "in_stock", rating: null, attributes: { ram: "16GB" } },
  ], { category: "laptop", maxPricePaise: 3000000 });
  assert.equal(result.accepted.length, 1);
});

test("Cheapest valid candidate receives the strongest price component", () => {
  const engine = new ProductRankingEngine();
  const ranked = engine.rank([
    { productKey: "a", title: "A", category: "laptop", brand: "Lenovo", pricePaise: 6000000, rating: 4.5, reviewCount: 100, availability: "in_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
    { productKey: "b", title: "B", category: "laptop", brand: "Lenovo", pricePaise: 8000000, rating: 4.5, reviewCount: 100, availability: "in_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
  ], { attributes: { ram: "16GB" } });
  assert.ok(ranked[0].score >= ranked[1].score);
  assert.match(ranked[0].rankingReasons.join(" "), /price/i);
});

test("Higher rating improves ranking when other factors are comparable", () => {
  const engine = new ProductRankingEngine();
  const ranked = engine.rank([
    { productKey: "a", title: "A", category: "laptop", brand: "Lenovo", pricePaise: 7000000, rating: 4.2, reviewCount: 100, availability: "in_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
    { productKey: "b", title: "B", category: "laptop", brand: "Lenovo", pricePaise: 7000000, rating: 4.8, reviewCount: 100, availability: "in_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
  ], { attributes: { ram: "16GB" } });
  assert.ok(ranked[0].score >= ranked[1].score);
});

test("Missing rating is handled distinctly from rating 0", () => {
  const engine = new ProductRankingEngine();
  const ranked = engine.rank([
    { productKey: "a", title: "A", category: "laptop", brand: "Lenovo", pricePaise: 7000000, rating: null, reviewCount: null, availability: "in_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
    { productKey: "b", title: "B", category: "laptop", brand: "Lenovo", pricePaise: 7000000, rating: 0, reviewCount: 0, availability: "in_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
  ], { attributes: { ram: "16GB" } });
  assert.notEqual(ranked[0].score, ranked[1].score);
});

test("Attribute match affects ranking", () => {
  const engine = new ProductRankingEngine();
  const ranked = engine.rank([
    { productKey: "a", title: "A", category: "laptop", brand: "Lenovo", pricePaise: 7000000, rating: 4.5, reviewCount: 100, availability: "in_stock", attributes: { ram: "16GB", storage: "512GB SSD" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
    { productKey: "b", title: "B", category: "laptop", brand: "Lenovo", pricePaise: 7000000, rating: 4.5, reviewCount: 100, availability: "in_stock", attributes: { ram: "8GB", storage: "256GB SSD" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
  ], { attributes: { ram: "16GB", storage: "512GB SSD" } });
  assert.ok(ranked[0].score >= ranked[1].score);
});

test("In-stock ranks appropriately relative to unavailable candidates", () => {
  const engine = new ProductRankingEngine();
  const ranked = engine.rank([
    { productKey: "a", title: "A", category: "laptop", brand: "Lenovo", pricePaise: 7000000, rating: 4.5, reviewCount: 100, availability: "out_of_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
    { productKey: "b", title: "B", category: "laptop", brand: "Lenovo", pricePaise: 7000000, rating: 4.5, reviewCount: 100, availability: "in_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
  ], { attributes: { ram: "16GB" } });
  assert.ok(ranked[0].productKey === "b");
});

test("Ranking is deterministic across repeated runs", () => {
  const engine = new ProductRankingEngine();
  const first = engine.rank([
    { productKey: "a", title: "A", category: "laptop", brand: "Lenovo", pricePaise: 6000000, rating: 4.6, reviewCount: 120, availability: "in_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
    { productKey: "b", title: "B", category: "laptop", brand: "Lenovo", pricePaise: 7000000, rating: 4.7, reviewCount: 140, availability: "in_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
  ], { attributes: { ram: "16GB" } });
  const second = engine.rank([
    { productKey: "a", title: "A", category: "laptop", brand: "Lenovo", pricePaise: 6000000, rating: 4.6, reviewCount: 120, availability: "in_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
    { productKey: "b", title: "B", category: "laptop", brand: "Lenovo", pricePaise: 7000000, rating: 4.7, reviewCount: 140, availability: "in_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
  ], { attributes: { ram: "16GB" } });
  assert.deepEqual(first.map((item) => item.productKey), second.map((item) => item.productKey));
});

test("Equal scores use deterministic tie-breaking", () => {
  const engine = new ProductRankingEngine();
  const ranked = engine.rank([
    { productKey: "b", title: "B", category: "laptop", brand: "Lenovo", pricePaise: 7000000, rating: 4.5, reviewCount: 100, availability: "in_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
    { productKey: "a", title: "A", category: "laptop", brand: "Lenovo", pricePaise: 7000000, rating: 4.5, reviewCount: 100, availability: "in_stock", attributes: { ram: "16GB" }, fetchedAt: "2026-09-01T00:00:00.000Z" },
  ], { attributes: { ram: "16GB" } });
  assert.ok(ranked[0].productKey === "a");
});

test("Search endpoint returns ranked results", async () => {
  const app = createApp();
  const server = app.listen(0, async () => {
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/products/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queryText: "laptop", category: "laptop", maxPricePaise: 9000000, limit: 10 })
    });

    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(payload.data?.results));
    assert.ok(payload.data?.metadata);
    server.close();
  });
});

test("Search endpoint reports filtering/deduplication metadata", async () => {
  const app = createApp();
  const server = app.listen(0, async () => {
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/products/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "laptop", maxPricePaise: 9000000, limit: 10 })
    });

    const payload = await response.json();
    assert.ok(payload.data?.metadata?.candidatesReceived >= 0);
    assert.ok(payload.data?.metadata?.productsAfterDeduplication >= 0);
    assert.ok(payload.data?.metadata?.productsAfterFiltering >= 0);
    server.close();
  });
});

test("Existing root route still works", async () => {
  const app = createApp();
  const server = app.listen(0, async () => {
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.match(payload.message, /AgentPay/i);
    server.close();
  });
});

test("Existing chat route still works", async () => {
  const app = createApp();
  const server = app.listen(0, async () => {
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] })
    });
    assert.equal(response.status, 200);
    server.close();
  });
});

test("Existing Google auth route still works", async () => {
  const app = createApp();
  const server = app.listen(0, async () => {
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(response.status, 400);
    server.close();
  });
});

const manager = new ProductSourceManager({ adapters: [new SourceA(), new SourceB()] });
const orchestrator = new SearchOrchestrator({ manager, defaultTimeoutMs: 1500 });
const query = new ProductSearchQuery({ category: "laptop", maxPricePaise: 9000000, limit: 10, attributes: { ram: "16GB" } });

const raw = await orchestrator.search(query);
assert.equal(raw.successfulSources.length, 2);
assert.ok(raw.offers.length >= 2);
