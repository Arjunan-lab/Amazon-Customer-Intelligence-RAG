# Amazon RAG Chatbot (Production Starter)

This is a clean, production-oriented scaffold for an Amazon RAG chatbot with:
- Frontend: React + Vite
- Backend: Node.js + Express
- RAG engine: Python scripts

## Project Layout

- backend: API server and orchestration
- frontend: user interface
- rag_model: Python retrieval and answer pipeline

## Quick Start

1. Backend

```powershell
Set-Location .\backend
npm install
npm run dev
```

2. Frontend

```powershell
Set-Location ..\frontend
npm install
npm run dev
```

3. Python

```powershell
Set-Location ..\rag_model
pip install -r requirements.txt
```

## Environment

Copy `backend/.env.example` to `backend/.env` and update values as needed.
