import json
import sys


def main():
    raw_payload = "{}"
    if len(sys.argv) > 1:
        raw_payload = sys.argv[1]

    try:
        payload = json.loads(raw_payload)
    except Exception:
        payload = {"question": str(raw_payload)}

    question = str(payload.get("question", "")).strip()
    mode = str(payload.get("mode", "dataset"))
    source_id = payload.get("sourceId")

    answer = (
        "Starter response from fresh rag_pipeline.py. "
        "Integrate embeddings, FAISS retrieval, and generation next."
    )

    if question:
        answer = f"Q: {question}\nA: {answer}"

    result = {
        "answer": answer,
        "sources": [],
        "meta": {
            "mode": mode,
            "sourceId": source_id,
            "sourceType": "amazon-url" if mode == "source" else "dataset",
        },
    }

    print("__RAG_RESULT__" + json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
