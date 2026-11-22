import os
import sys
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from rag_pipeline import ask, get_vector_store, get_generator

app = FastAPI(title="Amazon RAG Chatbot ML Service")

class QueryRequest(BaseModel):
    question: str
    sourceId: Optional[str] = None
    mode: str = "dataset"

@app.on_event("startup")
async def startup_event():
    print("[FastAPI] Starting ML service. Warming up models and indexes...")
    try:
        # Pre-load default dataset index
        get_vector_store()
        # Pre-load the local LLM if provider is local
        provider = (os.getenv("RAG_LLM_PROVIDER", "gemini").strip().lower())
        if provider == "local" or (provider == "auto" and not os.getenv("GEMINI_API_KEY")):
            get_generator()
        print("[FastAPI] Warmup complete.")
    except Exception as e:
        print(f"[FastAPI] Warmup error (ignoring): {e}")

@app.post("/generate")
async def generate_response(req: QueryRequest):
    try:
        result = ask(
            question=req.question,
            source_id=req.sourceId,
            mode=req.mode
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Run the uvicorn server
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
