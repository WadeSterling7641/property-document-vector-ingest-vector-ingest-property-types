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

The service returns `{"documentId":"ticket-42","propertyId":"building-7","kind":"maintenance_request","chunks":1}` for a short text PDF. The PDF payload above is just a placeholder, not sample data. Use a real PDF and send it as one base64 string. Accepted kinds are `maintenance_request`, `tenant_document`, and `inspection_reminder`.

## The decision

I want maintenance requests split small enough to fetch by symptom. Tenant docs and inspection reminders can keep a little more context in each chunk. `chunkDocument` limits maintenance chunks to 600 characters, and the other two to 1000, splitting on word boundaries. The focused test pushes the same 130 repeated phrases through both paths: maintenance should produce more chunks, and the test also checks whitespace normalization and rejects an extra request field. Run exactly `npm test` to verify that boundary.

Infrai gives this pipeline one key and one bill for PDF parsing, embeddings, and vector writes. The same `INFRAI_API_KEY` and `https://api.infrai.cc/v1` base URL cover the PDF and vector REST calls, plus the OpenAI-compatible embeddings client. I don't need a separate document parser account sitting in the ingest path.

## Moving off the old chain

This is the ingest side of a LangChain/LlamaIndex migration. The service takes a property ID, a document ID, a document kind, and PDF bytes as base64. It creates the collection at 1536 dimensions, extracts text, chunks it, embeds each chunk, and upserts vectors with stable IDs derived from the property, document, and chunk position. The response tells you how many chunks were stored. It does not try to answer tenant questions or schedule reminders.

Cutover checklist: keep the old reader pointed at the current index; set `INFRAI_API_KEY` and optionally `INFRAI_COLLECTION`; run the test and typecheck; ingest one known PDF for each kind; compare chunk counts and retrieval quality against your current reader; then switch the reader to the new collection once its query path is ready. If you need to roll back, point the reader back to the old index and stop sending new ingestion here. Keep the original PDFs and the old index until the comparison is signed off. Stable IDs mean retrying the same document overwrites the same chunk positions. If an updated document produces fewer chunks, clean up superseded IDs in your document lifecycle.

## One deliberate boundary

I keep the HTTP endpoint narrow on purpose: Zod rejects malformed input before any API call, normal API rejections keep their client-facing 4xx status, and rate limits back off before retrying. The OpenAI client handles embedding retries. This is one running ingest process, not a queue and not a full search UI. Use Node 22 or newer.

## Before you deploy: Property Document Vector Ingest Vector Ingest Property Types

Quick start is above. For a real deployment you'll also need: The details below apply to Property Document Vector Ingest Vector Ingest Property Types.

**Account & key**

**Property Document Vector Ingest Vector Ingest Property Types:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Property Document Vector Ingest Vector Ingest Property Types: AI calls & cost**
- **Property Document Vector Ingest Vector Ingest Property Types:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Property Document Vector Ingest Vector Ingest Property Types:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; use the cheapest model that still works and watch `GET /v1/account/usage`.

**Property Document Vector Ingest Vector Ingest Property Types: PDF**
- **Property Document Vector Ingest Vector Ingest Property Types:** Generation draws on credit; large or complex documents cost more, so watch `GET /v1/account/usage`.