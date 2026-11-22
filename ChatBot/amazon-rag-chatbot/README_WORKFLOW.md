# Amazon RAG Chatbot Workflow Guide

## Purpose
This guide explains the end-to-end workflow of the Amazon RAG Chatbot project, including startup, dataset mode, URL-ingestion mode, source-aware chat, indexing, and troubleshooting.

## System Overview
The project has three execution layers:

1. Frontend (React + Vite): collects user input, triggers ingestion, and displays responses with source metadata.
2. Backend (Node.js + Express): validates requests, orchestrates ingestion, and invokes Python RAG.
3. RAG Engine (Python): performs embedding, retrieval from FAISS, and answer generation.

Main folders:

- frontend: UI and API client.
- backend: REST APIs and orchestration services.
- rag_model: embedding, vector store, and RAG pipeline.
- dataset: base reviews used in dataset mode.

## Runtime Modes

### 1. Dataset Mode
Uses the prebuilt dataset index for general product-support Q&A.

### 2. Source Mode
Uses a source-specific index created from a URL ingestion request.

## Startup Workflow

### Prerequisites

1. Node.js 16+
2. Python 3.8+
3. pip

Optional but recommended:

1. RAPIDAPI_KEY for real Amazon API product/review fetch.
2. HF_TOKEN for faster Hugging Face model downloads.
3. RAG_MODEL_NAME to select the generation model (default: Qwen/Qwen2.5-0.5B-Instruct for lower latency).
4. RAG_MAX_NEW_TOKENS, RAG_TEMPERATURE, and RAG_TOP_P to tune response speed/quality.
5. RAG_SOURCE_FAST_MODE=true to return very fast extractive answers for pasted URL source-mode chat.
6. RAG_LLM_PROVIDER=local|gemini|auto to select generation provider.
7. GEMINI_API_KEY (plus optional GEMINI_MODEL, GEMINI_TIMEOUT_SEC, GEMINI_FALLBACK_TO_LOCAL) when using Gemini generation.
8. CHAT_AUTO_SOURCE_ENABLED=true to auto-discover Amazon products from plain chat questions.
9. CHAT_AUTO_SOURCE_MAX_REVIEWS and AUTO_SOURCE_CACHE_TTL_MS to tune auto-source ingestion volume and cache duration.

### Step-by-step Startup

1. Install backend dependencies.
2. Install frontend dependencies.
3. Install Python requirements.
4. Start backend on port 5000.
5. Start frontend on port 5173.

Commands:

```powershell
# Backend
Set-Location "f:\Coding\VS CODE\Industry\AI Class\ChatBot\amazon-rag-chatbot\backend"
npm install
npm start

# Frontend
Set-Location "f:\Coding\VS CODE\Industry\AI Class\ChatBot\amazon-rag-chatbot\frontend"
npm install
npm run dev

# Python dependencies
Set-Location "f:\Coding\VS CODE\Industry\AI Class\ChatBot\amazon-rag-chatbot\rag_model"
pip install -r requirements.txt
```

## API Workflow

### Health Check

- Endpoint: GET /api/health
- Purpose: confirms backend availability.

### Chat Endpoint

- Endpoint: POST /api/chat
- Request (dataset mode):

```json
{
  "question": "Summarize customer sentiment.",
  "mode": "dataset"
}
```

- Request (source mode):

```json
{
  "question": "What do users say about battery life?",
  "sourceId": "src_amazon_B09B8W5FW7_20260317081344",
  "mode": "source"
}
```

- Response:

```json
{
  "answer": "...",
  "sources": [],
  "meta": {
    "mode": "dataset|source",
    "sourceId": null,
    "sourceType": "dataset|amazon-url"
  }
}
```

### URL Ingestion Endpoint

- Endpoint: POST /api/ingestion/url
- Request:

```json
{
  "url": "https://www.amazon.in/dp/B09B8W5FW7",
  "mode": "amazon-product",
  "maxReviews": 100,
  "persist": true
}
```

- Successful response:

```json
{
  "success": true,
  "sourceId": "src_amazon_B09B8W5FW7_20260317081344",
  "status": "ready",
  "product": {
    "name": "Echo Dot (5th Gen)",
    "asin": "B09B8W5FW7",
    "thumbnail": "...",
    "sourceUrl": "https://www.amazon.in/dp/B09B8W5FW7"
  },
  "reviewsCount": 2,
  "index": {
    "strategy": "per-source",
    "persisted": true
  },
  "resolutionMethod": "direct-asin|keyword-fallback"
}
```

