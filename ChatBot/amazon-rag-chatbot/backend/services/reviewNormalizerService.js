class ReviewNormalizerService {
  normalizeProductFacts({ sourceId, asin, sourceUrl, product }) {
    const productName = product?.name || `Amazon Product ${asin}`;
    const facts = [];

    if (product?.priceText) {
      facts.push(`Current listed price: ${product.priceText}`);
    }

    if (Number.isFinite(Number(product?.rating))) {
      facts.push(`Average rating: ${Number(product.rating)} out of 5`);
    }

    if (Number.isFinite(Number(product?.reviewCount)) && Number(product.reviewCount) > 0) {
      facts.push(`Total ratings/reviews reported: ${Number(product.reviewCount)}`);
    }

    if (Array.isArray(product?.features) && product.features.length) {
      facts.push(`Key product features: ${product.features.slice(0, 8).join(" | ")}`);
    }

    if (Array.isArray(product?.colorVariants) && product.colorVariants.length) {
      facts.push(`Available color variants: ${product.colorVariants.slice(0, 12).join(", ")}`);
    }

    if (facts.length === 0) {
      return [];
    }

    return [{
      id: `product_facts_${asin}`,
      product: productName,
      text: facts.join(". "),
      rating: null,
      date: null,
      verified: null,
      source: "url-ingest",
      source_url: sourceUrl,
      source_type: "amazon-url",
      source_id: sourceId,
      asin,
      doc_type: "product-facts",
    }];
  }

  normalizeAmazonReviews({ sourceId, asin, sourceUrl, product, reviews }) {
    const productName = product?.name || `Amazon Product ${asin}`;

    return reviews
      .filter((review) => review && typeof review.text === "string" && review.text.trim())
      .map((review, index) => ({
        id: `review_${asin}_${String(index + 1).padStart(4, "0")}`,
        product: productName,
        text: review.text.trim(),
        rating: Number.isFinite(Number(review.rating)) ? Number(review.rating) : null,
        date: review.date || null,
        verified: Boolean(review.verified),
        source: "url-ingest",
        source_url: sourceUrl,
        source_type: "amazon-url",
        source_id: sourceId,
        asin,
        doc_type: "review",
      }));
  }
}

module.exports = new ReviewNormalizerService();