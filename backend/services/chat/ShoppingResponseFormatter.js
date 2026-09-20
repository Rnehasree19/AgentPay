export class ShoppingResponseFormatter {
  format(searchResult) {
    const results = (searchResult?.results || []).flatMap((rankedResult) => {
      const offers = rankedResult.offers?.length
        ? rankedResult.offers
        : [rankedResult.product];

      return offers.flatMap((offer) => {
        if (!offer?._id) {
          return [];
        }

        return [{
          offerId: String(offer._id),
          productId: rankedResult.product?.productKey || null,
          title: offer.title || rankedResult.product?.title || "",
          brand: offer.brand || rankedResult.product?.brand || "",
          category: offer.category || rankedResult.product?.category || "",
          description: offer.description || rankedResult.product?.description || "",
          pricePaise: offer.pricePaise ?? rankedResult.product?.pricePaise ?? null,
          currency: offer.currency || rankedResult.product?.currency || "INR",
          rating: offer.rating ?? rankedResult.product?.rating ?? null,
          reviewCount: offer.reviewCount ?? rankedResult.product?.reviewCount ?? null,
          availability: offer.availability || rankedResult.product?.availability || "unknown",
          source: offer.sourceCode || rankedResult.product?.sourceCode || "unknown",
          sourceName: offer.sourceName || rankedResult.product?.sourceName || null,
          sourceType: offer.sourceType || rankedResult.product?.sourceType || "other",
          url: offer.url || "",
          imageUrl: offer.imageUrl || "",
          fetchedAt: offer.fetchedAt || null,
          expiresAt: offer.expiresAt || null,
          freshness: offer.expiresAt && new Date(offer.expiresAt).getTime() <= Date.now()
            ? "stale"
            : offer.fetchedAt
              ? "known"
              : "unknown",
          score: rankedResult.score,
          rankingReasons: rankedResult.rankingReasons || [],
          attributes: offer.attributes || rankedResult.product?.attributes || {},
        }];
      });
    });

    return {
      type: "shopping_results",
      message: searchResult?.persistenceAvailable === false
        ? "Product results could not be saved safely, so they cannot be selected right now."
        : results.length
        ? "I found these options matching your requirements."
        : searchResult?.failedSources?.length
          ? "I could not complete product search because the available product sources failed."
          : "I could not find products matching those requirements.",
      query: searchResult?.query || {},
      results,
      sourceSummary: {
        partial: Boolean(searchResult?.partial),
        successfulSources: searchResult?.successfulSources || [],
        failedSources: (searchResult?.failedSources || []).map((source) => ({
          sourceCode: source.sourceCode,
          sourceName: source.sourceName || null,
          sourceType: source.sourceType || "other",
          errorCode: source.errorCode,
          message: "This product source was unavailable.",
        })),
        metadata: searchResult?.metadata || {},
        persistenceAvailable: searchResult?.persistenceAvailable ?? null,
        persistenceFailure: searchResult?.persistenceFailure || null,
        fetchedAt: searchResult?.fetchedAt || null,
      },
    };
  }
}

export default ShoppingResponseFormatter;