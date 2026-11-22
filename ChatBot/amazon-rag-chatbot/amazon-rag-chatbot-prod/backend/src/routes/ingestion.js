const express = require("express");
const { z } = require("zod");

const router = express.Router();

const ingestionBodySchema = z.object({
  url: z.string().trim().url(),
  mode: z.literal("amazon-product").default("amazon-product"),
  maxReviews: z.number().int().min(1).max(500).default(100),
  persist: z.boolean().default(true),
});

router.post("/ingestion/url", (req, res) => {
  try {
    const parsed = ingestionBodySchema.parse(req.body || {});

    // Placeholder response for fresh scaffold.
    return res.json({
      success: true,
      sourceId: `src_placeholder_${Date.now()}`,
      status: "queued",
      stage: "queued",
      request: parsed,
      meta: { requestId: req.requestId },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_INGESTION_REQUEST", message: error.message },
      meta: { status: "failed", requestId: req.requestId },
    });
  }
});

router.get("/ingestion/:sourceId/status", (req, res) => {
  const { sourceId } = req.params;
  if (!/^[A-Za-z0-9_-]+$/.test(sourceId)) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_SOURCE_ID", message: "Invalid sourceId format." },
      meta: { status: "failed", requestId: req.requestId },
    });
  }

  return res.json({
    success: true,
    sourceId,
    status: "ready",
    stage: "index-complete",
    reviewsCount: 0,
    errors: [],
    meta: { requestId: req.requestId },
  });
});

module.exports = router;
