import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { ProductSearchQuery } from "../services/productSearch/ProductSearchQuery.js";
import { ShoppingResponseFormatter } from "../services/chat/ShoppingResponseFormatter.js";
import { ProductSourceAdapter } from "../services/productSearch/sources/ProductSourceAdapter.js";
import { DemoProductSourceAdapter } from "../services/productSearch/sources/DemoProductSourceAdapter.js";
import { HoodieCatalogSourceAdapter } from "../services/productSearch/sources/HoodieCatalogSourceAdapter.js";
import { ProductSourceManager } from "../services/productSearch/ProductSourceManager.js";
import { SearchOrchestrator } from "../services/productSearch/SearchOrchestrator.js";
import { ValidationError } from "../errors/ValidationError.js";

class FakeSuccessAdapter extends ProductSourceAdapter {
  constructor(code = "fake_success") {
    super({
      sourceCode: code,
      adapterKey: code,
      name: `${code} source`,
      enabled: true,
      type: "demo",
    });
  }

  async search(query) {
    return [
      {
        sourceCode: this.sourceCode,
        sourceProductId: `${this.sourceCode}-p1`,
        title: "Fake Product",
        brand: "FakeBrand",
        category: query.category || "laptop",
        description: "A deterministic fake product.",
        pricePaise: 500000,
        currency: "INR",
        rating: null,
        reviewCount: null,
        availability: "in_stock",
        deliveryInfo: "2-3 days",
        url: "https://demo.agentpay.local/products/fake-product",
        imageUrl: "https://demo.agentpay.local/images/fake-product.jpg",
        attributes: { ram: "16GB" },
        fetchedAt: new Date().toISOString(),
      },
    ];
  }

  async getProduct(sourceProductId) {
    return {
      sourceCode: this.sourceCode,
      sourceProductId,
      title: "Fake Product",
      brand: "FakeBrand",
      category: "laptop",
      description: "A deterministic fake product.",
      pricePaise: 500000,
      currency: "INR",
      rating: null,
      reviewCount: null,
      availability: "in_stock",
      deliveryInfo: "2-3 days",
      url: "https://demo.agentpay.local/products/fake-product",
      imageUrl: "https://demo.agentpay.local/images/fake-product.jpg",
      attributes: { ram: "16GB" },
      fetchedAt: new Date().toISOString(),
    };
  }
}

class FakeFailingAdapter extends ProductSourceAdapter {
  constructor(code = "fake_fail") {
    super({
      sourceCode: code,
      adapterKey: code,
      name: `${code} source`,
      enabled: true,
      type: "external",
    });
  }

  async search() {
    throw new Error("simulated source failure");
  }

  async getProduct() {
    throw new Error("simulated source failure");
  }
}

class FakeTimeoutAdapter extends ProductSourceAdapter {
  constructor(code = "fake_timeout") {
    super({
      sourceCode: code,
      adapterKey: code,
      name: `${code} source`,
      enabled: true,
      type: "external",
    });
  }

  async search() {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return [];
  }

  async getProduct() {
    return null;
  }
}

test("DEMO adapter returns deterministic results", async () => {
  const adapter = new DemoProductSourceAdapter();
  const results = await adapter.search(new ProductSearchQuery({ queryText: "laptop", limit: 5 }));

  assert.ok(results.length > 0);
  assert.equal(results[0].sourceCode, "demo_store");
  assert.ok(results[0].url.startsWith("https://demo.agentpay.local/"));
  assert.equal(Number.isInteger(results[0].pricePaise), true);
  assert.equal(results[0].currency, "INR");
});

test("DEMO adapter filters by max price", async () => {
  const adapter = new DemoProductSourceAdapter();
  const results = await adapter.search(new ProductSearchQuery({ maxPricePaise: 2500000 }));

  assert.ok(results.every((item) => item.pricePaise <= 2500000));
});

