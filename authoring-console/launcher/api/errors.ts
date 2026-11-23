/** Bounded public errors. Kubernetes ApiException.message includes headers and body. */
export class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function upstreamStatus(error: unknown): number {
  if (!error || typeof error !== "object") return 503;
  for (const key of ["status", "code", "statusCode"] as const) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === "number" && value >= 400 && value <= 599) return value;
  }
  return 503;
}

export function writeRejection(error: unknown) {
  const status = upstreamStatus(error);
  const message = error instanceof RequestError ? error.message : `Kubernetes request failed (HTTP ${status})`;
  let writeError;
  if (status === 409) writeError = { kind: "conflict" };
  else if (status === 401 || status === 403) writeError = { kind: "forbidden", reason: message };
  else if (status === 422 || status === 400) {
    let body = (error as { body?: unknown })?.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = undefined; }
    }
    const details = body as { message?: string; details?: { causes?: { field?: string; message?: string }[] } };
    const errors = details?.details?.causes?.map(cause => ({ path: cause.field ?? "", message: cause.message ?? message }));
    writeError = { kind: "admission", errors: errors?.length ? errors : [{ path: "", message: details?.message ?? message }] };
  } else if (status === 503) writeError = { kind: "unreachable", detail: message };
  else writeError = { kind: "server-error", status, detail: message };
  return { status, message, writeError };
}
