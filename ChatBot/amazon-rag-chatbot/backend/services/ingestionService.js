const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const productService = require("./productService");
const urlResolverService = require("./urlResolverService");
const reviewNormalizerService = require("./reviewNormalizerService");

const RAG_MODEL_DIR = path.join(__dirname, "..", "..", "rag_model");
const INDEXES_DIR = path.join(RAG_MODEL_DIR, "indexes");
const BUILD_SOURCE_INDEX_SCRIPT = path.join(RAG_MODEL_DIR, "build_source_index.py");

class IngestionError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

class IngestionService {
  async createSourceFromQuery({ query, maxReviews = 100, persist = true }) {
    const normalizedQuery = (query || "").toString().trim();
    if (!normalizedQuery) {
      throw new IngestionError("INVALID_QUERY", "query is required and must be a non-empty string.", 400);
    }

    const products = await productService.searchProducts(normalizedQuery);
    const matched = Array.isArray(products)
      ? products.find((item) => item && typeof item.asin === "string" && item.asin.trim())
      : null;

    if (!matched) {
      throw new IngestionError("PRODUCT_NOT_FOUND", `No Amazon product match found for '${normalizedQuery}'.`, 404);
    }

    const asin = matched.asin.trim().toUpperCase();
    const sourceUrl = `https://www.amazon.com/dp/${asin}`;

    return this.createSourceFromUrl({
      url: sourceUrl,
      mode: "amazon-product",
      maxReviews,
      persist,
    });
  }

  async createSourceFromUrl({ url, mode = "amazon-product", maxReviews = 100, persist = true }) {
    const normalizedMaxReviews = this.normalizeMaxReviews(maxReviews);
    const resolved = urlResolverService.resolveAmazonProductUrl(url);
    const resolvedAsin = await this.resolveAsin(resolved);
    const sourceId = this.buildSourceId(resolvedAsin);
    const sourceDir = this.getSourceDir(sourceId);

    await fs.mkdir(sourceDir, { recursive: true });

    const normalizedSourceUrl = `https://${resolved.hostname}/dp/${resolvedAsin}`;
    const product = await productService.getProductByAsin(resolvedAsin, normalizedSourceUrl);
    const rawReviews = await productService.fetchReviews(
      resolvedAsin,
      normalizedMaxReviews,
      normalizedSourceUrl
    );

    const productFacts = reviewNormalizerService.normalizeProductFacts({
      sourceId,
      asin: resolvedAsin,
      sourceUrl: normalizedSourceUrl,
      product,
    });

    const reviewDocs = reviewNormalizerService.normalizeAmazonReviews({
      sourceId,
      asin: resolvedAsin,
      sourceUrl: normalizedSourceUrl,
      product,
      reviews: rawReviews,
    });

    const documents = [...productFacts, ...reviewDocs];

    if (reviewDocs.length === 0) {
      throw new IngestionError(
        "NO_REVIEWS_FOUND",
        "No usable reviews were found for this URL.",
        404
      );
    }

    const metadata = {
      sourceId,
      sourceType: resolved.sourceType,
      mode,
      url: normalizedSourceUrl,
      originalUrl: resolved.normalizedUrl,
      asin: resolvedAsin,
      resolutionMethod: resolved.resolutionMethod,
      productName: product.name,
      reviewsCount: reviewDocs.length,
      documentsCount: documents.length,
      createdAt: new Date().toISOString(),
      status: "indexing",
      errors: [],
      product,
      persist: Boolean(persist),
    };

    await this.writeSourceFiles(sourceDir, metadata, documents);

    try {
      await this.buildSourceIndex(sourceDir);
      metadata.status = "ready";
      await this.writeMetadata(sourceDir, metadata);
    } catch (error) {
      metadata.status = "failed";
      metadata.errors = [error.message];
      await this.writeMetadata(sourceDir, metadata);
      throw new IngestionError("INDEX_BUILD_FAILED", error.message, 500);
    }

    return {
      success: true,
      sourceId,
      status: metadata.status,
      product: {
        name: product.name,
        asin: product.asin,
        thumbnail: product.thumbnail || null,
        sourceUrl: normalizedSourceUrl,
      },
      reviewsCount: reviewDocs.length,
      documentsCount: documents.length,
      index: {
        strategy: "per-source",
        persisted: Boolean(persist),
      },
      resolutionMethod: resolved.resolutionMethod,
    };
  }