test("DEMO adapter filters by category", async () => {
  const adapter = new DemoProductSourceAdapter();
  const results = await adapter.search(new ProductSearchQuery({ category: "headphones" }));

  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.category === "headphones"));
});

test("Hoodie catalog adapter maps catalog documents into search offers", async () => {
  const fakeRecords = [
    {
      _id: new mongoose.Types.ObjectId(),
      title: "Northline Oversized Hoodie",
      brand: "Northline",
      category: "hoodie",
      description: "Heavyweight cotton hoodie with oversized fit.",
      pricePaise: 249900,
      currency: "INR",
      rating: 4.8,
      reviewCount: 120,
      availability: "in_stock",
      sizes: ["S", "M", "L", "XL"],
      colors: ["black", "stone"],
      stock: { S: 5, M: 7, L: 4, XL: 2 },
      material: "cotton",
      imageUrl: "https://example.com/hoodie-oversized.jpg",
      url: "https://example.com/products/northline-oversized-hoodie",
      slug: "northline-oversized-hoodie",
      attributes: { fit: "oversized", color: "black", fabric: "cotton fleece" },
      active: true,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      title: "Harbor Zip Hoodie",
      brand: "Harbor & Co",
      category: "hoodie",
      description: "Premium zip hoodie for cooler evenings.",
      pricePaise: 329900,
      currency: "INR",
      rating: 4.7,
      reviewCount: 82,
      availability: "limited",
      sizes: ["M", "L"],
      colors: ["olive", "sand"],
      stock: { M: 3, L: 1 },
      material: "polyester blend",
      imageUrl: "https://example.com/zip-hoodie.jpg",
      url: "https://example.com/products/harbor-zip-hoodie",
      slug: "harbor-zip-hoodie",
      attributes: { fit: "regular", color: "olive", fabric: "polyester blend" },
      active: true,
    },
  ];

  const adapter = new HoodieCatalogSourceAdapter({
    productModel: {
      async find() {
        return fakeRecords;
      },
    },
  });

  const results = await adapter.search(new ProductSearchQuery({ category: "hoodie", queryText: "oversized", limit: 10 }));

  assert.equal(results.length, 1);
  assert.equal(results[0].category, "hoodie");
  assert.equal(results[0].brand, "Northline");
  assert.deepEqual(results[0].attributes.sizes, ["S", "M", "L", "XL"]);
  assert.ok(results[0].sourceProductId.length > 0);
});

const hoodieFilterRecords = [
  {
    _id: new mongoose.Types.ObjectId(),
    title: "Black Core Hoodie",
    brand: "Test Brand",
    category: "hoodie",
    description: "Black hoodie",
    pricePaise: 249900,
    currency: "INR",
    sizes: ["S", "M", "L"],
    colors: ["Black", "Stone"],
    stock: { S: 2, M: 3, L: 1 },
    tags: ["core"],
    imageUrl: "https://images.example.test/black.jpg",
    url: "https://shop.example.test/black",
    active: true,
  },
  {
    _id: new mongoose.Types.ObjectId(),
    title: "Blue XL Hoodie",
    brand: "Test Brand",
    category: "hoodie",
    description: "Blue hoodie",
    pricePaise: 289900,
    currency: "INR",
    sizes: ["L", "XL"],
    colors: ["blue"],
    stock: { L: 2, XL: 2 },
    tags: ["blue"],
    imageUrl: "https://images.example.test/blue.jpg",
    url: "https://shop.example.test/blue",
    active: true,
  },
  {
    _id: new mongoose.Types.ObjectId(),
    title: "Sand M Hoodie",
    brand: "Test Brand",
    category: "hoodie",
    description: "Sand hoodie",
    pricePaise: 219900,
    currency: "INR",
    sizes: ["M"],
    colors: ["sand", "cream"],
    stock: { M: 4 },
    tags: ["sand"],
    imageUrl: "https://images.example.test/sand.jpg",
    url: "https://shop.example.test/sand",
    active: true,
  },
];

