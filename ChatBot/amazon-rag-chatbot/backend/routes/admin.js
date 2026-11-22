const express = require("express");
const router = express.Router();
const adminService = require("../services/adminService");

/**
 * POST /api/admin/ingest
 * Triggers the data ingestion and index rebuild process.
 */
router.post("/ingest", async (req, res) => {
  try {
    const result = await adminService.triggerReindex();
    res.json(result);
  } catch (error) {
    console.error("[Admin API] Reindex failed:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/status
 * Returns the current indexing status.
 */
router.get("/status", (req, res) => {
  res.json(adminService.getStatus());
});

module.exports = router;
