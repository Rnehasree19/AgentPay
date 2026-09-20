import { ProductSourceAdapter } from "./ProductSourceAdapter.js";
import { SOURCE_CAPABILITIES, SOURCE_TYPES } from "../SourceCapabilities.js";
import { SourceAdapterError } from "../SourceAdapterError.js";

const DEFAULT_BASE_URL = "https://api.bestbuy.com";

export class BestBuyProductSourceAdapter extends ProductSourceAdapter {
  constructor({
    sourceCode = "bestbuy",
    adapterKey = "bestbuy",
    name = "Best Buy",
    enabled = true,
    type = SOURCE_TYPES.API,
    config = {},
  } = {}) {
    const apiKey = String(config.apiKey || process.env.BESTBUY_API_KEY || "").trim();
    const sourceEnabled = Boolean(enabled && apiKey);

    super({
      sourceCode,
      adapterKey,
      name,
      enabled: sourceEnabled,
      type,
      config: {
        baseUrl: DEFAULT_BASE_URL,
        apiKey,
        ...config,
      },
      capabilities: [
        SOURCE_CAPABILITIES.SEARCH,
        SOURCE_CAPABILITIES.PRODUCT_DETAILS,
        SOURCE_CAPABILITIES.OFFERS,
        SOURCE_CAPABILITIES.IMAGES,
        SOURCE_CAPABILITIES.PRICE,
        SOURCE_CAPABILITIES.INVENTORY,
      ],
      timeoutMs: config.timeoutMs || 2500,
    });

    this.baseUrl = String(this.config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = String(this.config.apiKey || "").trim();
  }

  assertConfigured() {
    if (!this.enabled || !this.apiKey) {
      throw new SourceAdapterError(
        "SOURCE_NOT_CONFIGURED",
        "Best Buy API key is not configured. The adapter is unavailable until a valid key is set."
      );
    }
  }

  buildProductSearchPath(query = {}) {
    const normalizedQuery = query || {};
    const text = String(normalizedQuery.queryText || "").trim();
    const category = String(normalizedQuery.category || "").trim();
    const limit = Math.min(Number(normalizedQuery.limit || 10), 10);

    const path = new URL(`${this.baseUrl}/v1/products`);
    const searchTerms = [];

    if (text) {
      searchTerms.push(`search=${encodeURIComponent(text)}`);
    }

    if (category) {
      const cleanCategory = category.replace(/"/g, "").trim();
      searchTerms.push(`categoryPath.name=${encodeURIComponent(cleanCategory)}`);
    }

    if (searchTerms.length > 0) {
      path.pathname = `${path.pathname}(${searchTerms.join("&")})`;
    }

    path.searchParams.set("format", "json");
    path.searchParams.set("show", [
      "sku",
      "name",
      "manufacturer",
      "shortDescription",
      "longDescription",
      "image",
      "largeImage",
      "thumbnailImage",
      "url",
      "addToCartUrl",
      "salePrice",
      "regularPrice",
      "onlineAvailability",
      "inStorePickup",
      "customerReviewAverage",
      "customerReviewCount",
    ].join(","));
    path.searchParams.set("pageSize", String(limit));
    path.searchParams.set("apiKey", this.apiKey);

    return path.toString();
  }

  buildProductDetailsUrl(sourceProductId) {
    const url = new URL(`${this.baseUrl}/v1/products/${encodeURIComponent(sourceProductId)}.json`);
    url.searchParams.set("apiKey", this.apiKey);
    url.searchParams.set("show", [
      "sku",
      "name",
      "manufacturer",
      "shortDescription",
      "longDescription",
      "image",
      "largeImage",
      "thumbnailImage",
      "url",
      "addToCartUrl",
      "salePrice",
      "regularPrice",
      "onlineAvailability",
      "inStorePickup",
      "customerReviewAverage",
      "customerReviewCount",
    ].join(","));
    return url.toString();
  }

  mapBestBuyProduct(product) {
    if (!product || typeof product !== "object") {
      return null;
    }

    const rawPrice = Number(
      product.salePrice ??
      product.regularPrice ??
      product.price ??
      product.prices?.current ??
      product.prices?.regular ??
      0
    );

    const sourceProductId = String(
      product.sku ??
      product.productId ??
      product.id ??
      product.sourceProductId ??
      ""
    ).trim();

    const title = String(product.name || product.names?.title || "").trim();
    const brand = String(product.manufacturer || product.brand || "").trim();
    const category = String(
      product.categoryPath?.name ||
      product.category ||
      product.type ||
      ""
    ).trim().toLowerCase();
    const description = String(
      product.longDescription ||
      product.shortDescription ||
      product.description || ""
    ).trim();

    const url = String(product.url || product.links?.web || product.addToCartUrl || "").trim();
    const imageUrl = String(product.largeImage || product.image || product.thumbnailImage || "").trim();
    const rating = product.customerReviewAverage === undefined || product.customerReviewAverage === null
      ? null
      : Number(product.customerReviewAverage);
    const reviewCount = product.customerReviewCount === undefined || product.customerReviewCount === null
      ? null
      : Number(product.customerReviewCount);

    const availability = product.onlineAvailability === true || product.orderable === true
      ? "in_stock"
      : product.inStorePickup === true
        ? "limited"
        : "unknown";

    const sourceCurrency = "USD";

    return {
      sourceProductId,
      title,
      brand,
      category,
      description,
      pricePaise: Number.isFinite(rawPrice) && rawPrice > 0 ? Math.round(rawPrice * 100) : null,
      currency: sourceCurrency,
      rating,
      reviewCount,
      availability,
      deliveryInfo: product.inStorePickup ? "Best Buy pickup available" : null,
      url,
      imageUrl,
      attributes: {
        source: "bestbuy",
        sourceCurrency,
        inStorePickup: Boolean(product.inStorePickup),
        onlineAvailability: Boolean(product.onlineAvailability),
        manufacturer: brand || null,
      },
      fetchedAt: new Date().toISOString(),
      expiresAt: null,
    };
  }

  normalizeOffer(offer) {
    if (!offer || typeof offer !== "object") {
      return null;
    }

    const currency = String(offer.currency || "").trim().toUpperCase();
    if (currency !== "INR") {
      return null;
    }

    const normalized = super.normalizeOffer({
      ...offer,
      sourceCode: this.sourceCode,
      sourceName: this.name,
      sourceType: this.type,
      fetchedAt: offer.fetchedAt || new Date().toISOString(),
    });

    if (!normalized) {
      return null;
    }

    normalized.attributes = {
      ...(normalized.attributes || {}),
      source: "bestbuy",
      sourceCurrency: String(offer.attributes?.sourceCurrency || "USD").trim().toUpperCase(),
    };

    return normalized;
  }

  async search(query = {}) {
    this.assertConfigured();

    const request = query instanceof Object && !Array.isArray(query) ? query : {};
    const url = this.buildProductSearchPath(request);

    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs || 2500),
      });
    } catch (error) {
      if (error && error.name === "TimeoutError") {
        throw new SourceAdapterError("SOURCE_TIMEOUT", "Best Buy request timed out.", { retryable: true, statusCode: 504 });
      }
      throw new SourceAdapterError("SOURCE_UNAVAILABLE", "Best Buy request failed.", { retryable: true });
    }

    if (response.status === 401 || response.status === 403) {
      throw new SourceAdapterError(
        "SOURCE_AUTHENTICATION_FAILED",
        "Best Buy API authentication failed.",
        { retryable: false, statusCode: response.status }
      );
    }

    if (response.status === 429) {
      throw new SourceAdapterError(
        "SOURCE_RATE_LIMITED",
        "Best Buy API rate limit reached.",
        { retryable: true, statusCode: response.status }
      );
    }

    if (!response.ok) {
      throw new SourceAdapterError(
        "SOURCE_UNAVAILABLE",
        "Best Buy API request failed.",
        { retryable: true, statusCode: response.status }
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new SourceAdapterError("SOURCE_UNAVAILABLE", "Best Buy response could not be parsed.", { retryable: true });
    }

    const products = Array.isArray(payload?.products) ? payload.products : [];
    const offers = [];

    for (const product of products) {
      if (!product) {
        continue;
      }

      const mapped = this.mapBestBuyProduct(product);
      if (!mapped || !mapped.sourceProductId || !mapped.title || mapped.pricePaise === null) {
        continue;
      }

      if (String(mapped.currency || "").trim().toUpperCase() !== "INR") {
        continue;
      }

      const normalized = this.normalizeOffer(mapped);
      if (normalized) {
        offers.push(normalized);
      }
    }

    return offers;
  }

  async getProduct(sourceProductId) {
    this.assertConfigured();

    if (!sourceProductId) {
      return null;
    }

    const url = this.buildProductDetailsUrl(sourceProductId);

    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs || 2500),
      });
    } catch (error) {
      if (error && error.name === "TimeoutError") {
        throw new SourceAdapterError("SOURCE_TIMEOUT", "Best Buy request timed out.", { retryable: true, statusCode: 504 });
      }
      throw new SourceAdapterError("SOURCE_UNAVAILABLE", "Best Buy request failed.", { retryable: true });
    }

    if (response.status === 401 || response.status === 403) {
      throw new SourceAdapterError(
        "SOURCE_AUTHENTICATION_FAILED",
        "Best Buy API authentication failed.",
        { retryable: false, statusCode: response.status }
      );
    }

    if (response.status === 429) {
      throw new SourceAdapterError(
        "SOURCE_RATE_LIMITED",
        "Best Buy API rate limit reached.",
        { retryable: true, statusCode: response.status }
      );
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new SourceAdapterError(
        "SOURCE_UNAVAILABLE",
        "Best Buy product lookup failed.",
        { retryable: true, statusCode: response.status }
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new SourceAdapterError("SOURCE_UNAVAILABLE", "Best Buy product response could not be parsed.", { retryable: true });
    }

    if (!payload) {
      return null;
    }

    const mapped = this.mapBestBuyProduct(payload);
    if (!mapped || !mapped.sourceProductId || !mapped.title || mapped.pricePaise === null) {
      return null;
    }

    if (String(mapped.currency || "").trim().toUpperCase() !== "INR") {
      return null;
    }

    return this.normalizeOffer(mapped);
  }
}

export default BestBuyProductSourceAdapter;