function createHoodieFilterAdapter() {
  return new HoodieCatalogSourceAdapter({
    productModel: {
      async find() {
        return hoodieFilterRecords;
      },
    },
  });
}

test("hoodie color filter is a case-insensitive hard filter", async () => {
  const results = await createHoodieFilterAdapter().search(new ProductSearchQuery({
    category: "hoodie",
    attributes: { color: "BLACK" },
  }));

  assert.deepEqual(results.map((item) => item.title), ["Black Core Hoodie"]);
});

test("hoodie color and size filters both apply", async () => {
  const results = await createHoodieFilterAdapter().search(new ProductSearchQuery({
    category: "hoodie",
    attributes: { color: "black", size: "M" },
  }));

  assert.deepEqual(results.map((item) => item.title), ["Black Core Hoodie"]);
});

test("hoodie blue color filter excludes unrelated colors", async () => {
  const results = await createHoodieFilterAdapter().search(new ProductSearchQuery({
    category: "hoodie",
    attributes: { color: "blue" },
  }));

  assert.deepEqual(results.map((item) => item.title), ["Blue XL Hoodie"]);
});

test("nonexistent hoodie color returns no products", async () => {
  const results = await createHoodieFilterAdapter().search(new ProductSearchQuery({
    category: "hoodie",
    attributes: { color: "magenta" },
  }));

  assert.equal(results.length, 0);
});

test("hoodie size-only filter is a hard filter", async () => {
  const results = await createHoodieFilterAdapter().search(new ProductSearchQuery({
    category: "hoodie",
    attributes: { size: "XL" },
  }));

  assert.deepEqual(results.map((item) => item.title), ["Blue XL Hoodie"]);
});

test("hoodie price and color filters combine", async () => {
  const results = await createHoodieFilterAdapter().search(new ProductSearchQuery({
    category: "hoodie",
    maxPricePaise: 250000,
    attributes: { color: "black" },
  }));

  assert.deepEqual(results.map((item) => item.title), ["Black Core Hoodie"]);
});

test("SearchOrchestrator succeeds when all sources succeed", async () => {
  const manager = new ProductSourceManager();
  manager.register(new FakeSuccessAdapter("source_a"));
  manager.register(new FakeSuccessAdapter("source_b"));

  const orchestrator = new SearchOrchestrator({ manager, defaultTimeoutMs: 1500 });
  const result = await orchestrator.search(new ProductSearchQuery({ queryText: "gaming laptop", limit: 10 }));

  assert.equal(result.partial, false);
  assert.equal(result.successfulSources.length, 2);
  assert.equal(result.failedSources.length, 0);
  assert.ok(result.offers.length >= 2);
});

test("SearchOrchestrator returns partial results when one source fails", async () => {
  const manager = new ProductSourceManager();
  manager.register(new FakeSuccessAdapter("source_a"));
  manager.register(new FakeFailingAdapter("source_b"));

  const orchestrator = new SearchOrchestrator({ manager, defaultTimeoutMs: 1500 });
  const result = await orchestrator.search(new ProductSearchQuery({ queryText: "laptop", limit: 10 }));

  assert.equal(result.partial, true);
  assert.equal(result.successfulSources.length, 1);
  assert.equal(result.failedSources.length, 1);
  assert.ok(result.offers.length > 0);
});

test("SearchOrchestrator handles a source timeout", async () => {
  const manager = new ProductSourceManager();
  manager.register(new FakeTimeoutAdapter("slow_source"));

  const orchestrator = new SearchOrchestrator({ manager, defaultTimeoutMs: 50 });
  const result = await orchestrator.search(new ProductSearchQuery({ queryText: "laptop", limit: 5 }));

  assert.equal(result.partial, true);
  assert.equal(result.successfulSources.length, 0);
  assert.equal(result.failedSources.length, 1);
  assert.equal(result.failedSources[0].errorCode, "SOURCE_TIMEOUT");
});

