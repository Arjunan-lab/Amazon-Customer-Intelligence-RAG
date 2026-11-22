## Plan: URL Review Ingestion

Add a URL-driven ingestion mode that accepts an Amazon product URL, resolves it into structured review data, converts those reviews into the same internal document format as the dataset pipeline, builds a source-specific vector index, and lets chat query that specific source through a `sourceId`. The first implementation should prefer URL -> ASIN extraction -> existing review API reuse. Raw HTML scraping should remain a fallback, not the default path.

## Target Outcome

The finished flow should work like this:

1. User pastes an Amazon product URL.
2. Frontend calls a backend ingestion endpoint.
3. Backend validates the URL, extracts ASIN, fetches reviews, normalizes them, and builds a source-specific index.
4. Backend returns a `sourceId` and ingestion status.
5. User asks chat questions against that `sourceId`.
6. The chatbot answers using only the reviews for that URL unless the user explicitly switches back to the dataset mode.

## Canonical Data Model

All review sources should normalize into this internal schema before indexing:

```json
{
	"id": "review_B08KTZ8249_0001",
	"product": "Kindle Paperwhite",
	"text": "Battery lasts for weeks, but page turns can feel slow.",
	"rating": 4,
	"date": "2025-01-10",
	"verified": true,
	"source": "url-ingest",
	"source_url": "https://www.amazon.com/dp/B08KTZ8249",
	"source_type": "amazon-url",
	"asin": "B08KTZ8249"
}
```

This schema should be shared by:

1. Dataset-based ingestion from [amazon-rag-chatbot/rag_model/rag_pipeline.py](amazon-rag-chatbot/rag_model/rag_pipeline.py)
2. API-fetched reviews from [amazon-rag-chatbot/backend/services/productService.js](amazon-rag-chatbot/backend/services/productService.js)
3. Any future scraper fallback

## Implementation Phases

### Phase 1: Lock the Contracts

Define the request and response formats before changing internals.

#### Endpoint 1: Create URL ingestion source

`POST /api/ingestion/url`

Request body:

```json
{
	"url": "https://www.amazon.com/dp/B08KTZ8249",
	"mode": "amazon-product",
	"maxReviews": 100,
	"persist": true
}
```

Field rules:

1. `url`: required string
2. `mode`: optional, default `amazon-product`
3. `maxReviews`: optional integer, default `100`, max `500`
4. `persist`: optional boolean, default `true`

Success response:

```json
{
	"success": true,
	"sourceId": "src_amazon_B08KTZ8249_20260317_001",
	"status": "ready",
	"product": {
		"name": "Kindle Paperwhite",
		"asin": "B08KTZ8249",
		"thumbnail": "https://...",
		"sourceUrl": "https://www.amazon.com/dp/B08KTZ8249"
	},
	"reviewsCount": 100,
	"index": {
		"strategy": "per-source",
		"persisted": true
	}
}
```

Validation error response:

```json
{
	"success": false,
	"error": {
		"code": "INVALID_URL",
		"message": "Only supported Amazon product URLs are allowed."
	}
}
```

Blocked or empty-source response:

```json
{
	"success": false,
	"error": {
		"code": "NO_REVIEWS_FOUND",
		"message": "No usable reviews were found for this URL."
	}
}
```

#### Endpoint 2: Get ingestion status

`GET /api/ingestion/:sourceId/status`

Success response:

```json
{
	"success": true,
	"sourceId": "src_amazon_B08KTZ8249_20260317_001",
	"status": "ready",
	"stage": "index-complete",
	"product": {
		"name": "Kindle Paperwhite",
		"asin": "B08KTZ8249"
	},
	"reviewsCount": 100,
	"errors": []
}
```

Allowed statuses:

1. `queued`
2. `extracting`
3. `normalizing`
4. `indexing`
5. `ready`
6. `failed`

#### Endpoint 3: Source-aware chat

Update the existing `POST /api/chat` in [amazon-rag-chatbot/backend/routes/chat.js](amazon-rag-chatbot/backend/routes/chat.js).

New request body:

