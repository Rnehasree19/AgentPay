export class ProductConstraintFilter {
  filter(offers = [], query = {}) {
    const accepted = [];
    const rejected = [];

    for (const offer of offers) {
      const reasons = [];
      const candidate = {
        ...offer,
        category: String(offer?.category || "").trim().toLowerCase(),
        brand: String(offer?.brand || "").trim(),
        attributes: offer?.attributes && typeof offer.attributes === "object" ? { ...offer.attributes } : {},
      };

      if (query.minPricePaise !== undefined && query.minPricePaise !== null) {
        const value = Number(candidate.pricePaise ?? 0);
        if (!Number.isFinite(value) || value < Number(query.minPricePaise)) {
          reasons.push("PRICE_BELOW_MIN");
        }
      }

      if (query.maxPricePaise !== undefined && query.maxPricePaise !== null) {
        const value = Number(candidate.pricePaise ?? 0);
        if (!Number.isFinite(value) || value > Number(query.maxPricePaise)) {
          reasons.push("PRICE_ABOVE_MAX");
        }
      }

      if (query.category) {
        if (candidate.category !== String(query.category).trim().toLowerCase()) {
          reasons.push("CATEGORY_MISMATCH");
        }
      }

      if (query.brand) {
        if (candidate.brand.toLowerCase() !== String(query.brand).trim().toLowerCase()) {
          reasons.push("BRAND_MISMATCH");
        }
      }

      if (query.attributes && Object.keys(query.attributes).length > 0) {
        for (const [key, expectedValue] of Object.entries(query.attributes)) {
          const expected = String(expectedValue).trim().toLowerCase();
          const aliases = key === "color" ? ["color", "colors"] : key === "size" ? ["size", "sizes"] : [key];
          const actualValues = aliases.flatMap((alias) => {
            const value = candidate.attributes?.[alias];
            return Array.isArray(value) ? value : [value];
          })
            .filter((value) => value !== undefined && value !== null && value !== "")
            .map((value) => String(value).trim().toLowerCase());

          if (!actualValues.includes(expected)) {
            reasons.push("ATTRIBUTE_MISMATCH");
          }
        }
      }

      if (query.availability) {
        if (candidate.availability !== query.availability) {
          reasons.push("REQUIRED_AVAILABILITY_NOT_MET");
        }
      }

      if (query.ratingMin !== undefined && query.ratingMin !== null) {
        const rating = Number(candidate.rating ?? Number.NaN);
        if (!Number.isFinite(rating) || rating < Number(query.ratingMin)) {
          reasons.push("REQUIRED_RATING_NOT_MET");
        }
      }

      if (reasons.length === 0) {
        accepted.push(candidate);
      } else {
        rejected.push({ offer: candidate, reasons: [...new Set(reasons)] });
      }
    }

    return {
      accepted,
      rejected,
    };
  }
}

export default ProductConstraintFilter;
