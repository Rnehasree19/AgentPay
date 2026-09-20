import { ProductSource } from "../../models/ProductSource.js";
import { productSourceRepository } from "../../repositories/productSourceRepository.js";
import { DemoProductSourceAdapter } from "./sources/DemoProductSourceAdapter.js";
import { SOURCE_TYPES, normalizeCapabilities } from "./SourceCapabilities.js";

export class ProductSourceManager {
  constructor({ adapters = [] } = {}) {
    this.adapters = new Map();

    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  register(adapter) {
    if (!adapter || typeof adapter !== "object") {
      throw new TypeError("Adapter must be an object.");
    }

    const adapterKey = String(adapter.adapterKey || adapter.sourceCode || "").trim();
    if (!adapterKey) {
      throw new Error("Adapter key is required.");
    }

    if (this.adapters.has(adapterKey)) {
      return this.adapters.get(adapterKey);
    }

    this.adapters.set(adapterKey, adapter);
    return adapter;
  }

  getAdapterByKey(adapterKey) {
    if (!adapterKey) {
      return null;
    }

    return this.adapters.get(String(adapterKey).trim().toLowerCase()) || null;
  }

  getEnabledAdapters() {
    return Array.from(this.adapters.values()).filter((adapter) => adapter.enabled !== false);
  }

  async loadEnabledSourcesFromDatabase() {
    try {
      const sources = await productSourceRepository.findEnabled();
      if (!Array.isArray(sources) || sources.length === 0) {
        return [];
      }

      const adapters = [];
      for (const source of sources) {
        if (!source?.adapterKey) {
          continue;
        }

        if (this.getAdapterByKey(source.adapterKey)) {
          continue;
        }

        if (source.type === "demo") {
          adapters.push(new DemoProductSourceAdapter());
          continue;
        }

        adapters.push({
          sourceCode: source.code,
          adapterKey: source.adapterKey,
          name: source.name || source.code,
          enabled: Boolean(source.enabled),
          type: source.type === "external" ? SOURCE_TYPES.OTHER : String(source.type || SOURCE_TYPES.OTHER),
          config: {
            baseUrl: source.baseUrl || "",
          },
          capabilities: normalizeCapabilities(source.capabilities),
        });
      }

      return adapters;
    } catch (error) {
      return [];
    }
  }

  async registerFromDatabase() {
    const adapters = await this.loadEnabledSourcesFromDatabase();
    for (const adapter of adapters) {
      if (adapter && adapter.adapterKey) {
        this.register(adapter);
      }
    }
    return this.getEnabledAdapters();
  }

  static async createDefaultManager() {
    const manager = new ProductSourceManager({
      adapters: [new DemoProductSourceAdapter()],
    });

    try {
      const records = await ProductSource.find({ enabled: true }).lean();
      if (Array.isArray(records) && records.length > 0) {
        for (const record of records) {
          if (!record?.adapterKey) {
            continue;
          }

          if (record.adapterKey === "demo_store") {
            continue;
          }

          manager.register({
            sourceCode: record.code,
            adapterKey: record.adapterKey,
            name: record.name || record.code,
            enabled: Boolean(record.enabled),
            type: record.type === "external" ? SOURCE_TYPES.OTHER : String(record.type || SOURCE_TYPES.OTHER),
            config: { baseUrl: record.baseUrl || "" },
            capabilities: normalizeCapabilities(record.capabilities),
          });
        }
      }
    } catch (error) {
      // Database not configured or unavailable; keep demo adapter only.
    }

    return manager;
  }
}

export default ProductSourceManager;