  async resolveAsin(resolved) {
    if (resolved.asin) {
      return resolved.asin;
    }

    const keyword = resolved.searchQuery;
    if (!keyword) {
      throw new IngestionError(
        "UNSUPPORTED_URL",
        "Could not resolve ASIN from URL and no searchable keyword was found.",
        400
      );
    }

    const products = await productService.searchProducts(keyword);
    const matched = Array.isArray(products)
      ? products.find((item) => item && typeof item.asin === "string" && item.asin.trim())
      : null;

    if (!matched) {
      throw new IngestionError(
        "ASIN_NOT_FOUND",
        `No product ASIN could be resolved for query "${keyword}". Try a direct product URL.`,
        404
      );
    }

    return matched.asin.trim().toUpperCase();
  }

  async getSourceStatus(sourceId) {
    const sanitizedSourceId = this.validateSourceId(sourceId);
    const metadataPath = path.join(this.getSourceDir(sanitizedSourceId), "metadata.json");

    try {
      const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
      return {
        success: true,
        sourceId: metadata.sourceId,
        status: metadata.status,
        stage: metadata.status === "ready" ? "index-complete" : metadata.status,
        product: {
          name: metadata.productName,
          asin: metadata.asin,
        },
        reviewsCount: metadata.reviewsCount,
        errors: metadata.errors || [],
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new IngestionError("SOURCE_NOT_FOUND", "The requested source was not found.", 404);
      }

      throw new IngestionError("SOURCE_STATUS_FAILED", error.message, 500);
    }
  }

  normalizeMaxReviews(value) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      return 100;
    }

    if (parsed < 1 || parsed > 500) {
      throw new IngestionError(
        "INVALID_MAX_REVIEWS",
        "maxReviews must be between 1 and 500."
      );
    }

    return parsed;
  }

  buildSourceId(asin) {
    const now = new Date();
    const stamp = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      String(now.getUTCDate()).padStart(2, "0"),
      String(now.getUTCHours()).padStart(2, "0"),
      String(now.getUTCMinutes()).padStart(2, "0"),
      String(now.getUTCSeconds()).padStart(2, "0"),
    ].join("");

    return `src_amazon_${asin}_${stamp}`;
  }

  validateSourceId(sourceId) {
    if (!sourceId || typeof sourceId !== "string" || !/^[A-Za-z0-9_-]+$/.test(sourceId)) {
      throw new IngestionError("INVALID_SOURCE_ID", "The provided sourceId is not valid.");
    }

    return sourceId;
  }

  getSourceDir(sourceId) {
    return path.join(INDEXES_DIR, sourceId);
  }

  async writeSourceFiles(sourceDir, metadata, documents) {
    await fs.mkdir(sourceDir, { recursive: true });
    await Promise.all([
      this.writeMetadata(sourceDir, metadata),
      fs.writeFile(
        path.join(sourceDir, "normalized_documents.json"),
        JSON.stringify(documents, null, 2),
        "utf8"
      ),
    ]);
  }

  async writeMetadata(sourceDir, metadata) {
    await fs.writeFile(
      path.join(sourceDir, "metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf8"
    );
  }

  buildSourceIndex(sourceDir) {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn("python", [BUILD_SOURCE_INDEX_SCRIPT, sourceDir], {
        cwd: RAG_MODEL_DIR,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });

      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        process.stdout.write(data);
      });

      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderr.trim() || `Source indexer failed with exit code ${code}.`));
      });

      pythonProcess.on("error", (error) => {
        reject(new Error(`Failed to start Python source indexer: ${error.message}`));
      });
    });
  }
}

module.exports = new IngestionService();
module.exports.IngestionError = IngestionError;