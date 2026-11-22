const axios = require('axios');

/**
 * Service to interact with Amazon Data APIs (RapidAPI or Rainforest)
 */
class ProductService {
  constructor() {
    this.rapidApiKey = process.env.RAPIDAPI_KEY;
    this.defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
    };
    this.mockProducts = [
      { name: "Echo Dot (5th Gen)", asin: "B09B8W5FW7", rating: 4.7, reviewCount: 12450, thumbnail: "🔊" },
      { name: "Kindle Paperwhite", asin: "B08KTZ8249", rating: 4.8, reviewCount: 35000, thumbnail: "📖" },
      { name: "Fire HD 8", asin: "B09BG5XM8R", rating: 4.4, reviewCount: 8500, thumbnail: "📱" }
    ];
  }

  /**
   * Search for products by keyword
   */
  async searchProducts(keyword) {
    if (!this.rapidApiKey) {
      console.warn("[ProductService] No RapidAPI key found. Using mock data.");
      const normalizedKeyword = (keyword || "").toString().trim().toLowerCase();
      if (!normalizedKeyword) {
        return [];
      }

      return this.mockProducts.filter((product) =>
        product.name.toLowerCase().includes(normalizedKeyword)
      );
    }

    try {
      // Example for RapidAPI "Real-Time Amazon Data"
      const options = {
        method: 'GET',
        url: 'https://real-time-amazon-data.p.rapidapi.com/search',
        params: { query: keyword, page: '1', country: 'US' },
        headers: {
          'X-RapidAPI-Key': this.rapidApiKey,
          'X-RapidAPI-Host': 'real-time-amazon-data.p.rapidapi.com'
        }
      };
      const response = await axios.request(options);
      return response.data.data.products.map(p => ({
        name: p.product_title,
        asin: p.asin,
        rating: parseFloat(p.product_star_rating),
        reviewCount: p.product_num_ratings,
        thumbnail: p.product_photo
      }));
    } catch (error) {
      console.error("[ProductService] API Error:", error.message);
      throw error;
    }
  }

  async getProductByAsin(asin, sourceUrl = null) {
    if (!this.rapidApiKey) {
      const scraped = await this.scrapeProductDetails(sourceUrl, asin);
      if (scraped) {
        return scraped;
      }

      const mockProduct = this.mockProducts.find((product) => product.asin === asin);
      return mockProduct || {
        name: `Amazon Product ${asin}`,
        asin,
        rating: null,
        reviewCount: 0,
        thumbnail: null,
        sourceUrl,
      };
    }

    try {
      const products = await this.searchProducts(asin);
      const matchedProduct = products.find((product) => product.asin === asin) || products[0];

      if (sourceUrl) {
        const scraped = await this.scrapeProductDetails(sourceUrl, asin);
        if (scraped) {
          return {
            ...matchedProduct,
            ...scraped,
            asin,
            sourceUrl,
          };
        }
      }

      return matchedProduct || {
        name: `Amazon Product ${asin}`,
        asin,
        rating: null,
        reviewCount: 0,
        thumbnail: null,
        sourceUrl,
      };
    } catch (error) {
      console.error("[ProductService] Product lookup by ASIN failed:", error.message);
      return {
        name: `Amazon Product ${asin}`,
        asin,
        rating: null,
        reviewCount: 0,
        thumbnail: null,
        sourceUrl,
      };
    }
  }

  /**
   * Fetch reviews for a specific ASIN
   */
  async fetchReviews(asin, limit = 100, sourceUrl = null) {
    if (!this.rapidApiKey) {
      const scrapedReviews = await this.scrapeReviews(asin, sourceUrl, limit);
      if (scrapedReviews.length > 0) {
        return scrapedReviews;
      }

      console.warn("[ProductService] No RapidAPI key found and scrape yielded no reviews. Using mock reviews.");
      return [
        { text: "Great battery life!", rating: 5, date: "2024-01-10" },
        { text: "Sound is a bit tinny.", rating: 3, date: "2024-02-15" }
      ].slice(0, limit);
    }

    try {
      const options = {
        method: 'GET',
        url: 'https://real-time-amazon-data.p.rapidapi.com/product-reviews',
        params: { asin: asin, country: 'US', sort_by: 'MOST_RECENT' },
        headers: {
          'X-RapidAPI-Key': this.rapidApiKey,
          'X-RapidAPI-Host': 'real-time-amazon-data.p.rapidapi.com'
        }
      };
      const response = await axios.request(options);
      return response.data.data.reviews.map(r => ({
        text: r.review_comment,
        rating: r.review_star_rating,
        date: r.review_date,
        verified: r.is_verified
      })).filter((review) => review.text).slice(0, limit);
    } catch (error) {
      console.error("[ProductService] Review API Error:", error.message);
      throw error;
    }
  }

  async scrapeProductDetails(sourceUrl, asin) {
    if (!sourceUrl) {
      return null;
    }

    try {
      const html = await this.fetchHtml(sourceUrl);
      const title = this.extractProductTitle(html);
      const thumbnail = this.extractProductImage(html);
      const features = this.extractProductFeatures(html);
      const priceText = this.extractProductPrice(html);
      const colorVariants = this.extractColorVariants(html);

      if (!title) {
        return null;
      }

      return {
        name: title,
        asin,
        rating: null,
        reviewCount: 0,
        thumbnail,
        features,
        priceText,
        colorVariants,
        sourceUrl,
      };
    } catch (error) {
      console.warn(`[ProductService] Product scrape failed for ${asin}: ${error.message}`);
      return null;
    }
  }

  async scrapeReviews(asin, sourceUrl, limit) {
    const urlsToTry = [];

    if (sourceUrl) {
      urlsToTry.push(sourceUrl);
      try {
        const parsed = new URL(sourceUrl);
        urlsToTry.push(`https://${parsed.hostname}/product-reviews/${asin}?pageNumber=1&sortBy=recent`);
      } catch {
        urlsToTry.push(`https://www.amazon.in/product-reviews/${asin}?pageNumber=1&sortBy=recent`);
      }
    } else {
      urlsToTry.push(`https://www.amazon.in/product-reviews/${asin}?pageNumber=1&sortBy=recent`);
    }

    for (const url of urlsToTry) {
      try {
        const html = await this.fetchHtml(url);
        const reviews = this.extractReviewsFromHtml(html, limit);
        if (reviews.length > 0) {
          return reviews;
        }
      } catch (error) {
        console.warn(`[ProductService] Review scrape failed for ${url}: ${error.message}`);
      }
    }

    return [];
  }

  async fetchHtml(url) {
    const response = await axios.get(url, {
      headers: this.defaultHeaders,
      timeout: 15000,
    });

    return response.data;
  }

  extractProductTitle(html) {
    const productTitleMatch = html.match(/<span[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i);
    if (productTitleMatch) {
      return this.cleanText(productTitleMatch[1]);
    }

    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogTitleMatch) {
      return this.cleanText(ogTitleMatch[1]);
    }

    return null;
  }

  extractProductImage(html) {
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogImageMatch) {
      return this.cleanText(ogImageMatch[1]);
    }

    return null;
  }

  extractProductFeatures(html) {
    const features = [];
    const bulletMatches = [...html.matchAll(/<li[^>]*><span[^>]*class=["'][^"']*a-list-item[^"']*["'][^>]*>([\s\S]*?)<\/span><\/li>/gi)];

    for (const match of bulletMatches) {
      const text = this.cleanText(match[1]);
      if (!text || text.length < 8) continue;
      if (features.includes(text)) continue;
      features.push(text);
      if (features.length >= 8) break;
    }

    return features;
  }

  extractProductPrice(html) {
    const patterns = [
      /<span[^>]*class=["'][^"']*a-price-whole[^"']*["'][^>]*>([\d,\.]+)<\/span>/i,
      /<span[^>]*id=["']priceblock_ourprice["'][^>]*>([\s\S]*?)<\/span>/i,
      /<span[^>]*id=["']priceblock_dealprice["'][^>]*>([\s\S]*?)<\/span>/i,
      /"priceToPay"\s*:\s*\{[^}]*"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const value = this.cleanText(match[1]);
        if (value) return value;
      }
    }

    return null;
  }

  extractColorVariants(html) {
    const variants = new Set();

    const addCandidate = (value) => {
      const cleaned = this.cleanText(value || "");
      if (!cleaned) return;
      if (cleaned.length < 2 || cleaned.length > 40) return;
      if (/^[0-9]+$/.test(cleaned)) return;
      if (/^(see more|learn more|details)$/i.test(cleaned)) return;
      variants.add(cleaned);
    };

    // JSON blobs often contain variation attributes.
    const jsonPatterns = [
      /"variation_color_name"\s*:\s*"([^"]+)"/gi,
      /"color_name"\s*:\s*"([^"]+)"/gi,
      /"color"\s*:\s*"([^"]+)"/gi,
    ];

    for (const pattern of jsonPatterns) {
      const matches = [...html.matchAll(pattern)];
      for (const match of matches) {
        addCandidate(match[1]);
      }
    }

    // Swatch/title attributes in html
    const swatchPatterns = [
      /data-defaultasin[^>]*title=["']([^"']+)["']/gi,
      /aria-label=["']([^"']+)["'][^>]*data-dp-url/gi,
      /data-a-button-info=["'][^"']*"name":"([^"]+)"[^"']*["']/gi,
    ];

    for (const pattern of swatchPatterns) {
      const matches = [...html.matchAll(pattern)];
      for (const match of matches) {
        addCandidate(match[1]);
      }
    }

    return Array.from(variants).slice(0, 15);
  }

  extractReviewsFromHtml(html, limit) {
    const reviewBodies = [...html.matchAll(/data-hook=["']review-body["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/gi)];
    if (!reviewBodies.length) {
      return [];
    }

    const reviewRatings = [...html.matchAll(/data-hook=["']review-star-rating["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/gi)].map((match) => {
      const text = this.cleanText(match[1]);
      const num = text.match(/([0-9]+(?:\.[0-9]+)?)/);
      return num ? Number.parseFloat(num[1]) : null;
    });

    const reviewDates = [...html.matchAll(/data-hook=["']review-date["'][^>]*>([\s\S]*?)<\/span>/gi)].map((match) => this.cleanText(match[1]));

    const reviews = [];
    for (let i = 0; i < reviewBodies.length && reviews.length < limit; i++) {
      const text = this.cleanText(reviewBodies[i][1]);
      if (!text || text.length < 8) {
        continue;
      }

      reviews.push({
        text,
        rating: reviewRatings[i] ?? null,
        date: reviewDates[i] || null,
        verified: null,
      });
    }

    return reviews;
  }

  cleanText(value) {
    if (!value) return '';

    return value
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

module.exports = new ProductService();
