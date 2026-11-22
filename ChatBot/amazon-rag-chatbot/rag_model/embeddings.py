"""
Embeddings module - Generates sentence embeddings using Sentence Transformers.
Uses the 'all-MiniLM-L6-v2' model for fast, high-quality embeddings.
"""

import logging
import os

from sentence_transformers import SentenceTransformer
import numpy as np

# Model name for sentence embeddings - Upgraded for more accuracy
MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"

# Global model instance (lazy loaded)
_model = None


def _configure_hf_environment():
    """Configure Hugging Face auth/env behavior for cleaner runtime logs."""
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_HUB_TOKEN")

    # Keep compatibility with both env variable names.
    if token and not os.getenv("HUGGINGFACE_HUB_TOKEN"):
        os.environ["HUGGINGFACE_HUB_TOKEN"] = token

    # Silence unauthenticated hub warning noise in local/dev mode.
    if not token:
        logging.getLogger("huggingface_hub").setLevel(logging.ERROR)
        logging.getLogger("huggingface_hub.file_download").setLevel(logging.ERROR)


def get_model():
    """Load and cache the Sentence Transformer model."""
    global _model
    if _model is None:
        _configure_hf_environment()
        print(f"[Embeddings] Loading model: {MODEL_NAME}...")
        _model = SentenceTransformer(MODEL_NAME)
        print("[Embeddings] Model loaded successfully.")
    return _model


def generate_embeddings(documents: list) -> np.ndarray:
    """
    Generate embeddings for a list of text documents.

    Args:
        documents: List of text strings to embed.

    Returns:
        numpy array of shape (num_documents, embedding_dim)
    """
    model = get_model()
    print(f"[Embeddings] Generating embeddings for {len(documents)} documents...")
    embeddings = model.encode(documents, show_progress_bar=True, convert_to_numpy=True)
    print(f"[Embeddings] Generated embeddings with shape: {embeddings.shape}")
    return embeddings


def generate_query_embedding(query: str) -> np.ndarray:
    """
    Generate embedding for a single query string.

    Args:
        query: The query text to embed.

    Returns:
        numpy array of shape (1, embedding_dim)
    """
    model = get_model()
    embedding = model.encode([query], convert_to_numpy=True)
    return embedding
