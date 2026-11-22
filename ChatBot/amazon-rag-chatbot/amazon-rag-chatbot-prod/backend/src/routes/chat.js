const express = require("express");
const { z } = require("zod");
const { queryRAG } = require("../services/pythonService");
const logger = require("../utils/logger");

const router = express.Router();

const chatBodySchema = z
  .object({
    question: z.string().trim().min(1).max(Number.parseInt(process.env.MAX_QUESTION_LENGTH || "2000", 10)),
    sourceId: z.string().trim().regex(/^[A-Za-z0-9_-]+$/).optional(),
    mode: z.enum(["dataset", "source"]).optional(),
  })
  .transform((v) => ({
    question: v.question,
    sourceId: v.sourceId || null,
    mode: v.mode || (v.sourceId ? "source" : "dataset"),
  }));

router.post("/chat", async (req, res) => {
  let mode = "dataset";
  let sourceId = null;

  try {
    const parsed = chatBodySchema.parse(req.body || {});
    mode = parsed.mode;
    sourceId = parsed.sourceId;

    if (mode === "source" && !sourceId) {
      return res.status(400).json({
        answer: "Please provide sourceId for source mode.",
        sources: [],
        error: { code: "MISSING_SOURCE_ID", message: "source mode requires sourceId" },
        meta: { status: "failed", requestId: req.requestId, mode, sourceId },
      });
    }

    logger.info("chat.request.received", {
      requestId: req.requestId,
      mode,
      sourceId,
      questionLength: parsed.question.length,
    });

    const result = await queryRAG(
      { question: parsed.question, mode, sourceId },
      { traceId: req.requestId }
    );

    return res.json({
      answer: result.answer || "No answer generated.",
      sources: result.sources || [],
      meta: {
        mode,
        sourceId,
        sourceType: mode === "source" ? "amazon-url" : "dataset",
        requestId: req.requestId,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || (error.name === "ZodError" ? 400 : 500);

    return res.status(statusCode).json({
      answer: "Sorry, your request could not be processed.",
      sources: [],
      error: {
        code: error.code || "CHAT_REQUEST_FAILED",
        message: error.message,
        details: error.name === "ZodError" ? error.issues : error.details || null,
      },
      meta: {
        status: "failed",
        retriable: statusCode >= 500,
        mode,
        sourceId,
        requestId: req.requestId,
      },
    });
  }
});

module.exports = router;
