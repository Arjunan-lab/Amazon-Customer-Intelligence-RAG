"""
RAG Pipeline - Full Retrieval-Augmented Generation pipeline.
Loads dataset, builds/loads vector index, retrieves relevant documents,
and generates responses using local HuggingFace models or Gemini API.
"""

import sys
import os
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
import pandas as pd
import warnings

warnings.filterwarnings("ignore")

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from embeddings import generate_embeddings, generate_query_embedding
from vector_store import VectorStore


# ----- Configuration -----
DATASET_DIR = os.path.join(os.path.dirname(__file__), "..", "dataset")
INDEXES_DIR = os.path.join(os.path.dirname(__file__), "indexes")
MAX_RECORDS_PER_FILE = 5000
TOP_K = 5 

# Generation tuning (favor speed by default)
RAG_MODEL_NAME = os.getenv("RAG_MODEL_NAME", "Qwen/Qwen2.5-0.5B-Instruct")
RAG_MAX_NEW_TOKENS = int(os.getenv("RAG_MAX_NEW_TOKENS", "180"))
RAG_TEMPERATURE = float(os.getenv("RAG_TEMPERATURE", "0.6"))
RAG_TOP_P = float(os.getenv("RAG_TOP_P", "0.9"))
RAG_SOURCE_FAST_MODE = os.getenv("RAG_SOURCE_FAST_MODE", "true").strip().lower() in ("1", "true", "yes", "on")
RAG_LLM_PROVIDER = os.getenv("RAG_LLM_PROVIDER", "gemini").strip().lower()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyAGScxI3y7nPLWi4U8B-Nnm1IuywEP16h0").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash").strip() or "gemini-1.5-flash"
GEMINI_TIMEOUT_SEC = int(os.getenv("GEMINI_TIMEOUT_SEC", "45"))
GEMINI_FALLBACK_TO_LOCAL = os.getenv("GEMINI_FALLBACK_TO_LOCAL", "true").strip().lower() in ("1", "true", "yes", "on")

# ----- Global state -----
_vector_store_cache = {}
_generator_pipeline = None


def load_and_process_data():
    """
    Load all CSV/Excel files from the dataset directory, clean them, 
    and extract relevant product/review information with fuzzy mapping.
    """
    print(f"[RAG] Scanning dataset directory: {DATASET_DIR}")
    
    if not os.path.exists(DATASET_DIR):
        print(f"[RAG] Error: Dataset directory {DATASET_DIR} not found.")
        return []

    all_documents = []
    
    # Supported extensions
    extensions = ['.csv', '.xls', '.xlsx']
    
    files = [f for f in os.listdir(DATASET_DIR) if any(f.lower().endswith(ext) for ext in extensions)]
    
    if not files:
        print("[RAG] No data files found in dataset/")
        return []

    for filename in files:
        file_path = os.path.join(DATASET_DIR, filename)
        print(f"[RAG] Processing file: {filename}")
        
        try:
            if filename.lower().endswith(('.xls', '.xlsx')):
                df = pd.read_excel(file_path)
            else:
                df = pd.read_csv(file_path, encoding='utf-8', on_bad_lines='skip')
                
            print(f"[RAG] Loaded {len(df)} rows from {filename}")
            
            # Fuzzy Header Mapping
            col_map = {}
            for col in df.columns:
                col_lower = str(col).lower().strip()
                
                # Review Titles
                if any(sub in col_lower for sub in ["reviews.title", "review_title", "review_header", "summary", "title"]):
                    if "review_title" not in col_map: col_map["review_title"] = col
                
                # Review Text
                elif any(sub in col_lower for sub in ["reviews.text", "review_text", "review_body", "content", "text"]):
                    if "review_text" not in col_map: col_map["review_text"] = col
                
                # Product Names
                elif any(sub in col_lower for sub in ["product_name", "product", "name", "title"]):
                    # Note: 'title' is a fallback for both, priority given to review_title if already matched
                    if "product_name" not in col_map: col_map["product_name"] = col
                
                # Ratings (Optional)
                elif any(sub in col_lower for sub in ["rating", "score", "stars"]):
                    if "rating" not in col_map: col_map["rating"] = col

            review_title_col = col_map.get("review_title")
            review_text_col = col_map.get("review_text")
            product_name_col = col_map.get("product_name")

            # Check if we have at least the review text
            if not review_text_col:
                print(f"[RAG] Warning: Could not identify review text column in {filename}. Skipping.")
                continue

            # Clean data
            df = df.dropna(subset=[review_text_col])
            
            # Limit per file
            if len(df) > MAX_RECORDS_PER_FILE:
                df = df.head(MAX_RECORDS_PER_FILE)
                print(f"[RAG] Limited {filename} to {MAX_RECORDS_PER_FILE} records")

            for _, row in df.iterrows():
                title = str(row[review_title_col]).strip() if review_title_col and pd.notnull(row[review_title_col]) else ""
                text = str(row[review_text_col]).strip()
                product = str(row[product_name_col]).strip() if product_name_col and pd.notnull(row[product_name_col]) else "Amazon Product"
                
                combined = f"{title}. {text}" if title and title.lower() != "nan" else text
                
                all_documents.append({
                    "product": product,
                    "text": combined,
                    "source": filename # Metadata for attribution
                })
                
        except Exception as e:
            print(f"[RAG] Error processing {filename}: {str(e)}")

    print(f"[RAG] Total documents created: {len(all_documents)}")
    return all_documents