```json
{
	"question": "What are the common complaints about battery life?",
	"sourceId": "src_amazon_B08KTZ8249_20260317_001",
	"mode": "source"
}
```

Rules:

1. `question`: required string
2. `sourceId`: optional string
3. `mode`: optional enum with `dataset`, `source`, `hybrid`
4. If `sourceId` is absent, default to dataset mode

Success response:

```json
{
	"answer": "Most reviewers say the battery lasts a long time, but some mention slower charging and noticeable drain with heavy use.",
	"sources": [
		{
			"product": "Kindle Paperwhite",
			"text": "Battery lasts for weeks, but heavy use drains it faster than expected.",
			"rating": 4,
			"date": "2025-01-10",
			"source": "url-ingest"
		}
	],
	"meta": {
		"mode": "source",
		"sourceId": "src_amazon_B08KTZ8249_20260317_001",
		"sourceType": "amazon-url"
	}
}
```

### Phase 2: Backend URL Resolution and Validation

Build the source creation pipeline in Node before changing Python internals.

#### New backend modules

Recommended files:

1. `amazon-rag-chatbot/backend/routes/ingestion.js`
2. `amazon-rag-chatbot/backend/services/ingestionService.js`
3. `amazon-rag-chatbot/backend/services/urlResolverService.js`
4. `amazon-rag-chatbot/backend/services/reviewNormalizerService.js`

#### Responsibilities

`urlResolverService.js`

1. Validate host against Amazon allowlist
2. Extract ASIN from `/dp/{ASIN}` or `/gp/product/{ASIN}` patterns
3. Return structured resolution metadata

Example resolver output:

```json
{
	"supported": true,
	"sourceType": "amazon-url",
	"asin": "B08KTZ8249",
	"normalizedUrl": "https://www.amazon.com/dp/B08KTZ8249"
}
```

`ingestionService.js`

1. Accept validated URL payload
2. Reuse [amazon-rag-chatbot/backend/services/productService.js](amazon-rag-chatbot/backend/services/productService.js) to fetch reviews
3. Normalize reviews
4. Build the source-specific index
5. Save source metadata
6. Return `sourceId`

#### Exact validation rules

1. Reject non-HTTP URLs
2. Reject unsupported domains
3. Reject Amazon URLs without resolvable ASIN for first milestone
4. Reject `maxReviews < 1` or `maxReviews > 500`
5. Reject empty normalized review lists

### Phase 3: Normalize and Persist Source Data

Separate source metadata from vector artifacts.

#### Suggested storage layout

Create a per-source directory layout such as:

```text
amazon-rag-chatbot/rag_model/indexes/
	src_amazon_B08KTZ8249_20260317_001/
		faiss_index.bin
		documents.pkl
		metadata.json
```

#### metadata.json shape

```json
{
	"sourceId": "src_amazon_B08KTZ8249_20260317_001",
	"sourceType": "amazon-url",
	"url": "https://www.amazon.com/dp/B08KTZ8249",
	"asin": "B08KTZ8249",
	"productName": "Kindle Paperwhite",
	"reviewsCount": 100,
	"createdAt": "2026-03-17T10:30:00Z",
	"status": "ready"
}
```

#### Why this phase matters

The current implementation uses one global cache in [amazon-rag-chatbot/rag_model/vector_store.py](amazon-rag-chatbot/rag_model/vector_store.py). That is acceptable for dataset mode only. URL-ingested sources need isolated storage so one product cannot overwrite another.

### Phase 4: Refactor Python for Source-Specific Indexes

Update the Python RAG layer to accept source-scoped operations.

#### Required refactor targets

1. [amazon-rag-chatbot/rag_model/vector_store.py](amazon-rag-chatbot/rag_model/vector_store.py)
2. [amazon-rag-chatbot/rag_model/rag_pipeline.py](amazon-rag-chatbot/rag_model/rag_pipeline.py)
3. [amazon-rag-chatbot/rag_model/update_index.py](amazon-rag-chatbot/rag_model/update_index.py)

#### New Python interfaces

Recommended functions:

