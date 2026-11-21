/**
 * Kubernetes client wrapper using @kubernetes/client-node.
 *
 * Uses the selected kubeconfig context (including CA, client cert, credential/exec plugin).
 * Keeps credentials in the launcher process — the browser receives only data, never credentials.
 */
import * as k8s from "@kubernetes/client-node";

/** Kubernetes client context. */
export interface K8sClientContext {
  readonly kc: k8s.KubeConfig;
  readonly coreApi: k8s.CoreV1Api;
  readonly customApi: k8s.CustomObjectsApi;
  readonly currentContext: string;
}

/** Load kubeconfig and select the specified context. */
export const createK8sClient = (contextName?: string): K8sClientContext => {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();

  if (contextName) {
    kc.setCurrentContext(contextName);
  }

  const currentContext = kc.getCurrentContext();
  if (!currentContext) {
    throw new Error("No Kubernetes context is currently selected");
  }

  const coreApi = kc.makeApiClient(k8s.CoreV1Api);
  const customApi = kc.makeApiClient(k8s.CustomObjectsApi);

  return {
    kc,
    coreApi,
    customApi,
    currentContext,
  };
};

/** List available kubeconfig contexts. */
export const listContexts = (): Array<{ name: string; cluster: string; user: string }> => {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();

  return kc.getContexts().map((ctx) => ({
    name: ctx.name,
    cluster: ctx.cluster,
    user: ctx.user,
  }));
};

/** Get current context name. */
export const getCurrentContextName = (): string | null => {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return kc.getCurrentContext();
};

/** Get cluster display name for a context. */
export const getClusterDisplay = (kc: k8s.KubeConfig): string => {
  const currentContext = kc.getCurrentContext();
  if (!currentContext) {
    return "unknown";
  }

  const context = kc.getContextObject(currentContext);
  if (!context) {
    return "unknown";
  }

  const cluster = kc.getCluster(context.cluster);
  if (!cluster) {
    return context.cluster;
  }

  // Extract hostname from cluster server URL for display
  try {
    const url = new URL(cluster.server);
    return url.host;
  } catch {
    return cluster.server;
  }
};

/**
 * Map @kubernetes/client-node errors to our error taxonomy.
 * The library throws objects with statusCode/body/response properties.
 */
export interface K8sError {
  statusCode?: number;
  body?: unknown;
  response?: {
    statusCode?: number;
    body?: unknown;
  };
}

export const isK8sError = (error: unknown): error is K8sError => {
  return (
    typeof error === "object" &&
    error !== null &&
    ("statusCode" in error || ("response" in error && typeof (error as K8sError).response === "object"))
  );
};

/** Extract HTTP status code from K8s client error. */
export const getK8sErrorStatus = (error: K8sError): number | undefined => {
  return error.statusCode ?? error.response?.statusCode;
};

/** Extract error body from K8s client error. */
export const getK8sErrorBody = (error: K8sError): unknown => {
  return error.body ?? error.response?.body;
};
