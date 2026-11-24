/**
 * Shared asynchronous-state primitives.
 *
 * Every consumer (packets B–H) must be able to render the four screen states the
 * design specification calls out: allowed (data present), forbidden (access
 * denied, 403), loading, and unavailable (temporary failure / unreachable). This
 * type models those states explicitly so absence, denial and failure are never
 * collapsed into a single "error".
 */
export type LoadState<T, E = unknown> =
  | { readonly status: "loading" }
  | { readonly status: "allowed"; readonly data: T }
  | { readonly status: "forbidden"; readonly reason?: string }
  | { readonly status: "unavailable"; readonly error: E };

export const loading = (): LoadState<never, never> => ({ status: "loading" });
export const allowed = <T>(data: T): LoadState<T, never> => ({ status: "allowed", data });
export const forbidden = (reason?: string): LoadState<never, never> =>
  reason === undefined ? { status: "forbidden" } : { status: "forbidden", reason };
export const unavailable = <E>(error: E): LoadState<never, E> => ({ status: "unavailable", error });

/**
 * A single stage in a multi-stage progression (see DeploymentReadiness). Each
 * stage is independently observable and may be unknown, pending, achieved or
 * failed with a stage-specific error.
 */
export type StageStatus<E = never> =
  | { readonly state: "unknown" }
  | { readonly state: "pending" }
  | { readonly state: "achieved" }
  | { readonly state: "failed"; readonly error: E };