def get_source_paths(source_id: str):
    source_dir = os.path.join(INDEXES_DIR, source_id)
    return {
        "source_dir": source_dir,
        "index_path": os.path.join(source_dir, "faiss_index.bin"),
        "docs_path": os.path.join(source_dir, "documents.pkl"),
    }


def get_vector_store(source_id: str = None):
    """Get or build the vector store (lazy loading with caching)."""
    cache_key = source_id or "__dataset__"

    if cache_key in _vector_store_cache:
        return _vector_store_cache[cache_key]

    store = VectorStore()

    if source_id:
        source_paths = get_source_paths(source_id)
        if not store.load(source_paths["index_path"], source_paths["docs_path"]):
            raise FileNotFoundError(f"No source index found for sourceId '{source_id}'.")

        _vector_store_cache[cache_key] = store
        print(f"[RAG] Loaded source-specific vector store for {source_id}")
        return store

    # Try to load from disk cache
    if store.load():
        print("[RAG] Loaded cached vector store")
        _vector_store_cache[cache_key] = store
        return store

    # Build from scratch
    print("[RAG] Building vector store from scratch...")
    documents = load_and_process_data()

    # Extract just the text array for the embedding model
    texts = [doc["text"] for doc in documents]
    embeddings = generate_embeddings(texts)

    store.build_index(embeddings, documents)
    store.save()
    print("[RAG] Vector store built and saved to disk")

    _vector_store_cache[cache_key] = store
    return store


_generator_model = None
_generator_tokenizer = None

def get_generator():
    """Load and cache up to a powerful Instruction model."""
    global _generator_model, _generator_tokenizer

    if _generator_model is not None and _generator_tokenizer is not None:
        return _generator_model, _generator_tokenizer

    print(f"[RAG] Loading generation model ({RAG_MODEL_NAME})...")
    from transformers import AutoModelForCausalLM, AutoTokenizer
    import warnings
    warnings.filterwarnings("ignore")

    _generator_tokenizer = AutoTokenizer.from_pretrained(RAG_MODEL_NAME)
    _generator_model = AutoModelForCausalLM.from_pretrained(
        RAG_MODEL_NAME,
        device_map="cpu"
    )
    _generator_model.eval()

    print("[RAG] Generation model loaded")
    return _generator_model, _generator_tokenizer


