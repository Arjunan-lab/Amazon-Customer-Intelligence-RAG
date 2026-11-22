const express = require("express");
const router = express.Router();
const productService = require("../services/productService");
const aiService = require("../services/aiService");

/**
 * POST /api/product/search
 * Search for products and return intelligence data
 */
router.post("/search", async (req, res) => {
  try {
    const { keyword } = req.body;
    const products = await productService.searchProducts(keyword);
    
    if (products.length === 0) {
      return res.status(404).json({ message: "No products found." });
    }

    // Select the first product
    const product = products[0];
    
    // Fetch reviews
    const reviews = await productService.fetchReviews(product.asin);
    
    // Analyze sentiment
    const sentiment = await aiService.analyzeSentiment(reviews);
    
    // Generate quick queries
    const queries = await aiService.generateQuickQueries(product, reviews);

    res.json({
      product,
      sentiment,
      queries,
      reviewsCount: reviews.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
