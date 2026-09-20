import { ProductSearchQuery } from "../services/productSearch/ProductSearchQuery.js";
import { createProductSearchOrchestrator } from "../services/productSearch/searchRuntime.js";

const orchestrator = createProductSearchOrchestrator();

export async function searchProducts(req, res, next) {
  try {
    const query = new ProductSearchQuery(req.body || {});
    const result = await orchestrator.search(query, {
      userId: req.user?.id || null,
      originalQuery: typeof req.body?.queryText === "string" ? req.body.queryText : "",
    });

    return res.json({
      success: result.success,
      partial: result.partial,
      query: result.query,
      results: result.results,
      successfulSources: result.successfulSources,
      failedSources: result.failedSources,
      offers: result.offers,
      count: result.count,
      metadata: result.metadata,
      fetchedAt: result.fetchedAt,
      persistenceAvailable: result.persistenceAvailable,
      persistenceFailure: result.persistenceFailure || null,
      searchId: result.searchId,
    });
  } catch (error) {
    next(error);
  }
}

export default searchProducts;