test("Unknown adapter key is handled cleanly", () => {
  const manager = new ProductSourceManager();

  assert.equal(manager.getAdapterByKey("missing-source"), null);
  assert.equal(manager.getAdapterByKey("demo_store"), null);
});

test("Invalid search query is rejected", () => {
  assert.throws(() => ProductSearchQuery.validate({ minPricePaise: -1 }), /must not be negative/i);
  assert.throws(() => ProductSearchQuery.validate({ maxPricePaise: -10 }), /must not be negative/i);
  assert.throws(() => ProductSearchQuery.validate({ minPricePaise: 400, maxPricePaise: 200 }), /must not exceed/i);
});

test("limit cannot exceed the configured maximum", () => {
  assert.throws(() => ProductSearchQuery.validate({ limit: 5000 }), /must not exceed/i);
});

test("persisted product-offer ids survive persistence, deduplication, ranking, and formatter output", () => {
  const offerId = new mongoose.Types.ObjectId().toString();
  const formatter = new ShoppingResponseFormatter();

  const sourceOffer = {
    _id: offerId,
    sourceCode: "demo_store",
    sourceProductId: "demo-laptop-001",
    title: "AgentPay Studio 14",
    brand: "AgentPay Labs",
    category: "laptop",
    pricePaise: 6499900,
    currency: "INR",
    rating: 4.8,
    reviewCount: 210,
    availability: "in_stock",
    attributes: { ram: "16GB", usage: "coding" },
    url: "https://demo.agentpay.local/products/laptop/studio-14",
    imageUrl: "https://demo.agentpay.local/images/studio-14.jpg",
    fetchedAt: "2026-09-01T00:00:00.000Z",
    active: true,
  };

  const result = {
    results: [{
      rank: 1,
      score: 0.97,
      rankingReasons: ["Competitive price", "Matches requested attributes"],
      product: {
        productKey: "demo-laptop-001",
        title: "AgentPay Studio 14",
        brand: "AgentPay Labs",
        category: "laptop",
        pricePaise: 6499900,
        currency: "INR",
        rating: 4.8,
        reviewCount: 210,
        availability: "in_stock",
        attributes: { ram: "16GB", usage: "coding" },
        sourceCode: "demo_store",
        sourceProductId: "demo-laptop-001",
      },
      offers: [sourceOffer],
    }],
  };

  const formatted = formatter.format(result);

  assert.equal(formatted.results.length, 1);
  assert.equal(formatted.results[0].offerId, offerId);
  assert.match(formatted.results[0].offerId, /^[0-9a-fA-F]{24}$/);
  assert.equal(mongoose.isValidObjectId(formatted.results[0].offerId), true);
  assert.equal(formatted.results[0].title, "AgentPay Studio 14");
  assert.equal(formatted.results[0].pricePaise, 6499900);
  assert.equal(formatted.results[0].rating, 4.8);

  const missingId = formatter.format({
    results: [{
      rank: 1,
      score: 0.92,
      rankingReasons: ["best match"],
      product: { productKey: "demo-laptop-unsafe", title: "Laptop without persisted id", pricePaise: 599000, currency: "INR" },
      offers: [{
        title: "Laptop without persisted id",
        pricePaise: 599000,
        currency: "INR",
        sourceCode: "demo_store",
        url: "https://demo.agentpay.local/products/laptop-no-id",
      }],
    }],
  });

  assert.equal(missingId.results.length, 0);
  assert.equal(missingId.results.some((item) => typeof item?.offerId === "string" && item.offerId.includes(":")), false);
});

test("No arbitrary URL fetching exists", () => {
  assert.throws(() => ProductSearchQuery.validate({ queryText: "laptop", url: "https://evil.example/fetch" }), /unsupported/i);
  const adapter = new DemoProductSourceAdapter();
  const results = adapter.items.filter((item) => item.url.startsWith("https://demo.agentpay.local/"));
  assert.ok(results.length > 0);
});
