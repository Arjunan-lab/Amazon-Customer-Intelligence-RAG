require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const chatRoutes = require("./routes/chat");
const ingestionRoutes = require("./routes/ingestion");
const requestContext = require("./middleware/requestContext");
const logger = require("./utils/logger");

const app = express();
const port = Number.parseInt(process.env.PORT || "5000", 10);

const allowedOrigins = (process.env.FRONTEND_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
  })
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(express.json({ limit: process.env.MAX_BODY_SIZE || "1mb" }));
app.use(requestContext);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "API is running",
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  });
});

app.use("/api", chatRoutes);
app.use("/api", ingestionRoutes);

app.use((err, req, res, next) => {
  logger.error("server.unhandled_error", {
    requestId: req.requestId,
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An internal server error occurred.",
    },
    meta: {
      status: "failed",
      retriable: true,
      requestId: req.requestId,
    },
  });
});

app.listen(port, () => {
  logger.info("server.started", {
    port,
    health: `http://localhost:${port}/api/health`,
  });
});