```python
def build_index_for_source(source_id: str, documents: list) -> None:
		pass

def load_vector_store(source_id: str | None = None):
		pass

def ask(question: str, source_id: str | None = None, mode: str = "dataset") -> dict:
		pass
```

#### CLI contract for Node -> Python

Current Python invocation only sends a question through [amazon-rag-chatbot/backend/services/pythonService.js](amazon-rag-chatbot/backend/services/pythonService.js). Replace that with a JSON payload argument.

Suggested process payload:

```json
{
	"question": "What are the common complaints about battery life?",
	"sourceId": "src_amazon_B08KTZ8249_20260317_001",
	"mode": "source"
}
```

Suggested command shape:

```text
python rag_pipeline.py "{...json payload...}"
```

#### Python response payload

```json
{
	"answer": "...",
	"sources": [],
	"meta": {
		"mode": "source",
		"sourceId": "src_amazon_B08KTZ8249_20260317_001"
	}
}
```

### Phase 5: Frontend URL Loading Flow

After backend contracts are stable, wire the client around them.

#### Frontend files

1. [amazon-rag-chatbot/frontend/src/api.js](amazon-rag-chatbot/frontend/src/api.js)
2. [amazon-rag-chatbot/frontend/src/App.jsx](amazon-rag-chatbot/frontend/src/App.jsx)
3. [amazon-rag-chatbot/frontend/src/components/ChatBox.jsx](amazon-rag-chatbot/frontend/src/components/ChatBox.jsx)
4. [amazon-rag-chatbot/frontend/src/components/MessageBubble.jsx](amazon-rag-chatbot/frontend/src/components/MessageBubble.jsx)

#### New frontend API helpers

`createIngestionSource(url, options)`

Request:

```json
{
	"url": "https://www.amazon.com/dp/B08KTZ8249",
	"mode": "amazon-product",
	"maxReviews": 100,
	"persist": true
}
```

`getIngestionStatus(sourceId)`

No body. Poll until `ready` or `failed`.

`sendMessage(question, sourceId, mode)`

Request:

```json
{
	"question": "Is it worth the price?",
	"sourceId": "src_amazon_B08KTZ8249_20260317_001",
	"mode": "source"
}
```

#### UI state model

Recommended client state:

```json
{
	"activeSourceId": "src_amazon_B08KTZ8249_20260317_001",
	"activeSourceStatus": "ready",
	"activeSourceProduct": "Kindle Paperwhite",
	"chatMode": "source"
}
```

#### UI behavior

1. User pastes URL into a new source input
2. User clicks `Load Reviews`
3. UI shows `extracting` or `indexing`
4. Once ready, UI shows active source badge
5. Chat requests include `sourceId`
6. User can clear the source and return to dataset mode

### Phase 6: Fallback Scraping

Only implement this if ASIN-based API retrieval is insufficient.

#### Fallback endpoint behavior

Reuse `POST /api/ingestion/url` with a server-side fallback path.

#### Fallback stages

1. Fetch HTML
2. Parse product title
3. Discover review content blocks
4. Limit pagination
5. Normalize output through the same review schema
6. Build source-specific index

#### Fallback-specific failure response

```json
{
	"success": false,
	"error": {
		"code": "SCRAPE_BLOCKED",
		"message": "The product page could not be scraped reliably. Try another URL or use the dataset mode."
	}
}
```

## Suggested Build Order

1. Add `POST /api/ingestion/url`
2. Add `GET /api/ingestion/:sourceId/status`
3. Add URL validation and ASIN extraction
4. Reuse product review fetching
5. Normalize reviews into canonical schema
6. Add per-source metadata and index storage
7. Refactor Python vector store to load by `sourceId`
8. Extend `POST /api/chat` to accept `sourceId` and `mode`
9. Update frontend API client
10. Add frontend source input and active-source state
11. Update source attribution in response cards
12. Add fallback scraping only if still necessary

## Acceptance Criteria by Phase

### Phase 1 is complete when

1. Backend accepts URL ingestion requests with validated payloads
2. Chat accepts `sourceId` without breaking existing dataset-only usage
3. All error responses use stable `error.code` and `error.message` fields