### Source Status Endpoint

- Endpoint: GET /api/ingestion/:sourceId/status
- Purpose: check source index lifecycle state.

Example response:

```json
{
  "success": true,
  "sourceId": "src_amazon_B09B8W5FW7_20260317081344",
  "status": "ready",
  "stage": "index-complete",
  "product": {
    "name": "Echo Dot (5th Gen)",
    "asin": "B09B8W5FW7"
  },
  "reviewsCount": 2,
  "errors": []
}
```

## Detailed End-to-End Request Flow

### A. Dataset Chat Flow

1. User types question in frontend chat panel.
2. Frontend calls POST /api/chat with mode=dataset.
3. Backend route validates payload and invokes pythonService.queryRAG.
4. pythonService spawns rag_pipeline.py with JSON payload.
5. rag_pipeline.py loads dataset vector store or builds it if missing.
6. Query is embedded with sentence-transformers.
7. FAISS retrieves top relevant reviews.
8. LLM composes answer using retrieved context.
9. Python prints JSON output marker.
10. Backend parses result and returns answer + sources + meta.
11. Frontend renders response and source cards.

### B. URL Ingestion + Source Chat Flow

1. User pastes URL in Live URL Ingestion panel.
2. Frontend calls POST /api/ingestion/url.
3. Backend validates URL and tries ASIN extraction.
4. Resolution path:
   - direct-asin: ASIN detected from URL path.
   - keyword-fallback: for supported search URLs with meaningful query keywords.
5. Backend fetches product and reviews via productService.
6. Reviews are normalized into canonical document schema.
7. Source directory is created under rag_model/indexes/<sourceId>.
8. build_source_index.py builds source-specific FAISS + documents files.
9. Ingestion returns sourceId with status=ready.
10. Frontend stores active source and displays status.
11. User asks chat question; frontend sends mode=source and sourceId.
12. Backend/Python load source-specific index and answer from that source context.

## Source Storage Layout

Per-source artifacts are written under:

- rag_model/indexes/<sourceId>/faiss_index.bin
- rag_model/indexes/<sourceId>/documents.pkl
- rag_model/indexes/<sourceId>/metadata.json
- rag_model/indexes/<sourceId>/normalized_documents.json

This prevents source data from overwriting dataset mode indexes.

## Error and Recovery Workflow

### Structured Error Model
Backend chat errors include:

- error.code
- error.message
- error.details
- meta.status (failed)
- meta.retriable (true/false)

Frontend displays error state in message bubbles with source mode and status.

### Common Issues

1. Port 5000 already in use:
   - Stop old listener before starting backend.
2. Python dependency missing:
   - Install rag_model requirements.
3. Slow first request:
   - Model downloads and first-time loading can take minutes.
4. Non-product Amazon URL:
   - Use direct product URL or search URL with k=<keyword>.
5. Irrelevant fallback mapping:
   - Generic listing URLs now fail safely with UNSUPPORTED_URL instead of mapping random products.

## Operational Notes

1. Without RAPIDAPI_KEY, mock product/review data is used.
2. With RAPIDAPI_KEY, real product/review fetch is used.
3. Without HF_TOKEN, Hugging Face still works but may be slower.
4. Dataset and source mode can coexist in one session.

## Recommended Test Sequence

1. GET /api/health
2. POST /api/chat with mode=dataset
3. POST /api/ingestion/url with a direct product URL
4. GET /api/ingestion/:sourceId/status
5. POST /api/chat with mode=source and sourceId
6. In frontend, validate status display, source switching, and error display

## Maintenance Workflow

1. When dataset changes, run admin ingest to rebuild dataset index.
2. For new URL sources, create source via ingestion endpoint.
3. Periodically clean stale source index directories if needed.
4. Keep Python model versions and Node dependencies pinned for stability.

## Security and Validation Summary

1. URL validation enforces HTTP/HTTPS and Amazon host pattern.
2. maxReviews is constrained to 1-500.
3. sourceId format is validated before file lookup.
4. Errors are returned in structured JSON and surfaced in UI.
