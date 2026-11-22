/**
 * Python Service - Spawns and manages the Python FastAPI ML Server.
 * Communicates via HTTP requests to avoid loading models on every request.
 */

const { spawn } = require("child_process");
const path = require("path");
const axios = require("axios");
const logger = require("../utils/logger");

const RAG_SERVER_SCRIPT = path.join(
  __dirname,
  "..",
  "..",
  "rag_model",
  "server.py"
);

class RagExecutionError extends Error {
  constructor({ code, message, statusCode = 500, userMessage = null, details = null }) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.userMessage = userMessage;
    this.details = details;
  }
}

let pythonProcess = null;
let serverReady = false;
let serverStartupPromise = null;

function startPythonServer() {
  if (serverReady) return Promise.resolve();
  if (serverStartupPromise) return serverStartupPromise;

  serverStartupPromise = new Promise((resolve, reject) => {
    logger.info("python.server.starting", { message: "Starting FastAPI ML server..." });

    pythonProcess = spawn("python", [RAG_SERVER_SCRIPT], {
      cwd: path.dirname(RAG_SERVER_SCRIPT),
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
    });

    pythonProcess.stdout.on("data", (data) => {
      const output = data.toString();
      process.stdout.write(`[FastAPI] ${output}`);
      if (output.includes("Uvicorn running on") || output.includes("Application startup complete")) {
        serverReady = true;
        resolve();
      }
    });

    pythonProcess.stderr.on("data", (data) => {
      const output = data.toString();
      process.stderr.write(`[FastAPI ERR] ${output}`);
      if (output.includes("Uvicorn running on") || output.includes("Application startup complete")) {
        serverReady = true;
        resolve();
      }
    });

    pythonProcess.on("close", (code) => {
      serverReady = false;
      serverStartupPromise = null;
      logger.info("python.server.exit", { exitCode: code });
    });

    pythonProcess.on("error", (error) => {
      serverReady = false;
      serverStartupPromise = null;
      logger.error("python.server.error", { error: error.message });
      reject(error);
    });

    // Timeout to prevent hanging forever
    setTimeout(() => {
      if (!serverReady) {
        reject(new Error("Python ML server failed to start within 60 seconds."));
      }
    }, 60000);
  });

  return serverStartupPromise;
}

// Ensure the child process is killed when Node exits
process.on("exit", () => {
  if (pythonProcess) pythonProcess.kill();
});
process.on("SIGINT", () => {
  if (pythonProcess) pythonProcess.kill();
  process.exit();
});
process.on("SIGTERM", () => {
  if (pythonProcess) pythonProcess.kill();
  process.exit();
});

/**
 * Execute the Python RAG pipeline via the FastAPI server.
 *
 * @param {Object} payload - The query payload {question, sourceId, mode}
 * @param {Object} options - Options like timeout
 * @returns {Promise<{answer: string, sources: string[]}>}
 */
async function queryRAG(payload, options = {}) {
  await startPythonServer();

  const traceId = options.traceId || null;
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : Number.parseInt(process.env.CHAT_RAG_TIMEOUT_MS || "300000", 10);

  logger.info("python.rag.start", {
    requestId: traceId,
    timeoutMs,
    mode: payload.mode
  });

  try {
    const response = await axios.post("http://127.0.0.1:8000/generate", payload, {
      timeout: timeoutMs,
      headers: {
        "Content-Type": "application/json"
      }
    });

    logger.info("python.rag.completed", { requestId: traceId });
    return response.data;
  } catch (error) {
    logger.error("python.rag.failed", {
      requestId: traceId,
      message: error.message,
    });

    if (error.response) {
      throw new RagExecutionError({
        code: "RAG_EXECUTION_FAILED",
        message: error.response.data.detail || "ML server returned an error",
        statusCode: error.response.status || 500,
        userMessage: "The AI pipeline failed while generating a response. Please try again in a moment.",
      });
    } else {
      throw new RagExecutionError({
        code: "RAG_CONNECTION_FAILED",
        message: `Failed to connect to ML server: ${error.message}`,
        statusCode: 503,
        userMessage: "The AI service is currently unavailable or still starting up. Please try again.",
      });
    }
  }
}

module.exports = { queryRAG, RagExecutionError };
