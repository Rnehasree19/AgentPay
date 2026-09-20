import mongoose from "mongoose";

import { productOfferRepository } from "../../repositories/productOfferRepository.js";
import { productSourceRepository } from "../../repositories/productSourceRepository.js";
import { userPolicyRepository } from "../../repositories/userPolicyRepository.js";
import { ValidationError } from "../../errors/ValidationError.js";
import { PolicyEngine } from "./PolicyEngine.js";

export class OfferSelectionService {
  constructor({ offerRepository = productOfferRepository, sourceRepository = productSourceRepository, policyRepository = userPolicyRepository, policyEngine = new PolicyEngine() } = {}) {
    this.offerRepository = offerRepository;
    this.sourceRepository = sourceRepository;
    this.policyRepository = policyRepository;
    this.policyEngine = policyEngine;
  }

  validateVariant(storedOffer, variant) {
    if (!variant) return;

    const attributes = storedOffer.attributes || {};
    const sizes = Array.isArray(attributes.sizes) ? attributes.sizes.map((value) => String(value).toLowerCase()) : [];
    const colors = Array.isArray(attributes.colors) ? attributes.colors.map((value) => String(value).toLowerCase()) : [];
    const size = variant.size ? String(variant.size).trim() : "";
    const color = variant.color ? String(variant.color).trim().toLowerCase() : "";

    if (size && sizes.length > 0 && !sizes.includes(size.toLowerCase())) {
      throw new ValidationError("The selected size is unavailable for this hoodie.");
    }

    if (color && colors.length > 0 && !colors.includes(color)) {
      throw new ValidationError("The selected color is unavailable for this hoodie.");
    }

    if (size) {
      const stock = storedOffer.attributes.stock || {};
      const quantity = Number(stock[variant.size] ?? stock[size] ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new ValidationError("The selected size is out of stock.");
      }
    }
  }

  async select({ offerId, variant = null, authenticatedUserId }) {
    if (!mongoose.isValidObjectId(offerId)) {
      const error = new Error("offerId must be a valid offer identifier.");
      error.statusCode = 400;
      error.code = "VALIDATION_ERROR";
      error.isOperational = true;
      throw error;
    }

    const storedOffer = await this.offerRepository.findById(offerId);
    if (!storedOffer) {
      return this.policyEngine.decide(null, null);
    }

    this.validateVariant(storedOffer, variant);

    const [source, policy] = await Promise.all([
      this.sourceRepository.findById(storedOffer.sourceId),
      this.policyRepository.findByUserId(authenticatedUserId),
    ]);

    const canonicalOffer = {
      offerId: String(storedOffer._id || offerId),
      productId: storedOffer.productId ? String(storedOffer.productId) : null,
      sourceId: storedOffer.sourceId ? String(storedOffer.sourceId) : null,
      sourceCode: source?.code || null,
      sourceName: source?.name || null,
      title: storedOffer.title,
      pricePaise: storedOffer.pricePaise,
      currency: storedOffer.currency,
      availability: storedOffer.availability,
      active: storedOffer.active === true,
      fetchedAt: storedOffer.fetchedAt || null,
      expiresAt: storedOffer.expiresAt || null,
      attributes: storedOffer.attributes || {},
      variant,
    };

    return this.policyEngine.decide(canonicalOffer, policy);
  }
}

export default OfferSelectionService;