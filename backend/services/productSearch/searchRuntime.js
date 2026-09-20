import { ProductSourceManager } from "./ProductSourceManager.js";
import { SearchOrchestrator } from "./SearchOrchestrator.js";
import { env } from "../../config/env.js";
import { SOURCE_TYPES } from "./SourceCapabilities.js";
import { UnavailableExternalProductSourceAdapter } from "./sources/UnavailableExternalProductSourceAdapter.js";
import { InMemorySearchCache } from "./SearchCache.js";
import { ProductPersistenceService } from "./ProductPersistenceService.js";
import { BestBuyProductSourceAdapter } from "./sources/BestBuyProductSourceAdapter.js";
import Product from "../../models/Product.js";
import { HoodieCatalogSourceAdapter } from "./sources/HoodieCatalogSourceAdapter.js";

function createConfiguredExternalAdapters() {
  const adapters = [];
  const hasAmazonCredentials = Boolean(
    env.AMAZON_CLIENT_ID &&
    env.AMAZON_CLIENT_SECRET &&
    env.AMAZON_PARTNER_TAG &&
    env.AMAZON_MARKETPLACE
  );

  if (env.SOURCE_ENABLED && env.AMAZON_ENABLED && !hasAmazonCredentials) {
    adapters.push(new UnavailableExternalProductSourceAdapter({
      sourceCode: "amazon",
      adapterKey: "amazon",
      name: "Amazon official API",
      type: SOURCE_TYPES.API,
    }));
  }

  if (env.SOURCE_ENABLED && env.BESTBUY_ENABLED) {
    if (env.BESTBUY_API_KEY) {
      adapters.push(new BestBuyProductSourceAdapter({
        sourceCode: "bestbuy",
        adapterKey: "bestbuy",
        name: "Best Buy",
        enabled: true,
        type: SOURCE_TYPES.API,
        config: { apiKey: env.BESTBUY_API_KEY },
      }));
    } else {
      adapters.push(new UnavailableExternalProductSourceAdapter({
        sourceCode: "bestbuy",
        adapterKey: "bestbuy",
        name: "Best Buy Developer API",
        type: SOURCE_TYPES.API,
      }));
    }
  }

  return adapters;
}

const sourceManager = new ProductSourceManager({
  adapters: [
    new HoodieCatalogSourceAdapter({
      productModel: Product,
      sourceCode: "hoodie_catalog",
      adapterKey: "hoodie_catalog",
      name: "AgentPay Hoodie Catalog",
      enabled: true,
      type: SOURCE_TYPES.API,
    }),
    ...createConfiguredExternalAdapters(),
  ],
});

const searchCache = new InMemorySearchCache({ ttlMs: 30000 });
const persistenceService = new ProductPersistenceService();

export function createProductSearchOrchestrator() {
  return new SearchOrchestrator({
    manager: sourceManager,
    defaultTimeoutMs: 1500,
    cache: searchCache,
    persistenceService,
  });
}

export default createProductSearchOrchestrator;