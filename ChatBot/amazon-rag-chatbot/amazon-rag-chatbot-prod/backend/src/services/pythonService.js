const path = require("path");
const { spawn } = require("child_process");
const logger = require("../utils/logger");

const RAG_SCRIPT_PATH = path.join(__dirname, "..", "..", "..", "rag_model", "rag_pipeline.py");

class RagExecutionError extends Error {
  constructor({ code, message, statusCode = 500, userMessage = "Request failed", details = null }) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.userMessage = userMessage;
    this.details = details;
  }
}

function queryRAG(payload, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : Number.parseInt(process.env.CHAT_RAG_TIMEOUT_MS || "120000", 10);

  return new Promise((resolve, reject) => {
    const traceId = options.traceId || null;
    const args = [RAG_SCRIPT_PATH, JSON.stringify(payload)];

    logger.info("python.rag.start", { requestId: traceId, timeoutMs });

    const proc = spawn("python", args, {
      cwd: path.dirname(RAG_SCRIPT_PATH),
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        RAG_TRACE_ID: traceId || "",
      },
    });

    let stdout = "";
    let stderr = "";

    const timeoutHandle = setTimeout(() => {
      proc.kill();
      reject(new RagExecutionError({
        code: "RAG_TIMEOUT",
        message: `RAG timed out after ${timeoutMs}ms`,
        statusCode: 504,
        userMessage: "The request timed out. Please try again.",
      }));
    }, timeoutMs);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", (error) => {
      clearTimeout(timeoutHandle);
      reject(new RagExecutionError({
        code: "PYTHON_PROCESS_START_FAILED",
        message: error.message,
        statusCode: 500,
        userMessage: "Python process failed to start.",
      }));
    });

    proc.on("close", (code) => {
      clearTimeout(timeoutHandle);
      logger.info("python.rag.exit", { requestId: traceId, exitCode: code });

      const marker = "__RAG_RESULT__";
      const markerIndex = stdout.lastIndexOf(marker);

      try {
        if (markerIndex !== -1) {
          const json = stdout.slice(markerIndex + marker.length).trim();
          resolve(JSON.parse(json));
          return;
        }

        const lastLine = stdout.trim().split("\n").pop();
        resolve(JSON.parse(lastLine));
      } catch (error) {
        reject(new RagExecutionError({
          code: "RAG_INVALID_RESPONSE",
          message: error.message,
          statusCode: 500,
          userMessage: "The model returned an invalid response.",
          details: stderr.slice(0, 500),
        }));
      }
    });
  });
}

module.exports = {
  queryRAG,
  RagExecutionError,
};
