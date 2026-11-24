/**
 * Shared workflow YAML validation utilities (extracted from duplicated logic).
 */
import { parse as parseYaml } from "yaml";
import type { ParsedWorkflowIdentity } from "./types.ts";

/**
 * Parse workflow identity from YAML. Returns undefined if invalid or missing
 * required fields.
 */
export const parseWorkflowIdentity = (yaml: string): ParsedWorkflowIdentity | undefined => {
  if (!yaml.trim()) return undefined;
  try {
    const parsed = parseYaml(yaml) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "document" in parsed &&
      typeof parsed.document === "object" &&
      parsed.document !== null
    ) {
      const doc = parsed.document as Record<string, unknown>;
      const name = typeof doc.name === "string" ? doc.name : undefined;
      const version = typeof doc.version === "string" ? doc.version : undefined;
      const namespace = typeof doc.namespace === "string" ? doc.namespace : "default";
      if (name && version) {
        return { workflowName: name, version, namespace };
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
};

/**
 * Validates that YAML is parseable and has a valid workflow document structure.
 * Returns true if valid, false otherwise.
 */
export const isValidWorkflowYaml = (yaml: string): boolean => {
  return parseWorkflowIdentity(yaml) !== undefined;
};
