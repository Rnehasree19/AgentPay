import { productRepository } from "../../repositories/productRepository.js";
import { productSourceRepository } from "../../repositories/productSourceRepository.js";
import { productOfferRepository } from "../../repositories/productOfferRepository.js";
import { searchRepository } from "../../repositories/searchRepository.js";
import { searchResultRepository } from "../../repositories/searchResultRepository.js";
import { ProductDeduplicator } from "./ProductDeduplicator.js";
import { validateExternalProductOffer } from "./ProductOfferValidator.js";
import { isDatabaseConnected } from "../../config/database.js";
import mongoose from "mongoose";

export class ProductPersistenceService {
  constructor({ products = productRepository, sources = productSourceRepository, offers = productOfferRepository, searches = searchRepository, searchResults = searchResultRepository, deduplicator = new ProductDeduplicator(), database = { isConnected: isDatabaseConnected } } = {}) {
    this.products = products;
    this.sources = sources;
    this.offers = offers;
    this.searches = searches;
    this.searchResults = searchResults;
    this.deduplicator = deduplicator;
    this.database = database;
  }

  assertDatabaseAvailable() {
    if (!this.database.isConnected()) {
      const error = new Error("MongoDB persistence is unavailable.");
      error.code = "PERSISTENCE_UNAVAILABLE";
      throw error;
    }
  }

  logPersistenceFailure(operation, error, context = {}) {
    console.error("[ProductPersistenceService] persistence failure", {
      operation,
      errorName: error?.name || null,
      errorCode: error?.code || null,
      errorMessage: error?.message || String(error),
      errorPath: error?.path || null,
      errorKind: error?.kind || null,
      errorKeyPattern: error?.keyPattern || null,
      errorKeyValue: error?.keyValue || null,
      validationErrors: error?.errors
        ? Object.fromEntries(Object.entries(error.errors).map(([key, value]) => [key, value?.message || String(value)]))
        : null,
      ...context,
    });
  }

  async persistOffer(offer) {
    this.assertDatabaseAvailable();
    validateExternalProductOffer(offer);

    const sourceCode = String(offer.sourceCode || "unknown").trim().toLowerCase();
    const source = await this.sources.upsertByCode(sourceCode, {
      name: offer.sourceName || sourceCode,
      adapterKey: offer.adapterKey || sourceCode,
      type: offer.sourceType || "other",
      capabilities: offer.capabilities || [],
      enabled: true,
      healthStatus: "healthy",
      lastSuccessfulFetchAt: offer.fetchedAt,
    });

    const catalogProduct = offer.sourceCode === "hoodie_catalog" && mongoose.isValidObjectId(offer.sourceProductId)
      ? await this.products.findById(offer.sourceProductId)
      : null;
    const canonicalKey = catalogProduct?.canonicalKey || offer.canonicalKey || this.deduplicator.buildProductKey(offer);
    const product = catalogProduct || await this.products.upsertByCanonicalKey(canonicalKey, {
      title: offer.title,
      brand: offer.brand,
      category: offer.category,
      description: offer.description,
      attributes: offer.attributes || {},
      active: true,
    });

    const persistedOffer = await this.offers.upsertBySourceProduct(
      source._id,
      offer.sourceProductId,
      {
        productId: product._id,
        title: offer.title,
        pricePaise: offer.pricePaise,
        currency: offer.currency,
        rating: offer.rating,
        reviewCount: offer.reviewCount,
        availability: offer.availability,
        deliveryInfo: offer.deliveryInfo ?? null,
        url: offer.url,
        imageUrl: offer.imageUrl || "",
        attributes: offer.attributes || {},
        fetchedAt: offer.fetchedAt,
        expiresAt: offer.expiresAt || null,
        sourceType: offer.sourceType || source.type || "other",
        active: offer.active !== false,
      }
    );

    return {
      ...offer,
      ...persistedOffer,
      _id: persistedOffer._id,
      productId: product._id,
      sourceId: source._id,
      sourceCode,
      sourceName: source.name,
      sourceType: source.type,
      canonicalKey,
    };
  }

  async persistOffers(offers = []) {
    const persisted = [];

    for (const [index, offer] of offers.entries()) {
      try {
        persisted.push(await this.persistOffer(offer));
      } catch (error) {
        this.logPersistenceFailure("persistOffer", error, {
          offerIndex: index,
          sourceCode: offer?.sourceCode || null,
          sourceProductId: offer?.sourceProductId || null,
          title: offer?.title || null,
        });
        throw error;
      }
    }

    return persisted;
  }

  async persistSearch({ userId = null, originalQuery = "", structuredQuery, rankedResults = [] }) {
    this.assertDatabaseAvailable();
    let search;
    try {
      search = await this.searches.create({
        userId: userId || null,
        originalQuery: String(originalQuery || "").trim(),
        structuredQuery,
      });
    } catch (error) {
      this.logPersistenceFailure("persistSearch", error, {
        userId: userId || null,
        originalQuery: String(originalQuery || "").trim(),
        rankedResultCount: rankedResults.length,
      });
      throw error;
    }

    const resultRows = rankedResults.flatMap((rankedResult) =>
      (rankedResult.offers || []).filter((offer) => offer?._id).map((offer) => ({
        searchId: search._id,
        offerId: offer._id,
        rank: rankedResult.rank,
        score: rankedResult.score,
        rankingReasons: rankedResult.rankingReasons || [],
      }))
    );

    let searchResults = [];
    try {
      searchResults = resultRows.length
        ? await this.searchResults.createMany(resultRows)
        : [];
    } catch (error) {
      this.logPersistenceFailure("persistSearchResults", error, {
        searchId: search?._id || null,
        resultRowCount: resultRows.length,
        firstResultRow: resultRows[0] || null,
      });
      throw error;
    }

    return { search, searchResults };
  }
}

export default ProductPersistenceService;