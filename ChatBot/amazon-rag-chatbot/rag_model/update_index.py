"""
Standalone script to rebuild the FAISS vector index from the dataset.
Usage: python update_index.py
"""

import sys
import os
import time

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

from embeddings import generate_embeddings
from vector_store import VectorStore
from rag_pipeline import load_and_process_data

def rebuild_index():
    print("="*50)
    print("AMAZON RAG - INDEX REBUILDER")
    print("="*50)
    
    start_time = time.time()
    
    # 1. Load data
    documents = load_and_process_data()
    if not documents:
        print("[Error] No documents found to index.")
        return False
        
    # 2. Initialize VectorStore
    store = VectorStore()
    
    # 3. Extract texts for embedding
    texts = [doc["text"] for doc in documents]
    print(f"[Indexer] Generating embeddings for {len(texts)} documents...")
    
    # 4. Generate embeddings
    embeddings = generate_embeddings(texts)
    
    # 5. Build and save index
    print("[Indexer] Building FAISS index...")
    store.build_index(embeddings, documents)
    store.save()
    
    end_time = time.time()
    duration = end_time - start_time
    
    print("="*50)
    print(f"SUCCESS: Index rebuilt in {duration:.2f} seconds")
    print(f"Total Documents: {len(documents)}")
    print("="*50)
    return True

if __name__ == "__main__":
    success = rebuild_index()
    if not success:
        sys.exit(1)
