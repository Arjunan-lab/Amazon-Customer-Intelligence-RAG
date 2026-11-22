/**
 * Express Server - Main entry point for the backend API.
 * Runs on port 5000 with CORS enabled for the React frontend.
 */

const express = require("express");
const cors = require("cors");
const chatRoutes = require("./routes/chat");
const adminRoutes = require("./routes/admin");
const productRoutes = require("./routes/product");
const ingestionRoutes = require("./routes/ingestion");
const requestContext = require("./middleware/requestContext");
const logger = require("./utils/logger");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(requestContext);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Amazon RAG Chatbot API is running",
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use("/api", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/product", productRoutes);
app.use("/api/ingestion", ingestionRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("server.unhandled_error", {
    requestId: req.requestId,
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    answer: "Sorry, an internal server error occurred. Please try again.",
    sources: [],
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: err.message,
    },
    meta: {
      status: "failed",
      retriable: true,
      requestId: req.requestId,
    },
  });
});

// Start server
app.listen(PORT, () => {
  logger.info("server.started", {
    port: PORT,
    baseUrl: `http://localhost:${PORT}`,
    healthUrl: `http://localhost:${PORT}/api/health`,
    chatUrl: `http://localhost:${PORT}/api/chat`,
  });
});
