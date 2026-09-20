export const SOURCE_TYPES = Object.freeze({
  DEMO: "demo",
  API: "api",
  FEED: "feed",
  OTHER: "other",
});

export const SOURCE_CAPABILITIES = Object.freeze({
  SEARCH: "SEARCH",
  PRODUCT_DETAILS: "PRODUCT_DETAILS",
  OFFERS: "OFFERS",
  IMAGES: "IMAGES",
  INVENTORY: "INVENTORY",
  PRICE: "PRICE",
  CHECKOUT: "CHECKOUT",
  ORDER_STATUS: "ORDER_STATUS",
});

export const DEMO_SOURCE_CAPABILITIES = Object.freeze([
  SOURCE_CAPABILITIES.SEARCH,
  SOURCE_CAPABILITIES.PRODUCT_DETAILS,
  SOURCE_CAPABILITIES.OFFERS,
  SOURCE_CAPABILITIES.IMAGES,
  SOURCE_CAPABILITIES.INVENTORY,
  SOURCE_CAPABILITIES.PRICE,
]);

export function normalizeCapabilities(capabilities = []) {
  if (!Array.isArray(capabilities)) {
    return [];
  }

  return [...new Set(capabilities.filter((capability) =>
    Object.values(SOURCE_CAPABILITIES).includes(capability)
  ))];
}