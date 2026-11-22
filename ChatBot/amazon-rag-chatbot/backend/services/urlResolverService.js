const AMAZON_HOST_PATTERN = /(^|\.)amazon\.[a-z.]+$/i;
const ASIN_PATTERNS = [
  /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/product-reviews\/([A-Z0-9]{10})(?:[/?]|$)/i,
];

class UrlResolverError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

class UrlResolverService {
  resolveAmazonProductUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") {
      throw new UrlResolverError("INVALID_URL", "A valid Amazon product URL is required.");
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw new UrlResolverError("INVALID_URL", "The provided URL is not valid.");
    }

    if (!/^https?:$/i.test(parsedUrl.protocol)) {
      throw new UrlResolverError("INVALID_URL", "Only HTTP and HTTPS URLs are supported.");
    }

    if (!AMAZON_HOST_PATTERN.test(parsedUrl.hostname)) {
      throw new UrlResolverError(
        "INVALID_URL",
        "Only supported Amazon product URLs are allowed."
      );
    }

    const asin = this.extractAsin(parsedUrl.pathname);

    if (!asin) {
      const searchQuery = this.extractSearchKeyword(parsedUrl);
      if (!searchQuery) {
        throw new UrlResolverError(
          "UNSUPPORTED_URL",
          "Could not resolve a specific product from this URL. Use a direct Amazon product URL (contains /dp/ or /gp/product/) or a search URL like ?k=phone."
        );
      }

      return {
        supported: true,
        sourceType: "amazon-url",
        asin: null,
        searchQuery,
        normalizedUrl: parsedUrl.toString(),
        hostname: parsedUrl.hostname,
        resolutionMethod: "keyword-fallback",
      };
    }

    return {
      supported: true,
      sourceType: "amazon-url",
      asin,
      normalizedUrl: `https://${parsedUrl.hostname}/dp/${asin}`,
      hostname: parsedUrl.hostname,
      resolutionMethod: "direct-asin",
    };
  }

  extractAsin(pathname) {
    for (const pattern of ASIN_PATTERNS) {
      const match = pathname.match(pattern);
      if (match) {
        return match[1].toUpperCase();
      }
    }

    return null;
  }

  extractSearchKeyword(parsedUrl) {
    const preferredParams = ["k", "keywords", "field-keywords", "query"];

    for (const key of preferredParams) {
      const value = parsedUrl.searchParams.get(key);
      if (value && value.trim()) {
        const normalized = this.normalizeKeyword(value);
        if (normalized) {
          return normalized;
        }
      }
    }

    const ignoredPathTokens = new Set(["b", "s", "gp", "product", "dp"]);
    const pathToken = parsedUrl.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .find((segment) => {
        if (!/[a-z]/i.test(segment)) {
          return false;
        }

        return !ignoredPathTokens.has(segment.toLowerCase());
      });

    if (pathToken) {
      const normalized = this.normalizeKeyword(pathToken.replace(/[-_]+/g, " "));
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  normalizeKeyword(value) {
    const normalized = value
      .replace(/\+/g, " ")
      .replace(/[|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Reject very short/generic tokens so we avoid unrelated fallback matches.
    if (!normalized || normalized.length < 3) {
      return null;
    }

    const lowered = normalized.toLowerCase();
    if (lowered === "all" || lowered === "amazon") {
      return null;
    }

    return normalized;
  }
}

module.exports = new UrlResolverService();
module.exports.UrlResolverError = UrlResolverError;