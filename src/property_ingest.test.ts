import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkDocument, documentRequest } from "./property_ingest.js";

test("maintenance requests split earlier than tenant records", () => {
  const text = Array(130).fill("inspection pending").join(" ");
  assert.ok(chunkDocument(text, "maintenance_request").length > chunkDocument(text, "tenant_document").length);
  assert.equal(chunkDocument("  roof  leak\n reported ", "maintenance_request")[0], "roof leak reported");
  assert.equal(documentRequest.safeParse({ documentId: "a", propertyId: "b", kind: "tenant_document", pdfBase64: "AA==", extra: true }).success, false);
});
