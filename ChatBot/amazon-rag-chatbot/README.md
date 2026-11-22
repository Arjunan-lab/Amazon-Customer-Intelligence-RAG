# Amazon Customer Support RAG Chatbot

A full-stack AI-powered chatbot that answers questions about Amazon products using a Retrieval-Augmented Generation (RAG) pipeline. The system retrieves relevant customer reviews and generates intelligent responses.

## 🏗️ Architecture

```
User Question → React Frontend → Node.js API → Python RAG Pipeline
                                                    ↓
                                              1. Embed question (Sentence Transformers)
                                              2. Search FAISS vector database
                                              3. Retrieve top 3 reviews
      4. Generate response (Local Qwen or Gemini API, env-driven)
                                                    ↓
                                              Response + Sources → Frontend
```

## 🛠️ Technology Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| Frontend   | React + Vite + Axios                    |
| Backend    | Node.js + Express.js                    |
| Embeddings | Sentence Transformers (all-MiniLM-L6-v2)|
| Vector DB  | FAISS                                   |
| Generation | Local HuggingFace Transformers or Gemini API |
| Dataset    | Amazon Reviews (~60K reviews, limited to 5000) |

## 📁 Project Structure

```
amazon-rag-chatbot/
├── frontend/               # React + Vite frontend
│   └── src/
│       ├── components/
│       │   ├── ChatBox.jsx
│       │   └── MessageBubble.jsx
│       ├── App.jsx
│       ├── main.jsx
│       ├── api.js
│       └── index.css
├── backend/                # Node.js + Express backend
│   ├── server.js
│   ├── routes/chat.js
│   └── services/pythonService.js
├── rag_model/              # Python RAG pipeline
│   ├── rag_pipeline.py
│   ├── embeddings.py
│   ├── vector_store.py
│   └── requirements.txt
├── dataset/                # Amazon reviews dataset
│   └── amazon_reviews.xls
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v16+)
- **Python** (v3.8+)
- **pip** (Python package manager)

### 1. Install Python Dependencies

```bash
cd rag_model
pip install -r requirements.txt
```

### 2. Start the Backend Server

```bash
cd backend
npm install
npm start
```

The backend will start on `http://localhost:5000`.

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:5173`.

### 4. Open in Browser

Navigate to `http://localhost:5173` and start chatting!

## ⚠️ First Run

The first time you ask a question:
1. The system will download the **Sentence Transformer model** (~90MB)
2. It will download the **default generation model** (**Qwen2.5-0.5B-Instruct**)
3. It will generate embeddings for 5000 reviews (takes a few minutes)
4. The FAISS index will be cached to disk for faster subsequent runs

Optional environment variables for speed/quality tuning:

- `RAG_MODEL_NAME` (default: `Qwen/Qwen2.5-0.5B-Instruct`)
- `RAG_MAX_NEW_TOKENS` (default: `180`)
- `RAG_TEMPERATURE` (default: `0.6`)
- `RAG_TOP_P` (default: `0.9`)
- `RAG_SOURCE_FAST_MODE` (default: `true`) for very fast extractive answers in URL/source chat mode
- `RAG_LLM_PROVIDER` (default: `local`) supports `local`, `gemini`, or `auto`
- `GEMINI_API_KEY` (required when using `RAG_LLM_PROVIDER=gemini`)
- `GEMINI_MODEL` (default: `gemini-1.5-flash`)
- `GEMINI_TIMEOUT_SEC` (default: `45`)
- `GEMINI_FALLBACK_TO_LOCAL` (default: `true`) to fall back to local generation if Gemini fails

Automatic product loading from chat question:

- `CHAT_AUTO_SOURCE_ENABLED` (default: `true`) enables automatic Amazon product discovery from your chat text.
- `CHAT_AUTO_SOURCE_MAX_REVIEWS` (default: `100`) controls how many reviews are fetched for auto-discovered products.
- `AUTO_SOURCE_CACHE_TTL_MS` (default: `1800000`) controls cache time for resolved product sources.

Example (no URL paste required):

- "iphone 17 pro max color variants"
- "kindle paperwhite battery life"

The backend will try to find the product on Amazon, ingest product data + reviews, build a source index, and answer in source mode automatically.

**Subsequent runs will be much faster** since models and index are cached.

## 📡 API Documentation

### POST /api/chat

**Request:**
```json
{
  "question": "What do customers say about battery life?"
}
```

**Response:**
```json
{
  "answer": "Based on customer reviews, battery life is generally praised...",
  "sources": [
    "Review 1 text...",
    "Review 2 text...",
    "Review 3 text..."
  ]
}
```

### GET /api/health

Returns server health status.

## 📄 License

This project is for educational purposes.
