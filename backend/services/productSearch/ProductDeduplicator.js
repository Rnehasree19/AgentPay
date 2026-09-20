export class ProductDeduplicator {
  normalizeText(value) {
    if (value === undefined || value === null) {
      return "";
    }

    return String(value)
      .trim()
      .toLowerCase()
      .replace(/[-_/]+/g, " ")
      .replace(/(\d)\s+(gb|tb|mb|ghz|hz|mp|inch|inches|mm)/gi, "$1$2")
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  normalizeBrand(value) {
    const text = this.normalizeText(value);
    return text.replace(/\b(inc|ltd|limited|corp|corporation|llc|co)\b/g, "").trim();
  }

  normalizeCategory(value) {
    return this.normalizeText(value);
  }

  getAttributeSignature(attributes = {}) {
    if (!attributes || typeof attributes !== "object") {
      return "";
    }

    const entries = Object.entries(attributes)
      .filter(([key, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [this.normalizeText(key), this.normalizeText(value)])
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
        if (leftKey === rightKey) return leftValue.localeCompare(rightValue);
        return leftKey.localeCompare(rightKey);
      });

    return JSON.stringify(entries);
  }

  buildProductKey(offer) {
    const baseTitle = this.normalizeText(offer?.title || "");
    const baseBrand = this.normalizeBrand(offer?.brand || "");
    const baseCategory = this.normalizeCategory(offer?.category || "");
    const attrSig = this.getAttributeSignature(offer?.attributes || {});

    const parts = [
      baseCategory || "uncategorized",
      baseBrand || "unknown-brand",
      baseTitle || "untitled",
      attrSig || "no-attributes",
    ];

    return parts.join("|");
  }

  deduplicate(offers = []) {
    const groups = new Map();

    for (const offer of offers) {
      const normalized = {
        ...offer,
        title: String(offer?.title || "").trim(),
        brand: String(offer?.brand || "").trim(),
        category: String(offer?.category || "").trim(),
        attributes: offer?.attributes && typeof offer.attributes === "object" ? { ...offer.attributes } : {},
      };

      const productKey = this.buildProductKey(normalized);

      if (!groups.has(productKey)) {
        groups.set(productKey, {
          productKey,
          representativeOffer: normalized,
          offers: [],
        });
      }

      const group = groups.get(productKey);
      group.offers.push(normalized);

      if (
        !group.representativeOffer ||
        Number.isFinite(normalized.pricePaise) &&
        (!Number.isFinite(group.representativeOffer.pricePaise) || normalized.pricePaise < group.representativeOffer.pricePaise)
      ) {
        group.representativeOffer = normalized;
      }
    }

    return {
      groups: Array.from(groups.values()).map((group) => ({
        productKey: group.productKey,
        representativeOffer: group.representativeOffer,
        offers: group.offers,
      })),
      count: groups.size,
    };
  }
}

export default ProductDeduplicator;