def _build_generation_prompts(question: str, context_docs: list):
    context = "\n".join([f"- Product: {doc['product']} | Review: {doc['text']}" for doc in context_docs])

    system_prompt = (
        "You are 'Nexus Core', an advanced Amazon Customer Support AI. You answer user questions using the provided product reviews.\n\n"
        "### STEP 1: AMBIGUITY CHECK (MANDATORY)\n"
        "Check if the user's question mentions a SPECIFIC product name (like 'Fire HD 8', 'Kindle Oasis', 'Fire TV Stick', etc.).\n"
        "If the query is generic (e.g., 'How is the battery life?', 'Is the screen good?') and DOES NOT contain a product name, you MUST abort and request clarification.\n"
        "Your reply MUST be exactly: 'I see reviews covering multiple products. To give you an accurate answer, could you please specify which product model you are interested in? (e.g., Fire HD 8, Kindle Paperwhite, etc.)'. DO NOT add any other text.\n\n"
        "### STEP 2: REGULAR RESPONSE (Only if a product IS specified)\n"
        "If the user specified a product:\n"
        "1. Synthesize the reviews naturally in paragraph form.\n"
        "2. Never use robotic phrasing like 'Based on review 1'. Instead say 'Most users find...' or 'Many customers noted...'.\n"
        "3. Only use the provided context."
    )
    
    user_prompt = f"### CONTEXT (Product Reviews):\n{context}\n\n### USER QUESTION:\n{question}"
    return system_prompt, user_prompt


def _generate_response_local(question: str, context_docs: list) -> str:
    """Generate a response with the local HuggingFace model."""
    system_prompt, user_prompt = _build_generation_prompts(question, context_docs)

    model, tokenizer = get_generator()
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True
    )
    
    model_inputs = tokenizer([text], return_tensors="pt").to(model.device)

    # Generate high-quality response
    outputs = model.generate(
        **model_inputs,
        max_new_tokens=RAG_MAX_NEW_TOKENS,
        do_sample=True,
        temperature=RAG_TEMPERATURE,
        top_p=RAG_TOP_P
    )
    
    # Extract only the newly generated text (ignore the prompt)
    generated_ids = [
        output_ids[len(input_ids):] for input_ids, output_ids in zip(model_inputs.input_ids, outputs)
    ]
    answer = tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()
    return answer


def _extract_gemini_text(response_json: dict) -> str:
    candidates = response_json.get("candidates") or []

    for candidate in candidates:
        content = candidate.get("content") or {}
        parts = content.get("parts") or []

        for part in parts:
            text = (part or {}).get("text")
            if isinstance(text, str) and text.strip():
                return text.strip()

    raise RuntimeError("Gemini response did not contain generated text.")


