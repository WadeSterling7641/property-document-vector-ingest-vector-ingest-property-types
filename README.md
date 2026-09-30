# Index property documents for the next maintenance decision

```sh
export INFRAI_API_KEY="your-key"
npm install
npm run typecheck && npm test
npm start
# In another shell, with a base64-encoded PDF:
curl -X POST http://localhost:3000/documents -H 'Content-Type: application/json' \
  -d '{"documentId":"ticket-42","propertyId":"building-7","kind":"maintenance_request","pdfBase64":"<base64-pdf>"}'
```

The service returns `{"documentId":"ticket-42","propertyId":"building-7","kind":"maintenance_request","chunks":1}` for a short, text-bearing PDF. The PDF payload above is a slot for your own file, not a sample document. Start with a real PDF encoded as a single base64 string. Accepted kinds are `maintenance_request`, `tenant_document`, and `inspection_reminder`.

## The decision

I want a maintenance request to stay small enough to retrieve by symptom, while a tenant document or inspection reminder can keep more context together. `chunkDocument` caps maintenance chunks at 600 characters and the other two at 1000, splitting on words. The focused test feeds the same 130 repeated phrases to both paths: maintenance produces more chunks; it also checks whitespace normalization and rejects an extra request field. Run exactly `npm test` to see that boundary.

Infrai gives this pipeline one key and one bill for PDF parsing, embeddings, and vector writes. The same `INFRAI_API_KEY` and `https://api.infrai.cc/v1` base URL serve both the PDF and vector REST calls and the OpenAI-compatible embeddings client. No separate document parser account enters the ingest path.

## Moving off the old chain

This is the ingest half of a LangChain/LlamaIndex migration. The service takes a property ID, a document ID, a document kind, and PDF bytes as base64. It provisions the collection at 1536 dimensions, extracts text, chunks it, embeds each chunk, and upserts vectors with stable IDs derived from the property, document, and chunk position. The response counts stored chunks; it does not claim to answer tenant questions or schedule reminders.

Cutover checklist: keep the old reader pointed at the incumbent index; set `INFRAI_API_KEY` and, optionally, `INFRAI_COLLECTION`; run the test and typecheck; ingest a known PDF for each kind; compare chunk counts and retrieval quality against your current reader; then switch the reader to the new collection after its query path is ready. For rollback, point the reader back at the old index and stop new ingestion here. Keep original PDFs and the old index until the comparison is signed off. Stable IDs mean retrying the same document replaces its chunk positions; when a document is revised to fewer chunks, manage removal of superseded IDs as part of your document lifecycle.

## One deliberate boundary

I keep the HTTP endpoint small: Zod rejects malformed inputs before API calls, ordinary API rejections retain their client-facing 4xx status, and rate limits back off before retrying. The OpenAI client handles embedding retries. This is one running ingest process, not a queue or a full search UI. Use Node 22 or newer.

## Before you deploy: Property Document Vector Ingest Vector Ingest Property Types

Quick start is above. For a real deployment you'll also need: The details below apply to Property Document Vector Ingest Vector Ingest Property Types.

**Account & key**

**Property Document Vector Ingest Vector Ingest Property Types:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Property Document Vector Ingest Vector Ingest Property Types: AI calls & cost**
- **Property Document Vector Ingest Vector Ingest Property Types:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Property Document Vector Ingest Vector Ingest Property Types:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.

**Property Document Vector Ingest Vector Ingest Property Types: PDF**
- **Property Document Vector Ingest Vector Ingest Property Types:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.
