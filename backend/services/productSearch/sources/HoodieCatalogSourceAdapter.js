import { ProductSourceAdapter } from "./ProductSourceAdapter.js";
import { normalizeProductOffer } from "../NormalizedProductOffer.js";
import { SOURCE_TYPES } from "../SourceCapabilities.js";

export class HoodieCatalogSourceAdapter extends ProductSourceAdapter {
  constructor({
    sourceCode = "hoodie_catalog",
    adapterKey = "hoodie_catalog",
    name = "Hoodie Catalog",
    enabled = true,
    type = SOURCE_TYPES.API,
    productModel = null,
    limit = 50,
  } = {}) {
    super({
      sourceCode,
      adapterKey,
      name,
      enabled,
      type,
      capabilities: ["search", "inventory"],
    });

    this.productModel = productModel;
    this.limit = Number.isInteger(limit) && limit > 0 ? limit : 50;
  }

  buildSearchFilter(query = {}) {
    const filter = {
      active: true,
      category: "hoodie",
      pricePaise: { $gt: 0 },
      slug: { $exists: true, $nin: [""] },
      imageUrl: { $exists: true, $nin: [""] },
      url: { $exists: true, $nin: [""] },
    };
    const searchText = String(query?.queryText || "").trim();
    const category = String(query?.category || "").trim().toLowerCase();
    const brand = String(query?.brand || "").trim();

    if (category && category !== "hoodie") {
      filter.category = category;
    }

    if (brand) {
      filter.brand = new RegExp(brand, "i");
    }

    if (searchText) {
      filter.$or = [
        { title: new RegExp(searchText, "i") },
        { description: new RegExp(searchText, "i") },
        { brand: new RegExp(searchText, "i") },
        { tags: new RegExp(searchText, "i") },
      ];
    }

    if (query?.minPricePaise !== null && query?.minPricePaise !== undefined) {
      filter.pricePaise = { ...(filter.pricePaise || {}), $gte: Number(query.minPricePaise) };
    }

    if (query?.maxPricePaise !== null && query?.maxPricePaise !== undefined) {
      filter.pricePaise = { ...(filter.pricePaise || {}), $lte: Number(query.maxPricePaise) };
    }

    return filter;
  }

  filterMatches(item, query = {}) {
    const text = String(query?.queryText || "").trim().toLowerCase();
    const category = String(query?.category || "").trim().toLowerCase();
    const brand = String(query?.brand || "").trim().toLowerCase();

    if (category && String(item?.category || "").trim().toLowerCase() !== category) {
      return false;
    }

    if (brand && String(item?.brand || "").trim().toLowerCase() !== brand) {
      return false;
    }

    if (text) {
      const searchable = [
        item?.title,
        item?.description,
        item?.brand,
        item?.category,
        ...(Array.isArray(item?.tags) ? item.tags : []),
        ...(Array.isArray(item?.colors) ? item.colors : []),
        ...(Array.isArray(item?.sizes) ? item.sizes : []),
        ...(Object.values(item?.attributes || {})),
        ...(Object.values(item?.stock || {})),
      ]
        .filter((value) => value !== undefined && value !== null && value !== "")
        .join(" ")
        .toLowerCase();

      if (!searchable.includes(text)) {
        return false;
      }
    }

    if (query?.minPricePaise !== null && query?.minPricePaise !== undefined && Number(item?.pricePaise ?? 0) < Number(query.minPricePaise)) {
      return false;
    }

    if (query?.maxPricePaise !== null && query?.maxPricePaise !== undefined && Number(item?.pricePaise ?? 0) > Number(query.maxPricePaise)) {
      return false;
    }

    if (query?.attributes && typeof query.attributes === "object") {
      for (const [key, expectedValue] of Object.entries(query.attributes)) {
        const expected = String(expectedValue).trim().toLowerCase();
        const aliases = key === "color" ? ["colors", "color"] : key === "size" ? ["sizes", "size"] : [key];
        const actualValues = aliases.flatMap((alias) => {
          const value = alias === "colors" || alias === "sizes"
            ? item?.[alias]
            : item?.attributes?.[alias];
          return Array.isArray(value) ? value : [value];
        })
          .filter((value) => value !== undefined && value !== null && value !== "")
          .map((value) => String(value).trim().toLowerCase());

        if (expected && !actualValues.includes(expected)) {
          return false;
        }
      }
    }

    return true;
  }

  resolveAvailability(record) {
    const stock = record?.stock && typeof record.stock === "object" ? record.stock : {};
    const values = Object.values(stock)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    if (values.length === 0) {
      return record?.availability || "in_stock";
    }

    const total = values.reduce((sum, value) => sum + value, 0);
    if (total <= 0) return "out_of_stock";
    if (total <= 5) return "limited";
    return "in_stock";
  }

  async search(query) {
    if (!this.productModel || typeof this.productModel.find !== "function") {
      return [];
    }

    const safeQuery = query || {};
    const filter = this.buildSearchFilter(safeQuery);
    let records = await this.productModel.find(filter);

    if (records && typeof records.lean === "function") {
      records = await records.lean();
    }

    if (records && typeof records.limit === "function") {
      records = await records.limit(Number(safeQuery.limit || this.limit));
    }

    records = Array.isArray(records) ? records : [];
    records = records.filter((record) => this.filterMatches(record, safeQuery));
    const limit = Number(safeQuery.limit || this.limit);

    if (limit > 0 && records.length > limit) {
      records = records.slice(0, limit);
    }

    return (records || []).map((record) => {
      const title = String(record?.title || "").trim();
      const offer = {
        sourceCode: this.sourceCode,
        sourceProductId: String(record?._id || record?.slug || title || Math.random().toString(36).slice(2)),
        title,
        brand: String(record?.brand || "").trim(),
        category: String(record?.category || "hoodie").trim().toLowerCase(),
        description: String(record?.description || "").trim(),
        pricePaise: Number(record?.pricePaise ?? 0),
        currency: String(record?.currency || "INR").toUpperCase(),
        rating: record?.rating == null ? null : Number(record.rating),
        reviewCount: record?.reviewCount == null ? null : Number(record.reviewCount),
        availability: this.resolveAvailability(record),
        deliveryInfo: record?.deliveryInfo || "2-5 business days",
        url: String(record?.url || "").trim() || `https://example.com/products/${record?.slug || record?._id}`,
        imageUrl: String(record?.imageUrl || "").trim(),
        attributes: {
          ...(record?.attributes && typeof record.attributes === "object" ? record.attributes : {}),
          sizes: Array.isArray(record?.sizes) ? record.sizes : [],
          colors: Array.isArray(record?.colors) ? record.colors : [],
          material: record?.material || record?.attributes?.material || "",
          stock: record?.stock && typeof record.stock === "object" ? record.stock : {},
        },
        fetchedAt: new Date().toISOString(),
        sourceType: this.type,
        sourceName: this.name,
        active: record?.active !== false,
      };

      return normalizeProductOffer(offer, this.sourceCode, {
        sourceType: this.type,
        sourceName: this.name,
      });
    });
  }

  async getProduct(sourceProductId) {
    if (!this.productModel || typeof this.productModel.findOne !== "function") {
      return null;
    }

    const record = await this.productModel.findOne({ _id: sourceProductId, active: true }).lean();
    if (!record) {
      return null;
    }

    const results = await this.search({ category: "hoodie", limit: 1, queryText: record.title || "" });
    return results[0] || null;
  }
}

export default HoodieCatalogSourceAdapter;
