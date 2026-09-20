import test from "node:test";
import assert from "node:assert/strict";

import { ProductSearchQuery } from "../services/productSearch/ProductSearchQuery.js";
import { ProductSourceAdapter } from "../services/productSearch/sources/ProductSourceAdapter.js";
import { ProductSourceManager } from "../services/productSearch/ProductSourceManager.js";
import { SearchOrchestrator } from "../services/productSearch/SearchOrchestrator.js";
import { SOURCE_CAPABILITIES, SOURCE_TYPES } from "../services/productSearch/SourceCapabilities.js";
import { InMemorySearchCache, buildSearchCacheKey } from "../services/productSearch/SearchCache.js";
import { validateExternalProductOffer } from "../services/productSearch/ProductOfferValidator.js";
import { SourceAdapterError } from "../services/productSearch/SourceAdapterError.js";
import { UnavailableExternalProductSourceAdapter } from "../services/productSearch/sources/UnavailableExternalProductSourceAdapter.js";
import { BestBuyProductSourceAdapter } from "../services/productSearch/sources/BestBuyProductSourceAdapter.js";

const validOffer = {
  sourceProductId: "external-1",
  title: "External laptop",
  pricePaise: 6999000,
  currency: "INR",
  url: "https://source.example/products/external-1",
  imageUrl: "https://source.example/images/external-1.jpg",
  fetchedAt: new Date().toISOString(),
};

test("external offer validation accepts INR integer paise and timestamps", () => {
  assert.equal(validateExternalProductOffer(validOffer), true);
});

test("external offer validation rejects invalid price, currency, id, and URLs", () => {
  assert.throws(() => validateExternalProductOffer({ ...validOffer, pricePaise: 6999.5 }), /price/i);
  assert.throws(() => validateExternalProductOffer({ ...validOffer, currency: "USD" }), /INR/i);
  assert.throws(() => validateExternalProductOffer({ ...validOffer, sourceProductId: "" }), /identifier/i);
  assert.throws(() => validateExternalProductOffer({ ...validOffer, url: "javascript:alert(1)" }), /URL/i);
});

test("unavailable external source is disabled without credentials", async () => {
  const adapter = new UnavailableExternalProductSourceAdapter({
    sourceCode: "amazon",
    adapterKey: "amazon",
    name: "Amazon official API",
    type: SOURCE_TYPES.API,
  });

  assert.equal(adapter.enabled, false);
  assert.equal(adapter.type, SOURCE_TYPES.API);
  await assert.rejects(() => adapter.search(), (error) => error.code === "SOURCE_NOT_CONFIGURED");
});

test("source capabilities remain explicit and cache entries expire", async () => {
  const adapter = new ProductSourceAdapter({
    sourceCode: "source",
    capabilities: [SOURCE_CAPABILITIES.SEARCH, "UNSUPPORTED"],
  });
  assert.deepEqual(adapter.capabilities, [SOURCE_CAPABILITIES.SEARCH]);

  const cache = new InMemorySearchCache({ ttlMs: 10 });
  const key = buildSearchCacheKey("source", new ProductSearchQuery({ category: "laptop" }));
  cache.set(key, [{ sourceProductId: "cached" }]);
  assert.deepEqual(cache.get(key), [{ sourceProductId: "cached" }]);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(cache.get(key), null);
});

class ClassifiedFailureAdapter extends ProductSourceAdapter {
  constructor(code, error) {
    super({ sourceCode: code, adapterKey: code, enabled: true, type: SOURCE_TYPES.API });
    this.error = error;
  }

  async search() {
    throw this.error;
  }
}

test("authentication and rate-limit failures remain partial source failures", async () => {
  const manager = new ProductSourceManager({
    adapters: [
      new ClassifiedFailureAdapter("auth_source", new SourceAdapterError("SOURCE_AUTHENTICATION_FAILED", "Authentication failed")),
      new ClassifiedFailureAdapter("rate_source", Object.assign(new Error("Too many requests"), { statusCode: 429 })),
    ],
  });

  const result = await new SearchOrchestrator({ manager }).search(new ProductSearchQuery({ category: "laptop" }));

  assert.equal(result.partial, true);
  assert.deepEqual(
    result.failedSources.map((source) => source.errorCode).sort(),
    ["SOURCE_AUTHENTICATION_FAILED", "SOURCE_RATE_LIMITED"].sort(),
  );
});

test("Best Buy adapter rejects non-INR offers instead of mislabeling them", () => {
  const adapter = new BestBuyProductSourceAdapter({
    sourceCode: "bestbuy",
    adapterKey: "bestbuy",
    name: "Best Buy",
    enabled: true,
    config: { apiKey: "test-key" },
  });

  const normalized = adapter.normalizeOffer({
    sourceProductId: "12345",
    title: "Dell XPS 13",
    brand: "Dell",
    category: "laptop",
    description: "Thin laptop",
    pricePaise: 6999900,
    currency: "USD",
    rating: 4.7,
    reviewCount: 150,
    availability: "in_stock",
    deliveryInfo: "2-4 days",
    url: "https://www.bestbuy.com/site/dell-xps-13/12345.p?id=12345",
    imageUrl: "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/12345.jpg",
    fetchedAt: new Date().toISOString(),
    attributes: { sourceCurrency: "USD" },
  });

  assert.equal(normalized, null);
});

test("Best Buy adapter registers when enabled with credentials", () => {
  const manager = new ProductSourceManager();
  const adapter = new BestBuyProductSourceAdapter({
    sourceCode: "bestbuy",
    adapterKey: "bestbuy",
    name: "Best Buy",
    enabled: true,
    config: { apiKey: "test-key" },
  });

  manager.register(adapter);
  assert.equal(manager.getAdapterByKey("bestbuy")?.sourceCode, "bestbuy");
});

test("Best Buy adapter is disabled when configuration is missing", async () => {
  const adapter = new BestBuyProductSourceAdapter({
    sourceCode: "bestbuy",
    adapterKey: "bestbuy",
    name: "Best Buy",
    enabled: false,
  });

  assert.equal(adapter.enabled, false);
  await assert.rejects(() => adapter.search({ queryText: "laptop" }), (error) => error.code === "SOURCE_NOT_CONFIGURED");
});