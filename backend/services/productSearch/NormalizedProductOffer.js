export const allowedProductOfferAvailability = [
  "in_stock",
  "out_of_stock",
  "limited",
  "unknown",
];

export function normalizeProductOffer(offer, sourceCode = "unknown", sourceMetadata = {}) {
  const fetchedAt = offer?.fetchedAt || new Date().toISOString();
  const normalized = {
    sourceCode: String(offer?.sourceCode || sourceCode || "unknown").trim(),
    sourceProductId: String(offer?.sourceProductId || "").trim(),
    title: String(offer?.title || "").trim(),
    brand: String(offer?.brand || "").trim(),
    category: String(offer?.category || "").trim().toLowerCase(),
    description: String(offer?.description || "").trim(),
    pricePaise: Number.isInteger(offer?.pricePaise)
      ? Number(offer.pricePaise)
      : null,
    currency: String(offer?.currency || "").trim().toUpperCase(),
    rating: offer?.rating === undefined || offer?.rating === null ? null : Number(offer.rating),
    reviewCount:
      offer?.reviewCount === undefined || offer?.reviewCount === null
        ? null
        : Number(offer.reviewCount),
    availability: allowedProductOfferAvailability.includes(offer?.availability)
      ? offer.availability
      : "unknown",
    deliveryInfo: offer?.deliveryInfo ?? null,
    url: String(offer?.url || "").trim(),
    imageUrl: String(offer?.imageUrl || "").trim(),
    attributes: offer?.attributes && typeof offer.attributes === "object" ? { ...offer.attributes } : {},
    fetchedAt,
    expiresAt: offer?.expiresAt || null,
    active: offer?.active !== false,
    sourceType: offer?.sourceType || sourceMetadata.sourceType || "other",
    sourceName: offer?.sourceName || sourceMetadata.sourceName || sourceCode,
  };

  if (normalized.rating !== null && normalized.rating < 0) {
    normalized.rating = null;
  }

  if (normalized.rating !== null && normalized.rating > 5) {
    normalized.rating = 5;
  }

  if (normalized.reviewCount !== null && normalized.reviewCount < 0) {
    normalized.reviewCount = 0;
  }

  return normalized;
}

export default normalizeProductOffer;
