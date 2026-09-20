import { ValidationError } from "../../errors/ValidationError.js";

export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 100;

export class ProductSearchQuery {
  constructor(data = {}) {
    const normalized = this.constructor.validateAndNormalize(data);

    this.queryText = normalized.queryText;
    this.category = normalized.category;
    this.brand = normalized.brand;
    this.minPricePaise = normalized.minPricePaise;
    this.maxPricePaise = normalized.maxPricePaise;
    this.ratingMin = normalized.ratingMin;
    this.attributes = normalized.attributes;
    this.currency = normalized.currency;
    this.limit = normalized.limit;
  }

  static validateAndNormalize(data = {}) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new ValidationError("Search query must be an object.");
    }

    const allowedKeys = new Set([
      "queryText",
      "category",
      "brand",
      "minPricePaise",
      "maxPricePaise",
      "ratingMin",
      "attributes",
      "currency",
      "limit",
    ]);

    const unexpectedKeys = Object.keys(data).filter((key) => !allowedKeys.has(key));
    if (unexpectedKeys.length > 0) {
      throw new ValidationError(
        `Unsupported search query field(s): ${unexpectedKeys.join(", ")}.`
      );
    }

    const queryText =
      typeof data.queryText === "string" ? data.queryText.trim() : "";
    const category =
      typeof data.category === "string" ? data.category.trim().toLowerCase() : "";
    const brand =
      typeof data.brand === "string" ? data.brand.trim() : "";

    if (data.minPricePaise !== undefined) {
      if (!Number.isInteger(data.minPricePaise)) {
        throw new ValidationError("minPricePaise must be an integer number of paise.");
      }

      if (data.minPricePaise < 0) {
        throw new ValidationError("minPricePaise must not be negative.");
      }
    }

    if (data.maxPricePaise !== undefined) {
      if (!Number.isInteger(data.maxPricePaise)) {
        throw new ValidationError("maxPricePaise must be an integer number of paise.");
      }

      if (data.maxPricePaise < 0) {
        throw new ValidationError("maxPricePaise must not be negative.");
      }
    }

    if (data.ratingMin !== undefined) {
      if (typeof data.ratingMin !== "number" || !Number.isFinite(data.ratingMin) || data.ratingMin < 0 || data.ratingMin > 5) {
        throw new ValidationError("ratingMin must be a number between 0 and 5.");
      }
    }

    if (
      data.minPricePaise !== undefined &&
      data.maxPricePaise !== undefined &&
      data.minPricePaise > data.maxPricePaise
    ) {
      throw new ValidationError("minPricePaise must not exceed maxPricePaise.");
    }

    if (data.attributes !== undefined) {
      if (!data.attributes || typeof data.attributes !== "object" || Array.isArray(data.attributes)) {
        throw new ValidationError("attributes must be an object when provided.");
      }
    }

    const currency =
      data.currency === undefined ? "INR" : String(data.currency).trim().toUpperCase();
    if (currency !== "INR") {
      throw new ValidationError("currency must be INR.");
    }

    let limit = data.limit === undefined ? DEFAULT_SEARCH_LIMIT : Number(data.limit);
    if (!Number.isInteger(limit)) {
      throw new ValidationError("limit must be a whole number.");
    }

    if (limit <= 0) {
      throw new ValidationError("limit must be greater than zero.");
    }

    if (limit > MAX_SEARCH_LIMIT) {
      throw new ValidationError(
        `limit must not exceed ${MAX_SEARCH_LIMIT}.`
      );
    }

    return {
      queryText,
      category,
      brand,
      minPricePaise:
        data.minPricePaise === undefined ? null : Number(data.minPricePaise),
      maxPricePaise:
        data.maxPricePaise === undefined ? null : Number(data.maxPricePaise),
      ratingMin: data.ratingMin === undefined ? null : Number(data.ratingMin),
      attributes: data.attributes ? { ...data.attributes } : {},
      currency,
      limit,
    };
  }

  static validate(data = {}) {
    this.validateAndNormalize(data);
    return true;
  }

  static from(data = {}) {
    return new ProductSearchQuery(data);
  }

  toObject() {
    return {
      queryText: this.queryText,
      category: this.category,
      brand: this.brand,
      minPricePaise: this.minPricePaise,
      maxPricePaise: this.maxPricePaise,
      attributes: this.attributes,
      currency: this.currency,
      limit: this.limit,
    };
  }
}

export default ProductSearchQuery;
