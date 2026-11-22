const express = require("express");
const router = express.Router();
const ingestionService = require("../services/ingestionService");
const logger = require("../utils/logger");

const SOURCE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function validateUrlIngestionPayload(body) {
  const { url, mode, maxReviews, persist } = body || {};

  if (!url || typeof url !== "string" || !url.trim()) {
    throw Object.assign(new Error("url is required and must be a non-empty string."), {
      statusCode: 400,
      code: "INVALID_URL",
    });
  }

  const normalizedMode = typeof mode === "string" && mode.trim() ? mode.trim() : "amazon-product";
  if (normalizedMode !== "amazon-product") {
    throw Object.assign(new Error("mode must be 'amazon-product'."), {
      statusCode: 400,
      code: "INVALID_MODE",
    });
  }

  return {
    url: url.trim(),
    mode: normalizedMode,
    maxReviews,
    persist,
  };
}

function sendError(req, res, error) {
  const status = error.statusCode || 500;
  return res.status(status).json({
    success: false,
    error: {
      code: error.code || "INGESTION_ERROR",
      message: error.message || "Failed to create ingestion source.",
    },
    meta: {
      status: "failed",
      retriable: status >= 500,
      requestId: req.requestId,
    },
  });
}

router.post("/url", async (req, res) => {
  try {
    const { url, mode, maxReviews, persist } = validateUrlIngestionPayload(req.body);

    logger.info("ingestion.url.received", {
      requestId: req.requestId,
      mode,
      maxReviews,
      persist: Boolean(persist),
    });

    const result = await ingestionService.createSourceFromUrl({
      url,
      mode,
      maxReviews,
      persist,
    });

    logger.info("ingestion.url.completed", {
      requestId: req.requestId,
      sourceId: result.sourceId,
      status: result.status,
      reviewsCount: result.reviewsCount,
    });

    return res.json(result);
  } catch (error) {
    logger.error("ingestion.url.failed", {
      requestId: req.requestId,
      message: error.message,
      code: error.code || "INGESTION_ERROR",
    });

    return sendError(req, res, error);
  }
});

router.get("/:sourceId/status", async (req, res) => {
  try {
    const { sourceId } = req.params;
    if (!sourceId || !SOURCE_ID_PATTERN.test(sourceId)) {
      const error = Object.assign(new Error("The provided sourceId is not valid."), {
        statusCode: 400,
        code: "INVALID_SOURCE_ID",
      });
      throw error;
    }

    logger.info("ingestion.status.received", {
      requestId: req.requestId,
      sourceId,
    });

    const result = await ingestionService.getSourceStatus(req.params.sourceId);
    return res.json(result);
  } catch (error) {
    logger.error("ingestion.status.failed", {
      requestId: req.requestId,
      message: error.message,
      code: error.code || "INGESTION_ERROR",
    });

    return sendError(req, res, error);
  }
});

module.exports = router;