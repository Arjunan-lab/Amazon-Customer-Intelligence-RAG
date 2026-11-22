/**
 * Chat Routes - Handles the POST /api/chat endpoint.
 * Receives a user question, calls the Python RAG pipeline,
 * and returns the AI-generated response with source documents.
 */

const express = require("express");
const router = express.Router();
const { queryRAG, RagExecutionError } = require("../services/pythonService");
const logger = require("../utils/logger");

const MAX_QUESTION_LENGTH = 2000;
const SOURCE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function resolveChatTimeoutMs(mode) {
  const sourceDefault = 600000;
  const datasetDefault = 300000;

  if (mode === "source") {
    return Number.parseInt(
      process.env.CHAT_RAG_SOURCE_TIMEOUT_MS ||
        process.env.CHAT_RAG_TIMEOUT_MS ||
        String(sourceDefault),
      10
    );
  }

  return Number.parseInt(
    process.env.CHAT_RAG_DATASET_TIMEOUT_MS ||
      process.env.CHAT_RAG_TIMEOUT_MS ||
      String(datasetDefault),
    10
  );
}

function parseAndValidatePayload(body) {
  const { question, sourceId, mode } = body || {};

  if (!question || typeof question !== "string" || question.trim() === "") {
    throw new RagExecutionError({
      code: "INVALID_QUESTION",
      message: "Missing or empty 'question' field in request body.",
      statusCode: 400,
      userMessage: "Please provide a valid question.",
    });
  }

  const normalizedQuestion = question.trim();

  if (normalizedQuestion.length > MAX_QUESTION_LENGTH) {
    throw new RagExecutionError({
      code: "QUESTION_TOO_LONG",
      message: `'question' cannot exceed ${MAX_QUESTION_LENGTH} characters.`,
      statusCode: 400,
      userMessage: `Question is too long. Limit to ${MAX_QUESTION_LENGTH} characters.`,
    });
  }

  const normalizedSourceId =
    typeof sourceId === "string" && sourceId.trim() ? sourceId.trim() : null;

  if (normalizedSourceId && !SOURCE_ID_PATTERN.test(normalizedSourceId)) {
    throw new RagExecutionError({
      code: "INVALID_SOURCE_ID",
      message: "The provided sourceId format is invalid.",
      statusCode: 400,
      userMessage: "The provided source is invalid.",
    });
  }

  const normalizedMode =
    typeof mode === "string" && mode.trim() ? mode.trim() : normalizedSourceId ? "source" : "dataset";

  if (!["dataset", "source"].includes(normalizedMode)) {
    throw new RagExecutionError({
      code: "INVALID_MODE",
      message: "mode must be either 'dataset' or 'source'.",
      statusCode: 400,
      userMessage: "Invalid mode. Use dataset or source mode.",
    });
  }

  if (normalizedMode === "source" && !normalizedSourceId) {
    throw new RagExecutionError({
      code: "MISSING_SOURCE_ID",
      message: "source mode requires a valid sourceId.",
      statusCode: 400,
      userMessage: "Please provide a sourceId for source mode.",
    });
  }

  return {
    question: normalizedQuestion,
    sourceId: normalizedSourceId,
    mode: normalizedMode,
  };
}

/**
 * POST /api/chat
 * Body: { "question": "user question" }
 * Response: { "answer": "generated response", "sources": ["doc1", "doc2"] }
 */
router.post("/chat", async (req, res) => {
  let resolvedMode = "dataset";
  let normalizedSourceId = null;

  try {
    const payload = parseAndValidatePayload(req.body);
    resolvedMode = payload.mode;
    normalizedSourceId = payload.sourceId;

    logger.info("chat.request.received", {
      requestId: req.requestId,
      mode: resolvedMode,
      sourceId: normalizedSourceId,
      questionLength: payload.question.length,
    });

    const result = await queryRAG({
      question: payload.question,
      sourceId: normalizedSourceId,
      mode: resolvedMode,
    }, {
      traceId: req.requestId,
      timeoutMs: resolveChatTimeoutMs(resolvedMode),
    });

    logger.info("chat.request.completed", {
      requestId: req.requestId,
      mode: resolvedMode,
      sourceId: normalizedSourceId,
      sourcesCount: Array.isArray(result.sources) ? result.sources.length : 0,
    });

    return res.json({
      answer: result.answer || "I couldn't generate a response. Please try again.",
      sources: result.sources || [],
      meta: result.meta || {
        mode: resolvedMode,
        sourceId: normalizedSourceId,
        sourceType: resolvedMode === "source" ? "amazon-url" : "dataset",
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error("chat.request.failed", {
      requestId: req.requestId,
      message: error.message,
      code: error.code || "CHAT_REQUEST_FAILED",
    });

    const statusCode = error.statusCode || 500;
    const errorCode = error.code || "CHAT_REQUEST_FAILED";

    return res.status(statusCode).json({
      answer: error.userMessage || "Sorry, I encountered an error while processing your question. Please try again.",
      sources: [],
      error: {
        code: errorCode,
        message: error.message,
        details: error.details || null,
      },
      meta: {
        mode: resolvedMode,
        sourceId: normalizedSourceId,
        sourceType: resolvedMode === "source" ? "amazon-url" : "dataset",
        status: "failed",
        retriable: statusCode >= 500,
        requestId: req.requestId,
      },
    });
  }
});

module.exports = router;
