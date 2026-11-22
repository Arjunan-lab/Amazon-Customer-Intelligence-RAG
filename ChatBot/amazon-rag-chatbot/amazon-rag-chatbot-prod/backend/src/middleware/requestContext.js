const crypto = require("crypto");
const logger = require("../utils/logger");

function requestContext(req, res, next) {
  const startedAt = Date.now();
  const incoming = req.header("x-request-id");
  const requestId = incoming && incoming.trim() ? incoming.trim() : crypto.randomUUID();

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
