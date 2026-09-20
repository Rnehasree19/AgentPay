import { ProductSearchQuery } from "../productSearch/ProductSearchQuery.js";

const CATEGORY_PATTERNS = [
  ["hoodie", /\bhoodies?\b/i],
  ["headphones", /\b(headphones?|earbuds?)\b/i],
  ["laptop", /\b(laptops?|notebooks?)\b/i],
  ["phone", /\b(phones?|smartphones?|mobiles?)\b/i],
];

const SHOPPING_PATTERN =
  /\b(?:buy|find|looking for|need|want|shop|shopping|recommend|recommendation|price|budget|under|within)\b|₹|\b\d[\d,]*(?:\.\d+)?\s*(?:k|thousand|lakh)\b/i;

function parsePricePaise(message) {
  const match = message.match(
    /(?:₹|rs\.?|inr\.?|under|below|within|budget(?: of)?)[\s:]*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh)?/i
  );

  if (!match) {
    return undefined;
  }

  const amount = Number(match[1].replace(/,/g, ""));
  const multiplier = match[2]?.toLowerCase() === "lakh"
    ? 100000
    : ["k", "thousand"].includes(match[2]?.toLowerCase())
      ? 1000
      : 1;

  if (!Number.isFinite(amount) || amount < 0) {
    return undefined;
  }

  return Math.round(amount * multiplier * 100);
}

function parseRam(message) {
  const match = message.match(/\b(\d+)\s*GB\s*(?:RAM|memory)\b|\bRAM\s*(?:of|:)?\s*(\d+)\s*GB\b/i);
  const value = match?.[1] || match?.[2];
  return value ? `${value}GB` : undefined;
}

function parseUseCase(message) {
  const match = message.match(/\b(?:for|mainly for|used for)\s+(coding|gaming|editing|work|study)\b/i);
  return match?.[1]?.toLowerCase();
}

function parseColor(message) {
  const colors = "black|white|blue|red|green|yellow|orange|pink|purple|brown|grey|gray|navy|olive|cream|ivory|sand|stone|charcoal|forest|moss|camel|midnight|graphite|plum|ecru|slate|taupe|pine|cinder|magenta|cyan|teal|beige|maroon";
  const match = message.match(new RegExp(`\\b(?:in|color(?:ed)?|colour(?:ed)?)\\s+(${colors})\\b|\\b(${colors})\\s+hoodie\\b`, "i"));
  return (match?.[1] || match?.[2])?.toLowerCase();
}

function parseSize(message) {
  const match = message.match(/\b(?:size\s*)?(XXS|XS|S|M|L|XL|XXL|XXXL)\s*(?:size)?\b/i);
  return match?.[1]?.toUpperCase();
}

function parseCategory(message) {
  return CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(message))?.[0] || "";
}

export class ShoppingIntentService {
  isShoppingRequest(message) {
    return typeof message === "string" && SHOPPING_PATTERN.test(message);
  }

  extract(message) {
    if (!this.isShoppingRequest(message)) {
      return { isShoppingRequest: false, query: null };
    }

    const category = parseCategory(message);
    const attributes = {};
    const ram = parseRam(message);
    const useCase = parseUseCase(message);
    const color = parseColor(message);
    const size = parseSize(message);

    if (ram) {
      attributes.ram = ram;
    }

    if (useCase) {
      attributes.usage = useCase;
    }

    if (color) {
      attributes.color = color;
    }

    if (size) {
      attributes.size = size;
    }

    const structuredQuery = {
      queryText: category,
      category,
      attributes,
    };
    const maxPricePaise = parsePricePaise(message);

    if (maxPricePaise !== undefined) {
      structuredQuery.maxPricePaise = maxPricePaise;
    }

    return {
      isShoppingRequest: true,
      query: new ProductSearchQuery(structuredQuery),
    };
  }

  validateStructuredQuery(query) {
    return new ProductSearchQuery(query).toObject();
  }
}

export default ShoppingIntentService;