### Phase 2 is complete when

1. A valid Amazon URL resolves to a usable ASIN
2. Reviews are fetched without scraping for supported product URLs
3. Unsupported URLs fail clearly

### Phase 3 is complete when

1. Source-specific indexes do not overwrite dataset artifacts
2. Multiple ingested URLs can coexist safely
3. Metadata is persisted and queryable by `sourceId`

### Phase 4 is complete when

1. Python can answer against dataset mode and source mode
2. Response payloads include answer, sources, and meta
3. Dataset mode remains backward-compatible

### Phase 5 is complete when

1. User can paste a URL and load reviews from the frontend
2. Frontend shows ingestion state and active source
3. Chat answers against the active URL source

### Phase 6 is complete when

1. API-based resolution failures can fall back to scraping when enabled
2. Scraping respects timeouts, review caps, and graceful failure handling

## Relevant Files

- [amazon-rag-chatbot/backend/routes/chat.js](amazon-rag-chatbot/backend/routes/chat.js) for source-aware chat requests
- [amazon-rag-chatbot/backend/services/pythonService.js](amazon-rag-chatbot/backend/services/pythonService.js) for the Node-to-Python interface
- [amazon-rag-chatbot/backend/services/productService.js](amazon-rag-chatbot/backend/services/productService.js) as the first-choice ingestion backend
- [amazon-rag-chatbot/backend/routes/product.js](amazon-rag-chatbot/backend/routes/product.js) as the current live review orchestration reference
- [amazon-rag-chatbot/backend/routes/admin.js](amazon-rag-chatbot/backend/routes/admin.js) and [amazon-rag-chatbot/backend/services/adminService.js](amazon-rag-chatbot/backend/services/adminService.js) as patterns for ingestion and status endpoints
- [amazon-rag-chatbot/rag_model/rag_pipeline.py](amazon-rag-chatbot/rag_model/rag_pipeline.py), [amazon-rag-chatbot/rag_model/update_index.py](amazon-rag-chatbot/rag_model/update_index.py), and [amazon-rag-chatbot/rag_model/vector_store.py](amazon-rag-chatbot/rag_model/vector_store.py) for source-specific indexing and retrieval
- [amazon-rag-chatbot/frontend/src/api.js](amazon-rag-chatbot/frontend/src/api.js), [amazon-rag-chatbot/frontend/src/App.jsx](amazon-rag-chatbot/frontend/src/App.jsx), [amazon-rag-chatbot/frontend/src/components/ChatBox.jsx](amazon-rag-chatbot/frontend/src/components/ChatBox.jsx), and [amazon-rag-chatbot/frontend/src/components/MessageBubble.jsx](amazon-rag-chatbot/frontend/src/components/MessageBubble.jsx) for URL ingestion UX and source context

## Verification Matrix

1. Submit a valid Amazon product URL and confirm `POST /api/ingestion/url` returns a `sourceId` and `ready` status.
2. Submit an invalid URL and confirm the response returns `INVALID_URL`.
3. Submit a supported Amazon URL with no usable review data and confirm the response returns `NO_REVIEWS_FOUND`.
4. Ask a question with `sourceId` and confirm only source-specific reviews are returned.
5. Ask a question without `sourceId` and confirm the dataset pipeline still works.
6. Ingest two URLs and confirm the second source does not overwrite the first one.
7. Clear the active source on the frontend and confirm chat returns to dataset mode.
8. If fallback scraping is enabled, confirm scrape failures return `SCRAPE_BLOCKED` instead of crashing the backend.

## Decisions

- Include in first milestone: Amazon URL ingestion, source-specific indexes, source-aware chat
- Exclude from first milestone: generic arbitrary-site scraping, multi-domain support, large background ingestion queues
- Prefer API-backed review retrieval over raw HTML scraping whenever an ASIN can be extracted
- Treat the current global FAISS cache as legacy behavior for the default dataset only

This draft is now refined into concrete implementation phases and exact endpoint payloads, and it is ready to be used as the working build plan.
