/**
 * Console services context — the injected-dependency boundary.
 *
 * Pages and shared views consume transports/navigation/storage from here rather than
 * importing a concrete HTTP client, so the same screens run under the launcher, the
 * direct-browser adapter, fixtures, or a future OpenShift host (ADR 0001
 * "Inject transport and navigation").
 */
import { createContext, useContext, type ReactNode } from "react";
import type {
  CapabilityTransport,
  CompatibilityManifest,
  ConsoleStorage,
  GatewayTransport,
  KubernetesTransport,
  NavigationPort,
  SessionIdentity,
  UseNavigation,
} from "../contracts/index.ts";

export interface ConsoleServices {
  readonly session: SessionIdentity;
  readonly kubernetes: KubernetesTransport;
  readonly gateway: GatewayTransport;
  readonly capabilities: CapabilityTransport;
  readonly storage: ConsoleStorage;
  readonly compatibility: CompatibilityManifest;
  /** Injected navigation port (hook form). See src/contracts/navigation.ts. */
  readonly useNavigation: UseNavigation;
}

const ConsoleContext = createContext<ConsoleServices | null>(null);

export const ConsoleProvider = ({
  services,
  children,
}: {
  readonly services: ConsoleServices;
  readonly children: ReactNode;
}): ReactNode => <ConsoleContext.Provider value={services}>{children}</ConsoleContext.Provider>;

export const useConsole = (): ConsoleServices => {
  const value = useContext(ConsoleContext);
  if (!value) {
    throw new Error("useConsole must be used within a ConsoleProvider");
  }
  return value;
};

/** Consume the injected navigation port. Views use this instead of a router directly. */
export const useNavigation = (): NavigationPort => useConsole().useNavigation();
