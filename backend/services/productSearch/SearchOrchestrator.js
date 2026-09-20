import { createSourceFailureResult, createSourceSuccessResult } from "./SourceExecutionResult.js";
import { normalizeProductOffer } from "./NormalizedProductOffer.js";
import { ProductSearchQuery } from "./ProductSearchQuery.js";
import { ProductDeduplicator } from "./ProductDeduplicator.js";
import { ProductConstraintFilter } from "./ProductConstraintFilter.js";
import { ProductRankingEngine } from "./ProductRankingEngine.js";
import { buildSearchCacheKey } from "./SearchCache.js";

const DEFAULT_TIMEOUT_MS = 1500;

export class SearchOrchestrator {
  constructor({ manager, defaultTimeoutMs = DEFAULT_TIMEOUT_MS, cache = null, persistenceService = null } = {}) {
    this.manager = manager;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.deduplicator = new ProductDeduplicator();
    this.filter = new ProductConstraintFilter();
    this.rankingEngine = new ProductRankingEngine();
    this.cache = cache;
    this.persistenceService = persistenceService;
  }

  withTimeout(promiseFactory, timeoutMs) {
    const timeoutDuration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : this.defaultTimeoutMs;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("SOURCE_TIMEOUT"));
      }, timeoutDuration);

      promiseFactory()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  async search(inputQuery, context = {}) {
    const query = inputQuery instanceof ProductSearchQuery ? inputQuery : new ProductSearchQuery(inputQuery);
    const adapters = this.manager?.getEnabledAdapters?.() || [];

    const settled = await Promise.allSettled(
      adapters.map(async (adapter) => {
        const startedAt = Date.now();

        try {
          const cacheKey = buildSearchCacheKey(adapter.sourceCode || adapter.adapterKey, query);
          const cached = this.cache?.get?.(cacheKey);
          const results = cached || await this.withTimeout(
            () => adapter.search(query),
            adapter.timeoutMs || this.defaultTimeoutMs
          );

          if (!cached) {
            this.cache?.set?.(cacheKey, results);
          }

          const normalized = Array.isArray(results)
            ? results.map((item) => typeof adapter.normalizeOffer === "function"
              ? adapter.normalizeOffer(item)
              : normalizeProductOffer(item, adapter.sourceCode || adapter.adapterKey, {
                sourceType: adapter.type,
                sourceName: adapter.name,
              }))
            : [];

          return createSourceSuccessResult({
            sourceCode: adapter.sourceCode || adapter.adapterKey,
            adapterKey: adapter.adapterKey,
            sourceType: adapter.type,
            sourceName: adapter.name,
            capabilities: adapter.capabilities || [],
            offers: normalized,
            durationMs: Date.now() - startedAt,
            fetchedAt: new Date().toISOString(),
            sourceType: adapter.type,
            sourceName: adapter.name,
            capabilities: adapter.capabilities || [],
          });
        } catch (error) {
          const errorCode = error?.message === "SOURCE_TIMEOUT"
            ? "SOURCE_TIMEOUT"
            : error?.code || (error?.statusCode === 401 || error?.statusCode === 403
              ? "SOURCE_AUTHENTICATION_FAILED"
              : error?.statusCode === 429
                ? "SOURCE_RATE_LIMITED"
                : "SOURCE_UNAVAILABLE");
          const detailMessage =
            error?.message === "SOURCE_TIMEOUT"
              ? "Source request exceeded the configured timeout."
              : error?.message || "Source request failed.";

          return createSourceFailureResult({
            sourceCode: adapter.sourceCode || adapter.adapterKey,
            adapterKey: adapter.adapterKey,
            sourceType: adapter.type,
            sourceName: adapter.name,
            capabilities: adapter.capabilities || [],
            errorCode,
            message: detailMessage,
            durationMs: Date.now() - startedAt,
            fetchedAt: new Date().toISOString(),
            sourceType: adapter.type,
            sourceName: adapter.name,
            capabilities: adapter.capabilities || [],
          });
        }
      })
    );

    const successfulSources = [];
    const failedSources = [];
    const offers = [];

    for (const item of settled) {
      if (item.status === "fulfilled") {
        const result = item.value;
        if (result.success) {
          successfulSources.push({
            sourceCode: result.sourceCode,
            adapterKey: result.adapterKey,
            durationMs: result.durationMs,
            fetchedAt: result.fetchedAt,
            sourceType: result.sourceType,
            sourceName: result.sourceName,
            capabilities: result.capabilities,
            resultCount: result.offers.length,
          });
          offers.push(...result.offers);
        } else {
          failedSources.push({
            sourceCode: result.sourceCode,
            adapterKey: result.adapterKey,
            errorCode: result.errorCode,
            message: result.error.message,
            durationMs: result.durationMs,
            fetchedAt: result.fetchedAt,
            sourceType: result.sourceType,
            sourceName: result.sourceName,
            capabilities: result.capabilities,
          });
        }
      } else {
        failedSources.push({
          sourceCode: "unknown",
          adapterKey: "unknown",
          errorCode: "SOURCE_UNAVAILABLE",
          message: "Source execution could not be completed.",
          durationMs: 0,
          fetchedAt: new Date().toISOString(),
          sourceType: "other",
          sourceName: "Unknown source",
          capabilities: [],
        });
      }
    }

    let authoritativeOffers = offers;
    let persistenceFailure = null;

    if (this.persistenceService) {
      try {
        authoritativeOffers = await this.persistenceService.persistOffers(offers);
      } catch (error) {
        console.error("[SearchOrchestrator] offer persistence failed", {
          errorName: error?.name || null,
          errorCode: error?.code || null,
          errorMessage: error?.message || String(error),
        });
        persistenceFailure = {
          errorCode: error?.code || "PERSISTENCE_UNAVAILABLE",
          message: "Product results could not be persisted safely.",
        };
        authoritativeOffers = [];
      }
    }

    if (persistenceFailure) {
      return {
        success: false,
        partial: failedSources.length > 0,
        persistenceAvailable: false,
        persistenceFailure,
        successfulSources,
        failedSources,
        offers: [],
        results: [],
        count: 0,
        metadata: {
          sourcesQueried: adapters.length,
          sourcesSucceeded: successfulSources.length,
          sourcesFailed: failedSources.length,
          candidatesReceived: offers.length,
          productsAfterDeduplication: 0,
          productsAfterFiltering: 0,
          persistence: "unavailable",
        },
        fetchedAt: new Date().toISOString(),
        query: query.toObject(),
      };
    }

    const deduplicated = this.deduplicator.deduplicate(authoritativeOffers);
    const groupedOffers = deduplicated.groups.map((group) => ({
      ...group,
      candidate: group.representativeOffer,
    }));

    const filtered = this.filter.filter(
      groupedOffers.map((group) => group.candidate),
      query.toObject()
    );

    const acceptedGroups = groupedOffers.filter((group) =>
      filtered.accepted.some((candidate) => candidate.sourceProductId === group.candidate?.sourceProductId && candidate.sourceCode === group.candidate?.sourceCode)
    );

    const ranked = this.rankingEngine.rank(
      acceptedGroups.map((group) => ({
        ...group.candidate,
        productKey: group.productKey,
        offers: group.offers,
      })),
      query.toObject()
    );

    const returned = ranked.map((rankedItem) => ({
      ...rankedItem,
      offers: acceptedGroups.find((group) => group.productKey === rankedItem.product.productKey)?.offers || rankedItem.offers,
    }));

    let persistedSearch = null;
    if (this.persistenceService) {
      try {
        persistedSearch = await this.persistenceService.persistSearch({
          userId: context.userId || null,
          originalQuery: context.originalQuery || "",
          structuredQuery: query.toObject(),
          rankedResults: returned,
        });
      } catch (error) {
        console.error("[SearchOrchestrator] search persistence failed", {
          errorName: error?.name || null,
          errorCode: error?.code || null,
          errorMessage: error?.message || String(error),
        });
        return {
          success: false,
          partial: failedSources.length > 0,
          persistenceAvailable: false,
          persistenceFailure: {
            errorCode: error?.code || "PERSISTENCE_UNAVAILABLE",
            message: "Search results could not be recorded safely.",
          },
          successfulSources,
          failedSources,
          offers: [],
          results: [],
          count: 0,
          metadata: {
            sourcesQueried: adapters.length,
            sourcesSucceeded: successfulSources.length,
            sourcesFailed: failedSources.length,
            candidatesReceived: offers.length,
            productsAfterDeduplication: deduplicated.count,
            productsAfterFiltering: filtered.accepted.length,
            persistence: "unavailable",
          },
          fetchedAt: new Date().toISOString(),
          query: query.toObject(),
        };
      }
    }

    const metadata = {
      sourcesQueried: adapters.length,
      sourcesSucceeded: successfulSources.length,
      sourcesFailed: failedSources.length,
      candidatesReceived: offers.length,
      productsAfterDeduplication: deduplicated.count,
      productsAfterFiltering: filtered.accepted.length,
      persistence: this.persistenceService ? "persisted" : "transient",
      freshness: {
        fetchedAt: new Date().toISOString(),
        status: "known",
      },
    };

    return {
      success: returned.length > 0 || failedSources.length === 0,
      persistenceAvailable: this.persistenceService ? true : null,
      searchId: persistedSearch?.search?._id || null,
      partial: failedSources.length > 0,
      successfulSources,
      failedSources,
      offers: authoritativeOffers,
      results: returned,
      count: returned.length,
      metadata,
      fetchedAt: new Date().toISOString(),
      query: query.toObject(),
    };
  }
}

export default SearchOrchestrator;
