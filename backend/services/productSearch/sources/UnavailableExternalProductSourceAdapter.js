import { ProductSourceAdapter } from "./ProductSourceAdapter.js";
import { SOURCE_CAPABILITIES, SOURCE_TYPES, normalizeCapabilities } from "../SourceCapabilities.js";
import { SourceAdapterError } from "../SourceAdapterError.js";

export class UnavailableExternalProductSourceAdapter extends ProductSourceAdapter {
  constructor({ sourceCode, adapterKey, name, type = SOURCE_TYPES.API, config = {} } = {}) {
    super({
      sourceCode,
      adapterKey,
      name,
      enabled: false,
      type,
      config,
      capabilities: [SOURCE_CAPABILITIES.SEARCH, SOURCE_CAPABILITIES.PRODUCT_DETAILS],
    });

    this.capabilities = normalizeCapabilities(this.capabilities);
  }

  async search() {
    throw new SourceAdapterError(
      "SOURCE_NOT_CONFIGURED",
      `${this.name} is disabled because legitimate source credentials are not configured.`
    );
  }

  async getProduct() {
    throw new SourceAdapterError(
      "SOURCE_NOT_CONFIGURED",
      `${this.name} is disabled because legitimate source credentials are not configured.`
    );
  }
}

export default UnavailableExternalProductSourceAdapter;