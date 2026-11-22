"""
Warmup Script - Pre-downloads AI models and builds the vector index.
Run this once before starting the app to avoid initial timeouts.
"""

import os
import sys

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

print("="*50)
print("🚀 AMAZON RAG AI - INITIAL WARMUP")
print("This will download ~1.5GB of AI models and index the dataset.")
print("This ensures the chatbot responds instantly later.")
print("="*50)

try:
    from rag_pipeline import get_vector_store, get_generator
    
    print("\n[1/2] Pre-loading models and building index...")
    # This triggers model download and dataset indexing
    store = get_vector_store()
    
    print("\n[2/2] Pre-loading generation model...")
    # This triggers generation model download
    gen = get_generator()
    
    print("\n" + "="*50)
    print("✅ WARMUP COMPLETE!")
    print("Database is indexed and models are cached.")
    print("You can now start your backend (npm start) and chat smoothly.")
    print("="*50)

except Exception as e:
    print(f"\n❌ ERROR DURING WARMUP: {str(e)}")
    sys.exit(1)