def _generate_response_gemini(question: str, context_docs: list) -> str:
    """Generate a response with Gemini API using the same RAG context."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    system_prompt, user_prompt = _build_generation_prompts(question, context_docs)

    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(GEMINI_MODEL, safe='')}:generateContent"
        f"?key={urllib.parse.quote(GEMINI_API_KEY, safe='')}"
    )

    payload = {
        "systemInstruction": {
            "parts": [{"text": system_prompt}],
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_prompt}],
            }
        ],
        "generationConfig": {
            "maxOutputTokens": RAG_MAX_NEW_TOKENS,
            "temperature": RAG_TEMPERATURE,
            "topP": RAG_TOP_P,
        },
    }

    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=GEMINI_TIMEOUT_SEC) as response:
            raw_response = response.read().decode("utf-8")
    except urllib.error.HTTPError as http_error:
        error_body = http_error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Gemini API request failed with status {http_error.code}: {error_body[:400]}"
        ) from http_error
    except urllib.error.URLError as url_error:
        raise RuntimeError(f"Gemini API connection failed: {url_error.reason}") from url_error

    try:
        response_json = json.loads(raw_response)
    except json.JSONDecodeError as parse_error:
        raise RuntimeError("Gemini API returned non-JSON response.") from parse_error

    return _extract_gemini_text(response_json)


def generate_response(question: str, context_docs: list) -> str:
    """Generate a response based on provider selection (local or Gemini)."""
    provider = (RAG_LLM_PROVIDER or "local").strip().lower()

    if provider == "auto":
        provider = "gemini" if GEMINI_API_KEY else "local"

    if provider == "gemini":
        try:
            return _generate_response_gemini(question, context_docs)
        except Exception as error:
            if not GEMINI_FALLBACK_TO_LOCAL:
                raise
            print(f"[RAG] Gemini generation failed ({error}). Falling back to local model.")
            return _generate_response_local(question, context_docs)

    if provider != "local":
        print(f"[RAG] Unknown RAG_LLM_PROVIDER '{provider}'. Falling back to local model.")

    return _generate_response_local(question, context_docs)


def _clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", (text or "")).strip()
    return text


def _tokenize(text: str) -> list:
    return re.findall(r"[a-z0-9]+", (text or "").lower())


def _question_terms(question: str) -> set:
    stopwords = {
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
        "how", "i", "in", "is", "it", "its", "me", "my", "of", "on", "or", "that", "the",
        "to", "what", "when", "which", "who", "why", "with", "you", "your", "about", "tell",
        "this", "those", "these", "can", "does", "do", "if", "any", "there", "their", "they",
    }
    return {t for t in _tokenize(question) if t not in stopwords and len(t) > 2}


def _is_color_question(question: str) -> bool:
    q = (question or "").lower()
    return any(k in q for k in ["color", "colour", "variant", "variants", "shade"]) 


def _extract_color_mentions(context_docs: list) -> list:
    common_colors = {
        "black", "white", "blue", "red", "green", "yellow", "pink", "purple", "orange", "gold",
        "silver", "gray", "grey", "beige", "brown", "violet", "navy", "teal", "midnight", "starlight",
        "titanium", "natural", "desert", "graphite", "space", "rose", "coral", "ultramarine",
    }

    counts = Counter()
    for doc in context_docs:
        text = _clean_text(doc.get("text", ""))
        for token in _tokenize(text):
            if token in common_colors:
                counts[token] += 1

    return [name for name, _ in counts.most_common(8)]


def _extract_color_variants_from_facts(context_docs: list) -> list:
    variants = []
    for doc in context_docs:
        text = _clean_text(doc.get("text", ""))
        if not text:
            continue

        m = re.search(r"available color variants\s*:\s*(.+)$", text, flags=re.IGNORECASE)
        if not m:
            continue

        raw_list = m.group(1)
        parts = [p.strip(" .") for p in raw_list.split(",")]
        for part in parts:
            if part and part.lower() not in {v.lower() for v in variants}:
                variants.append(part)

    return variants[:12]


def _pick_key_snippets(context_docs: list, max_items: int = 3, max_chars: int = 220) -> list:
    snippets = []
    for doc in context_docs:
        review_text = _clean_text(doc.get("text", ""))
        if not review_text:
            continue
        snippet = review_text[:max_chars].rstrip(" ,;:-")
        snippets.append({
            "product": doc.get("product", "Amazon Product"),
            "snippet": snippet,
        })
        if len(snippets) >= max_items:
            break
    return snippets


def _pick_question_aware_snippets(question: str, context_docs: list, max_items: int = 3, max_chars: int = 220) -> list:
    q_terms = _question_terms(question)
    if not q_terms:
        return _pick_key_snippets(context_docs, max_items=max_items, max_chars=max_chars)

    ranked = []
    for doc in context_docs:
        review_text = _clean_text(doc.get("text", ""))
        if not review_text:
            continue

        tokens = set(_tokenize(review_text))
        overlap = len(q_terms.intersection(tokens))
        density_bonus = min(2, overlap)
        score = overlap * 3 + density_bonus

        ranked.append({
            "product": doc.get("product", "Amazon Product"),
            "snippet": review_text[:max_chars].rstrip(" ,;:-"),
            "score": score,
        })

    ranked.sort(key=lambda x: x["score"], reverse=True)
    filtered = [r for r in ranked if r["score"] > 0][:max_items]
    if filtered:
        return [{"product": r["product"], "snippet": r["snippet"]} for r in filtered]

    return _pick_key_snippets(context_docs, max_items=max_items, max_chars=max_chars)


def generate_fast_response(question: str, context_docs: list) -> str:
    """
    Ultra-fast extractive response for source mode.
    Avoids loading a generation model to keep latency low.
    """
    snippets = _pick_question_aware_snippets(question, context_docs)
    if not snippets:
        return "I could not find enough review context for this product yet. Please try again with a more specific question."

    product_name = snippets[0]["product"]

    if _is_color_question(question):
        exact_variants = _extract_color_variants_from_facts(context_docs)
        if exact_variants:
            palette = ", ".join(exact_variants[:10])
            return (
                f"For {product_name}, the available color variants from product data are: {palette}."
            )

        colors = _extract_color_mentions(context_docs)
        if colors:
            palette = ", ".join(colors[:6])
            evidence = " ".join([f"{idx + 1}) {item['snippet']}." for idx, item in enumerate(snippets[:2])])
            return (
                f"For {product_name}, reviewers mention these color variants most often: {palette}. "
                f"From the available review context: {evidence}"
            )

        return (
            f"For {product_name}, I could not find clear color-variant mentions in the current review context. "
            f"If you want exact official colors, I can still summarize what reviewers said after you share more product-specific reviews."
        )

    opening = f"For {product_name}, regarding your question '{_clean_text(question)}', reviewers mention:"
    bullets = " ".join([f"{idx + 1}) {item['snippet']}." for idx, item in enumerate(snippets)])
    follow_up = "Ask a specific follow-up like battery, camera, display, performance, or price for a tighter answer."
    return f"{opening} {bullets} {follow_up}"


def ask(question: str, source_id: str = None, mode: str = "dataset") -> dict:
    """
    Full RAG pipeline: retrieve relevant documents and generate a response.

    Args:
        question: User's question string

    Returns:
        Dict with 'answer' and 'sources' keys
    """
    # Get vector store
    use_source_store = bool(source_id and mode != "dataset")
    store = get_vector_store(source_id if use_source_store else None)

    # Generate query embedding
    query_embedding = generate_query_embedding(question)

    # Retrieve top-k similar documents
    results = store.search(query_embedding, top_k=TOP_K)
    source_docs = [r["document"] for r in results]

    # Generate response
    if mode == "source" and RAG_SOURCE_FAST_MODE:
        answer = generate_fast_response(question, source_docs)
    else:
        answer = generate_response(question, source_docs)

    return {
        "answer": answer,
        "sources": source_docs,
        "meta": {
            "mode": mode,
            "sourceId": source_id,
            "sourceType": "amazon-url" if use_source_store else "dataset"
        }
    }


def parse_cli_payload(raw_payload: str) -> dict:
    try:
        parsed = json.loads(raw_payload)
        if isinstance(parsed, dict) and parsed.get("question"):
            return {
                "question": parsed.get("question", ""),
                "sourceId": parsed.get("sourceId"),
                "mode": parsed.get("mode", "dataset")
            }
    except json.JSONDecodeError:
        pass

    return {
        "question": raw_payload,
        "sourceId": None,
        "mode": "dataset"
    }


if __name__ == "__main__":
    # CLI interface for Node.js to call
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No question provided. Usage: python rag_pipeline.py 'your question'"}))
        sys.exit(1)

    payload = parse_cli_payload(sys.argv[1])

    try:
        result = ask(
            payload["question"],
            source_id=payload.get("sourceId"),
            mode=payload.get("mode", "dataset")
        )
        # Print JSON to stdout for Node.js to parse
        print("__RAG_RESULT__" + json.dumps(result))
    except Exception as e:
        print("__RAG_RESULT__" + json.dumps({"error": str(e), "answer": f"Sorry, an error occurred: {str(e)}", "sources": []}))
        sys.exit(1)
