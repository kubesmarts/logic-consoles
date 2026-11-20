/**
 * YAML document utilities for the resource editor.
 *
 * Strip server-managed fields, parse/serialize with preservation of comments and
 * advanced fields, and patch specific paths for form updates.
 */
import { Document, parseDocument, isMap, isScalar } from "yaml";
import type { KubeObject } from "../contracts/index.ts";
import type { ParsedDraft, FieldUpdate } from "./types.ts";

/**
 * Server-managed fields to strip from editable content (ADR 0001: "Remove server-managed
 * fields from editable content and retain concurrency tokens separately").
 */
const SERVER_MANAGED_METADATA_FIELDS = [
  "resourceVersion",
  "generation",
  "uid",
  "creationTimestamp",
  "deletionTimestamp",
  "deletionGracePeriodSeconds",
  "managedFields",
  "selfLink",
];

const SERVER_MANAGED_TOP_LEVEL = ["status"];

/**
 * Create an editable draft from a live object. Strips server-managed fields but
 * preserves legal advanced fields, annotations, container settings, etc.
 */
export const createDraftFromObject = <TSpec = unknown>(
  object: KubeObject<TSpec>,
): ParsedDraft<TSpec> => {
  const doc = new Document(structuredClone(object));

  // Strip server-managed metadata fields
  const contents = doc.contents;
  if (isMap(contents)) {
    const metadata = contents.get("metadata");
    if (isMap(metadata)) {
      for (const field of SERVER_MANAGED_METADATA_FIELDS) {
        metadata.delete(field);
      }
    }
    // Strip status
    for (const field of SERVER_MANAGED_TOP_LEVEL) {
      contents.delete(field);
    }
  }

  return parseDraft(doc);
};

/**
 * Parse a YAML document and extract the object. Returns invalid=true if the YAML
 * is syntactically invalid; object is null in that case.
 */
export const parseDraft = <TSpec = unknown>(doc: Document): ParsedDraft<TSpec> => {
  if (doc.errors.length > 0) {
    return { document: doc, object: null, invalid: true };
  }
  try {
    const object = doc.toJSON() as KubeObject<TSpec>;
    // Basic validation: must have apiVersion, kind, metadata
    if (
      !object ||
      typeof object !== "object" ||
      !("apiVersion" in object) ||
      !("kind" in object) ||
      !("metadata" in object)
    ) {
      return { document: doc, object: null, invalid: true };
    }
    return { document: doc, object, invalid: false };
  } catch {
    return { document: doc, object: null, invalid: true };
  }
};

/**
 * Parse YAML text into a draft. Preserves the text if invalid.
 */
export const parseYamlText = <TSpec = unknown>(text: string): ParsedDraft<TSpec> => {
  const doc = parseDocument(text);
  return parseDraft<TSpec>(doc);
};

/**
 * Serialize a document to YAML text.
 */
export const serializeDocument = (doc: Document): string => doc.toString();

/**
 * Update a field at a path in the YAML document. Patches only the owned path,
 * retaining other fields (ADR 0001: "Forms patch only owned paths… retaining legal
 * advanced fields"). Deletes the path if value is undefined.
 */
export const updateFieldInDocument = (doc: Document, update: FieldUpdate): void => {
  const { path, value } = update;
  const parts = path.split(".");
  const contents = doc.contents;
  if (!isMap(contents)) return;

  let current = contents;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!part) continue;
    const next = current.get(part);
    if (isMap(next)) {
      current = next;
    } else {
      // Create intermediate maps if missing
      const newMap = doc.createNode({});
      current.set(part, newMap);
      current = newMap as typeof current;
    }
  }

  const lastPart = parts[parts.length - 1];
  if (!lastPart) return;

  if (value === undefined) {
    current.delete(lastPart);
  } else {
    current.set(lastPart, value);
  }
};

/**
 * Apply multiple field updates to a document.
 */
export const applyFieldUpdates = (doc: Document, updates: readonly FieldUpdate[]): void => {
  for (const update of updates) {
    updateFieldInDocument(doc, update);
  }
};

/**
 * Extract a field value at a path from the document.
 */
export const getFieldFromDocument = (doc: Document, path: string): unknown => {
  const parts = path.split(".");
  const contents = doc.contents;
  if (!isMap(contents)) return undefined;

  let current = contents;
  for (const part of parts) {
    if (!part) continue;
    const next = current.get(part);
    if (next === undefined) return undefined;
    if (isMap(next)) {
      current = next;
    } else if (isScalar(next)) {
      return next.value;
    } else {
      return next;
    }
  }
  return current;
};
