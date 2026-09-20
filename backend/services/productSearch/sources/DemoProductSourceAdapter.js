import { ProductSourceAdapter } from "./ProductSourceAdapter.js";
import { normalizeProductOffer } from "../NormalizedProductOffer.js";
import { DEMO_SOURCE_CAPABILITIES, SOURCE_TYPES } from "../SourceCapabilities.js";

const demoProducts = [
  {
    sourceProductId: "demo-laptop-001",
    title: "AgentPay Studio 14",
    brand: "AgentPay Labs",
    category: "laptop",
    description: "A compact developer laptop for coding and browsing.",
    pricePaise: 6499900,
    currency: "INR",
    rating: 4.6,
    reviewCount: 240,
    availability: "in_stock",
    deliveryInfo: "2-4 business days",
    url: "https://demo.agentpay.local/products/laptop/studio-14",
    imageUrl: "https://demo.agentpay.local/images/laptop-studio-14.jpg",
    attributes: { ram: "16GB", storage: "512GB SSD", usage: "coding" },
    fetchedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    sourceProductId: "demo-laptop-002",
    title: "AgentPay Creator Pro",
    brand: "AgentPay Labs",
    category: "laptop",
    description: "A performance laptop for creative workflows.",
    pricePaise: 8990000,
    currency: "INR",
    rating: 4.8,
    reviewCount: 180,
    availability: "limited",
    deliveryInfo: "3-5 business days",
    url: "https://demo.agentpay.local/products/laptop/creator-pro",
    imageUrl: "https://demo.agentpay.local/images/laptop-creator-pro.jpg",
    attributes: { ram: "32GB", storage: "1TB SSD", usage: "editing" },
    fetchedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    sourceProductId: "demo-headphones-001",
    title: "AgentPay NoiseFree Headphones",
    brand: "AgentPay Labs",
    category: "headphones",
    description: "Wireless over-ear headphones tuned for focused work.",
    pricePaise: 1299000,
    currency: "INR",
    rating: 4.5,
    reviewCount: 310,
    availability: "in_stock",
    deliveryInfo: "1-3 business days",
    url: "https://demo.agentpay.local/products/headphones/noisefree",
    imageUrl: "https://demo.agentpay.local/images/headphones-noisefree.jpg",
    attributes: { battery: "30 hours", connectivity: "Bluetooth 5.2" },
    fetchedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    sourceProductId: "demo-phone-001",
    title: "AgentPay Pulse X",
    brand: "AgentPay Labs",
    category: "phone",
    description: "A balanced smartphone for everyday use and photography.",
    pricePaise: 4599000,
    currency: "INR",
    rating: 4.4,
    reviewCount: 420,
    availability: "in_stock",
    deliveryInfo: "2-4 business days",
    url: "https://demo.agentpay.local/products/phone/pulse-x",
    imageUrl: "https://demo.agentpay.local/images/phone-pulse-x.jpg",
    attributes: { ram: "8GB", storage: "256GB", camera: "50MP" },
    fetchedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    sourceProductId: "demo-phone-002",
    title: "AgentPay Orbit 5G",
    brand: "AgentPay Labs",
    category: "phone",
    description: "A premium 5G phone with strong battery life.",
    pricePaise: 6999000,
    currency: "INR",
    rating: 4.7,
    reviewCount: 270,
    availability: "limited",
    deliveryInfo: "3-5 business days",
    url: "https://demo.agentpay.local/products/phone/orbit-5g",
    imageUrl: "https://demo.agentpay.local/images/phone-orbit-5g.jpg",
    attributes: { ram: "12GB", storage: "512GB", camera: "108MP" },
    fetchedAt: "2026-09-01T00:00:00.000Z",
  },
];

export class DemoProductSourceAdapter extends ProductSourceAdapter {
  constructor() {
    super({
      sourceCode: "demo_store",
      adapterKey: "demo_store",
      name: "AgentPay Demo Source",
      enabled: true,
      type: SOURCE_TYPES.DEMO,
      capabilities: DEMO_SOURCE_CAPABILITIES,
    });

    this.items = demoProducts.map((item) => ({ ...item }));
  }

  filterMatches(item, query) {
    const text = (query?.queryText || "").trim().toLowerCase();
    const category = (query?.category || "").trim().toLowerCase();
    const brand = (query?.brand || "").trim().toLowerCase();

    if (text) {
      const searchable = [
        item.title,
        item.description,
        item.brand,
        item.category,
        ...(Object.values(item.attributes || {}))
      ]
        .join(" ")
        .toLowerCase();

      if (!searchable.includes(text)) {
        return false;
      }
    }

    if (category && item.category !== category) {
      return false;
    }

    if (brand && item.brand.toLowerCase() !== brand) {
      return false;
    }

    if (query?.minPricePaise !== null && query?.minPricePaise !== undefined && item.pricePaise < query.minPricePaise) {
      return false;
    }

    if (query?.maxPricePaise !== null && query?.maxPricePaise !== undefined && item.pricePaise > query.maxPricePaise) {
      return false;
    }

    if (query?.attributes && Object.keys(query.attributes).length > 0) {
      for (const [key, value] of Object.entries(query.attributes)) {
        const expected = String(value).trim().toLowerCase();
        const actual = String(item.attributes?.[key] || "").trim().toLowerCase();

        if (expected && actual !== expected) {
          return false;
        }
      }
    }

    return true;
  }

  async search(query) {
    const safeQuery = query || {};
    const filtered = this.items
      .filter((item) => this.filterMatches(item, safeQuery))
      .slice(0, safeQuery.limit || 20)
      .map((item) => normalizeProductOffer({ ...item, sourceCode: this.sourceCode }, this.sourceCode, {
        sourceType: this.type,
        sourceName: this.name,
      }));

    return filtered;
  }

  async getProduct(sourceProductId) {
    const item = this.items.find((entry) => entry.sourceProductId === sourceProductId);

    if (!item) {
      return null;
    }

    return normalizeProductOffer({ ...item, sourceCode: this.sourceCode }, this.sourceCode, {
      sourceType: this.type,
      sourceName: this.name,
    });
  }
}

export default DemoProductSourceAdapter;
