/**
 * API Client - Axios instance for communicating with the backend.
 */

import axios from "axios";

const API_BASE_URL = "http://localhost:5000";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 1200000, // 20 minutes (first run downloads models and indexes 10k rows)
});

/**
 * Send a chat message to the backend RAG API.
 * @param {string} question - The user's question
 * @param {string | null} sourceId - Optional active ingestion source
 * @param {string} mode - Retrieval mode
 * @returns {Promise<{answer: string, sources: string[]}>}
 */
export async function sendMessage(question, sourceId = null, mode = sourceId ? "source" : "dataset") {
  try {
    const response = await api.post("/api/chat", { question, sourceId, mode });
    return response.data;
  } catch (error) {
    if (error.response) {
      const errorData = error.response.data || {};
      return {
        answer: errorData.answer || "Server error. Please try again later.",
        sources: [],
        error: errorData.error || {
          code: "CHAT_HTTP_ERROR",
          message: "Chat request failed.",
          details: null,
        },
        meta: errorData.meta || {
          mode,
          sourceId,
          sourceType: mode === "source" ? "amazon-url" : "dataset",
          status: "failed",
        },
      };
    } else if (error.request) {
      return {
        answer: "Cannot connect to the server. Make sure the backend is running on port 5000.",
        sources: [],
        error: {
          code: "CHAT_BACKEND_UNREACHABLE",
          message: "No response from backend service.",
          details: null,
        },
        meta: {
          mode,
          sourceId,
          sourceType: mode === "source" ? "amazon-url" : "dataset",
          status: "failed",
        },
      };
    } else {
      return {
        answer: "An unexpected error occurred. Please try again.",
        sources: [],
        error: {
          code: "CHAT_CLIENT_ERROR",
          message: error.message || "Unexpected client error.",
          details: null,
        },
        meta: {
          mode,
          sourceId,
          sourceType: mode === "source" ? "amazon-url" : "dataset",
          status: "failed",
        },
      };
    }
  }
}

export async function submitChatFeedback(payload) {
  try {
    const response = await api.post("/api/chat/feedback", payload);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: {
        code: error.response?.data?.error?.code || "CHAT_FEEDBACK_FAILED",
        message: error.response?.data?.error?.message || error.message || "Feedback submission failed.",
      },
    };
  }
}

export async function getChatFeedbackSummary() {
  try {
    const response = await api.get("/api/chat/feedback/summary");
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: {
        code: error.response?.data?.error?.code || "CHAT_FEEDBACK_SUMMARY_FAILED",
        message: error.response?.data?.error?.message || error.message || "Could not fetch feedback summary.",
      },
      summary: null,
    };
  }
}

export async function createIngestionSource(url, options = {}) {
  try {
    const response = await api.post("/api/ingestion/url", {
      url,
      mode: options.mode || "amazon-product",
      maxReviews: options.maxReviews,
      persist: options.persist,
    });

    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.error?.message || "Failed to create ingestion source."
    );
  }
}

export async function getIngestionStatus(sourceId) {
  try {
    const response = await api.get(`/api/ingestion/${sourceId}/status`);
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.error?.message || "Failed to fetch ingestion status."
    );
  }
}

/**
 * Rebuild the vector index from current datasets.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function rebuildIndex() {
  try {
    const response = await api.post("/api/admin/ingest");
    return response.data;
  } catch (error) {
    console.error("Rebuild failed:", error);
    throw new Error(error.response?.data?.message || "Failed to rebuild index.");
  }
}

/**
 * Search for a product and get its review intelligence.
 */
export async function searchProduct(keyword) {
  try {
    const response = await api.post("/api/product/search", { keyword });
    return response.data;
  } catch (error) {
    console.error("Search failed:", error);
    throw new Error(error.response?.data?.message || "Failed to search product.");
  }
}

export default api;
