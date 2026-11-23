import type { DefinitionResource, GatewayLink } from "../contracts/index.ts";

type Operation = "execute" | "executeSync" | "suspend" | "resume" | "cancel";

/** Accept only the gateway route for the selected version and operation. */
export function operationLink(definition: DefinitionResource, operation: Operation): GatewayLink | undefined {
  const link = definition._links?.[operation];
  if (link?.method !== "POST") return undefined;
  const suffix = operation === "execute" ? "" : operation === "executeSync" ? "/sync" : `/instance/{id}/${operation}`;
  const identity = [definition.namespace, definition.name, definition.version];
  if (identity.some((part) => !part || part === "." || part === ".." || /[/\\?#]/.test(part))) return undefined;
  const path = "/v1/runtime/" + identity.map(encodeURIComponent).join("/") + suffix;
  // Go's url.PathEscape leaves "+" literal while encodeURIComponent escapes it.
  return link.href === path || link.href === path.replaceAll("%2B", "+") ? link : undefined;
}

export function unknownOutcome(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("kind" in error && error.kind === "unreachable") return true;
  const name = "name" in error ? error.name : "";
  const message = "message" in error ? error.message : "";
  return /timeout|timed out|abort|network|fetch failed|failed to fetch/i.test(String(name) + " " + String(message));
}
