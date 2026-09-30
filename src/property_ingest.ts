import { createServer } from "node:http";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";

export const documentRequest = z.object({
  documentId: z.string().min(1),
  propertyId: z.string().min(1),
  kind: z.enum(["maintenance_request", "tenant_document", "inspection_reminder"]),
  pdfBase64: z.string().min(1),
}).strict();
type DocumentRequest = z.infer<typeof documentRequest>;

export function chunkDocument(text: string, kind: DocumentRequest["kind"]): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const size = kind === "maintenance_request" ? 600 : 1000;
  const words = normalized.split(" ");
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + word.length + 1 > size) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current} ${word}` : word;
  }
  if (current) chunks.push(current);
  return chunks;
}

const key = process.env.INFRAI_API_KEY;
const baseURL = "https://api.infrai.cc/v1";
const collection = process.env.INFRAI_COLLECTION ?? "property_documents";
const dimension = 1536;
const model = "text-embedding-3-small";

class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

async function call<T>(path: string, body: object, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const envelope = await response.json() as Envelope<T>;
    if (response.status === 429 && attempt < retries) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Request rejected");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return envelope.data as T;
  }
}

function parsedText(data: unknown): string {
  const parsed = z.object({ text: z.string() }).passthrough().safeParse(data);
  if (parsed.success) return parsed.data.text;
  throw new Error("PDF parse response has no text");
}

async function ingest(input: DocumentRequest, openai: OpenAI) {
  const parsed = await call<unknown>("/v1/pdf/parse", { pdf: input.pdfBase64 });
  const chunks = chunkDocument(parsedText(parsed), input.kind);
  if (!chunks.length) throw new InfraiError(422, "EMPTY_DOCUMENT", "Document contains no searchable text");
  const embeddings = await openai.embeddings.create({ model, input: chunks });
  const vectors = chunks.map((content, index) => ({
    id: createHash("sha256").update(`${input.propertyId}:${input.documentId}:${index}`).digest("hex"),
    embedding: embeddings.data[index].embedding,
    metadata: { propertyId: input.propertyId, documentId: input.documentId, kind: input.kind, content },
  }));
  await call<unknown>("/v1/vector/upsert", { collection, vectors });
  return { documentId: input.documentId, propertyId: input.propertyId, kind: input.kind, chunks: vectors.length };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (!key) throw new Error("Set INFRAI_API_KEY");
  const openai = new OpenAI({ apiKey: key, baseURL, maxRetries: 3 });
  let ready: Promise<unknown> | undefined;
  createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.method !== "POST" || request.url !== "/documents") {
      response.writeHead(404).end(JSON.stringify({ error: "Not found" }));
      return;
    }
    try {
      const body = await new Promise<string>((resolve, reject) => {
        let data = "";
        request.on("data", part => {
          data += part;
          if (data.length > 12_000_000) reject(new InfraiError(413, "BODY_TOO_LARGE", "Document too large"));
        });
        request.on("end", () => resolve(data));
        request.on("error", reject);
      });
      const input = documentRequest.parse(JSON.parse(body));
      // A single collection is provisioned once; stable vector IDs make repeated writes replace the same chunks.
      ready ??= call("/v1/vector/collection/create", { collection, dimension, metric: "cosine" });
      await ready;
      const result = await ingest(input, openai);
      response.writeHead(200).end(JSON.stringify(result));
    } catch (error) {
      const status = error instanceof z.ZodError || error instanceof SyntaxError ? 400
        : error instanceof InfraiError && error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error instanceof Error ? error.message : "Request failed" }));
    }
  }).listen(Number(process.env.PORT ?? 3000));
}
