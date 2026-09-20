export class ProductRankingEngine {
  static defaultWeights = {
    price: 0.38,
    rating: 0.18,
    review: 0.12,
    attributes: 0.17,
    availability: 0.1,
    freshness: 0.05,
  };

  calculatePriceScore(candidate, allCandidates) {
    if (!allCandidates || allCandidates.length === 0) {
      return 1;
    }

    const prices = allCandidates
      .map((item) => Number(item.pricePaise ?? 0))
      .filter((item) => Number.isFinite(item) && item >= 0);

    if (prices.length === 0) {
      return 1;
    }

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    if (maxPrice === minPrice) {
      return 1;
    }

    const candidatePrice = Number(candidate.pricePaise ?? minPrice);
    const normalized = 1 - (candidatePrice - minPrice) / (maxPrice - minPrice || 1);
    return Math.max(0, Math.min(1, normalized));
  }

  calculateRatingScore(candidate) {
    const rating = Number(candidate.rating ?? Number.NaN);
    if (!Number.isFinite(rating)) {
      return 0.5;
    }

    return Math.max(0, Math.min(1, rating / 5));
  }

  calculateReviewScore(candidate) {
    const reviewCount = Number(candidate.reviewCount ?? 0);
    if (!Number.isFinite(reviewCount) || reviewCount <= 0) {
      return 0.2;
    }

    const bounded = Math.min(reviewCount, 5000) / 5000;
    return Math.max(0, Math.min(1, bounded));
  }

  calculateAttributeScore(candidate, query = {}) {
    const requestedAttributes = query.attributes && typeof query.attributes === "object" ? query.attributes : {};
    const entries = Object.entries(requestedAttributes);

    if (entries.length === 0) {
      return 1;
    }

    let matched = 0;
    for (const [key, expectedValue] of entries) {
      const actualValue = candidate.attributes?.[key];
      if (actualValue !== undefined && actualValue !== null) {
        const normalizedActual = String(actualValue).trim().toLowerCase();
        const normalizedExpected = String(expectedValue).trim().toLowerCase();
        if (normalizedActual === normalizedExpected) {
          matched += 1;
        }
      }
    }

    return matched / entries.length;
  }

  calculateAvailabilityScore(candidate) {
    const availability = candidate.availability || "unknown";
    if (availability === "in_stock") return 1;
    if (availability === "limited") return 0.6;
    if (availability === "out_of_stock") return 0.1;
    return 0.3;
  }

  calculateFreshnessScore(candidate) {
    if (!candidate.fetchedAt) {
      return 0.3;
    }

    const ageMs = Date.now() - new Date(candidate.fetchedAt).getTime();
    const maxAgeDays = 30 * 24 * 60 * 60 * 1000;
    const ratio = Math.max(0, 1 - ageMs / maxAgeDays);
    return Math.max(0, Math.min(1, ratio));
  }

  getCandidateSortKey(candidate) {
    return String(
      candidate?.productKey ||
        candidate?.sourceProductId ||
        candidate?.title ||
        candidate?.brand ||
        candidate?.category ||
        candidate?.sourceCode ||
        ""
    ).trim().toLowerCase();
  }

  rank(candidates = [], query = {}) {
    const allCandidates = [...candidates];
    const scoredCandidates = allCandidates.map((candidate, index) => {
      const priceScore = this.calculatePriceScore(candidate, allCandidates);
      const ratingScore = this.calculateRatingScore(candidate);
      const reviewScore = this.calculateReviewScore(candidate);
      const attributeScore = this.calculateAttributeScore(candidate, query);
      const availabilityScore = this.calculateAvailabilityScore(candidate);
      const freshnessScore = this.calculateFreshnessScore(candidate);

      const score =
        priceScore * ProductRankingEngine.defaultWeights.price +
        ratingScore * ProductRankingEngine.defaultWeights.rating +
        reviewScore * ProductRankingEngine.defaultWeights.review +
        attributeScore * ProductRankingEngine.defaultWeights.attributes +
        availabilityScore * ProductRankingEngine.defaultWeights.availability +
        freshnessScore * ProductRankingEngine.defaultWeights.freshness;

      const rankingReasons = [
        priceScore > 0.7 ? "Competitive price" : "Price is within the candidate set",
        ratingScore >= 0.7 ? "Strong rating" : "Rating is neutral or unavailable",
        reviewScore >= 0.5 ? "Review volume is healthy" : "Review volume is limited",
        attributeScore >= 0.8 ? "Matches requested attributes" : "Attribute match is partial",
        availabilityScore >= 0.8 ? "Currently in stock" : availabilityScore >= 0.5 ? "Limited stock available" : "Availability is weaker",
        freshnessScore >= 0.5 ? "Recent listing" : "Freshness is older than preferred",
      ];

      return {
        ...candidate,
        score,
        rankingReasons,
        detail: {
          priceScore,
          ratingScore,
          reviewScore,
          attributeScore,
          availabilityScore,
          freshnessScore,
          rawQuery: { ...query },
        },
        originalIndex: index,
      };
    });

    scoredCandidates.sort((left, right) => {
      const scoreDifference = right.score - left.score;
      if (Math.abs(scoreDifference) > 1e-9) {
        return scoreDifference;
      }

      const attributeDifference = right.detail.attributeScore - left.detail.attributeScore;
      if (Math.abs(attributeDifference) > 1e-9) {
        return attributeDifference;
      }

      const ratingDifference = right.detail.ratingScore - left.detail.ratingScore;
      if (Math.abs(ratingDifference) > 1e-9) {
        return ratingDifference;
      }

      const reviewDifference = right.detail.reviewScore - left.detail.reviewScore;
      if (Math.abs(reviewDifference) > 1e-9) {
        return reviewDifference;
      }

      if (left.pricePaise !== right.pricePaise) {
        return left.pricePaise - right.pricePaise;
      }

      const leftKey = this.getCandidateSortKey(left);
      const rightKey = this.getCandidateSortKey(right);
      if (leftKey !== rightKey) {
        return leftKey.localeCompare(rightKey);
      }

      return 0;
    });

    return scoredCandidates.map((candidate, index) => {
      const productKey = candidate.productKey || `${candidate.sourceCode || "offer"}:${candidate.sourceProductId || candidate.title || index}`;

      return {
      rank: index + 1,
      score: Number(candidate.score.toFixed(4)),
      productKey,
      product: {
        productKey,
        title: candidate.title,
        brand: candidate.brand,
        category: candidate.category,
        description: candidate.description,
        pricePaise: candidate.pricePaise,
        currency: candidate.currency || "INR",
        rating: candidate.rating ?? null,
        reviewCount: candidate.reviewCount ?? null,
        availability: candidate.availability || "unknown",
        attributes: candidate.attributes || {},
        sourceCode: candidate.sourceCode,
        sourceProductId: candidate.sourceProductId,
      },
      offers: [candidate],
      rankingReasons: candidate.rankingReasons,
      detail: candidate.detail,
      };
    });
  }
}

export default ProductRankingEngine;
