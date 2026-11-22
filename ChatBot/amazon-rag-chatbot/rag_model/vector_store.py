"""
Vector Store module - FAISS-based vector database for similarity search.
Supports building, saving, loading, and querying the index.
"""

import faiss
import numpy as np
import os
import pickle

# Default paths for persistence
INDEX_PATH = os.path.join(os.path.dirname(__file__), "faiss_index.bin")
DOCS_PATH = os.path.join(os.path.dirname(__file__), "documents.pkl")


class VectorStore:
    """FAISS-based vector store for document similarity search."""

    def __init__(self):
        self.index = None
        self.documents = []

    def build_index(self, embeddings: np.ndarray, documents: list):
        """
        Build a FAISS index from embeddings and associate documents.

        Args:
            embeddings: numpy array of shape (num_docs, embedding_dim)
            documents: List of document strings corresponding to embeddings
        """
        dimension = embeddings.shape[1]
        self.index = faiss.IndexFlatL2(dimension)
        # Normalize embeddings for better similarity search
        faiss.normalize_L2(embeddings)
        self.index.add(embeddings)
        self.documents = documents
        print(f"[VectorStore] Built index with {self.index.ntotal} vectors (dim={dimension})")

    def save(self, index_path: str = None, docs_path: str = None):
        """Save the FAISS index and documents to disk."""
        index_path = index_path or INDEX_PATH
        docs_path = docs_path or DOCS_PATH

        os.makedirs(os.path.dirname(index_path), exist_ok=True)
        os.makedirs(os.path.dirname(docs_path), exist_ok=True)

        faiss.write_index(self.index, index_path)
        with open(docs_path, "wb") as f:
            pickle.dump(self.documents, f)
        print(f"[VectorStore] Saved index to {index_path}")
        print(f"[VectorStore] Saved {len(self.documents)} documents to {docs_path}")

    def load(self, index_path: str = None, docs_path: str = None) -> bool:
        """
        Load the FAISS index and documents from disk.

        Returns:
            True if loaded successfully, False if files don't exist.
        """
        index_path = index_path or INDEX_PATH
        docs_path = docs_path or DOCS_PATH

        if not os.path.exists(index_path) or not os.path.exists(docs_path):
            print("[VectorStore] No saved index found.")
            return False

        self.index = faiss.read_index(index_path)
        with open(docs_path, "rb") as f:
            self.documents = pickle.load(f)
        print(f"[VectorStore] Loaded index with {self.index.ntotal} vectors")
        print(f"[VectorStore] Loaded {len(self.documents)} documents")
        return True

    def search(self, query_embedding: np.ndarray, top_k: int = 3) -> list:
        """
        Search for the top-k most similar documents.

        Args:
            query_embedding: numpy array of shape (1, embedding_dim)
            top_k: Number of results to return

        Returns:
            List of dicts with 'document', 'score', and 'index' keys.
        """
        if self.index is None:
            raise ValueError("Index not built or loaded. Call build_index() or load() first.")

        # Normalize query embedding
        query_embedding = query_embedding.copy()
        faiss.normalize_L2(query_embedding)

        distances, indices = self.index.search(query_embedding, top_k)

        results = []
        for i, (dist, idx) in enumerate(zip(distances[0], indices[0])):
            if idx < len(self.documents) and idx >= 0:
                results.append({
                    "document": self.documents[idx],
                    "score": float(dist),
                    "index": int(idx)
                })

        return results
