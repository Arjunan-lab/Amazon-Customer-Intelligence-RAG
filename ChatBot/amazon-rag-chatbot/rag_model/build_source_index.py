"""
Build a FAISS index for a URL-ingested source directory.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from embeddings import generate_embeddings
from vector_store import VectorStore


def build_source_index(source_dir: str) -> None:
    documents_path = os.path.join(source_dir, "normalized_documents.json")
    index_path = os.path.join(source_dir, "faiss_index.bin")
    docs_path = os.path.join(source_dir, "documents.pkl")

    if not os.path.exists(documents_path):
        raise FileNotFoundError(f"No normalized documents found at {documents_path}")

    with open(documents_path, "r", encoding="utf-8") as handle:
        documents = json.load(handle)

    if not documents:
        raise ValueError("No documents were provided for source indexing.")

    texts = [document["text"] for document in documents if document.get("text")]
    if not texts:
        raise ValueError("No valid review text was available for indexing.")

    embeddings = generate_embeddings(texts)
    store = VectorStore()
    store.build_index(embeddings, documents)
    store.save(index_path=index_path, docs_path=docs_path)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python build_source_index.py <source_dir>")
        sys.exit(1)

    try:
      build_source_index(sys.argv[1])
    except Exception as error:
      print(str(error), file=sys.stderr)
      sys.exit(1)