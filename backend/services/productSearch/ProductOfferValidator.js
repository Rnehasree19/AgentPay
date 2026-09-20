import { SourceAdapterError } from "./SourceAdapterError.js";

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateExternalProductOffer(offer) {
  if (!offer || typeof offer !== "object") {
    throw new SourceAdapterError("INVALID_OFFER", "Source returned an invalid offer.");
  }

  if (!String(offer.sourceProductId || "").trim()) {
    throw new SourceAdapterError("INVALID_OFFER", "Source offer is missing a product identifier.");
  }

  if (!String(offer.title || "").trim()) {
    throw new SourceAdapterError("INVALID_OFFER", "Source offer is missing a title.");
  }

  if (!Number.isInteger(offer.pricePaise) || offer.pricePaise < 0) {
    throw new SourceAdapterError("INVALID_PRICE", "Source offer price must be a non-negative integer number of paise.");
  }

  if (String(offer.currency || "").toUpperCase() !== "INR") {
    throw new SourceAdapterError("INVALID_CURRENCY", "This source adapter currently accepts INR offers only.");
  }

  if (!isHttpUrl(offer.url)) {
    throw new SourceAdapterError("INVALID_URL", "Source offer URL must use HTTP or HTTPS.");
  }

  if (offer.imageUrl && !isHttpUrl(offer.imageUrl)) {
    throw new SourceAdapterError("INVALID_IMAGE_URL", "Source offer image URL must use HTTP or HTTPS.");
  }

  if (Number.isNaN(new Date(offer.fetchedAt).getTime())) {
    throw new SourceAdapterError("INVALID_TIMESTAMP", "Source offer fetchedAt must be a valid timestamp.");
  }

  if (offer.expiresAt !== null && offer.expiresAt !== undefined && Number.isNaN(new Date(offer.expiresAt).getTime())) {
    throw new SourceAdapterError("INVALID_TIMESTAMP", "Source offer expiresAt must be a valid timestamp.");
  }

  return true;
}

export default validateExternalProductOffer;