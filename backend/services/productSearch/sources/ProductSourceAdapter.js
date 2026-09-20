import { normalizeCapabilities } from "../SourceCapabilities.js";
import { normalizeProductOffer } from "../NormalizedProductOffer.js";
import { validateExternalProductOffer } from "../ProductOfferValidator.js";

export class ProductSourceAdapter {
  constructor({ sourceCode, adapterKey, name, enabled = true, type = "other", config = {}, capabilities = [], timeoutMs = null }) {
    this.sourceCode = String(sourceCode || adapterKey || "unknown").trim();
    this.adapterKey = String(adapterKey || this.sourceCode).trim();
    this.name = String(name || this.sourceCode).trim();
    this.enabled = Boolean(enabled);
    this.type = String(type || "other").trim().toLowerCase();
    this.config = config || {};
    this.capabilities = normalizeCapabilities(capabilities);
    this.timeoutMs = timeoutMs;
  }

  async search() {
    throw new Error("Product source adapter search() must be implemented by the source.");
  }

  async getProduct() {
    throw new Error("Product source adapter getProduct() must be implemented by the source.");
  }

  normalizeOffer(offer) {
    if (!offer || typeof offer !== "object") {
      return null;
    }

    const normalized = normalizeProductOffer({
      ...offer,
      sourceCode: this.sourceCode,
      currency: String(offer.currency || "").toUpperCase(),
      fetchedAt: offer.fetchedAt || new Date().toISOString(),
      sourceType: this.type,
      sourceName: this.name,
    }, this.sourceCode, {
      sourceType: this.type,
      sourceName: this.name,
    });

    validateExternalProductOffer(normalized);
    return normalized;
  }
}

export default ProductSourceAdapter;
