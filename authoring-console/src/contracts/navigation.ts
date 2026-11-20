/**
 * Navigation port.
 *
 * ADR 0001 global constraint: "Inject transport and navigation." Shared/read views
 * must run in a future OpenShift host that is not react-router, so views consume
 * navigation through this port rather than importing a router directly. The host
 * supplies an adapter (the default is backed by react-router; see
 * src/app/navigation.tsx).
 *
 * It is exposed as a hook (`useNavigation`) so the adapter can subscribe to the
 * host's location and re-render on route changes. Call it unconditionally at the top
 * of a component like any other hook.
 */
export interface NavigationPort {
  /** Navigate to an in-app path (for example "/workflows/default/hello-world/1.0.0"). */
  navigate(to: string): void;
  /** The current in-app path, reactive across navigations. */
  readonly currentPath: string;
  /** Matched route parameters for the current view. */
  readonly params: Readonly<Record<string, string | undefined>>;
}

export type UseNavigation = () => NavigationPort;
