/**
 * Session fixtures for both connection modes (launcher and direct-browser). No
 * credentials are present — only the identity by which requests are keyed.
 */
import type { SessionIdentity } from "../contracts/index.ts";

export const launcherSession: SessionIdentity = {
  sessionId: "launch-0001",
  mode: "launcher",
  context: { contextName: "kind-logic-operator-dev", clusterDisplay: "kind-logic-operator-dev" },
  namespace: "default",
};

export const directBrowserSession: SessionIdentity = {
  sessionId: "direct-0001",
  mode: "direct-browser",
  context: { contextName: "openshift-prod", clusterDisplay: "api.prod.example.com" },
  namespace: "default",
};
