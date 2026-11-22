const crypto = require("crypto");
const logger = require("../utils/logger");

function getRequestId(req) {
  const incoming = req.header("x-request-id");
  if (typeof incoming === "string" && incoming.trim()) {
    return incoming.trim();
  }

  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function requestContext(req, res, next) {
  const startedAt = Date.now();
  const requestId = getRequestId(req);

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    logger.info("request.completed", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
}

module.exports = requestContext;