import type { CompatibilityEntry, KubernetesTransport } from "../contracts/index.ts";

const managed = "app.kubernetes.io/managed-by=logic-operator";
const sources = [
  { selector: "app.kubernetes.io/name=logic-operator,control-plane=controller-manager", containers: { manager: "operator" } },
  { selector: managed, containers: { "workflow-gateway": "gateway", "logic-runner": "runner", "logic-data-index": "data-index", vector: "vector" } },
  { selector: "app.kubernetes.io/name=ingress-nginx,app.kubernetes.io/component=controller", containers: { controller: "ingress" } },
] satisfies { selector: string; containers: Record<string, string> }[];

export async function observeImages(transport: KubernetesTransport, signal: AbortSignal) {
  const observations = new Map<string, string[]>();
  await Promise.all(sources.map(async ({selector, containers}) => {
    const names: Record<string, string | undefined> = containers;
    try {
      let cursor: string | undefined;
      do {
        const pods = await transport.list<{containers: {name: string; image: string}[]}, {containerStatuses?: {name: string; imageID?: string}[]}>(
          {group: "", version: "v1", kind: "Pod"}, {labelSelector: selector, limit: 100, continue: cursor}, signal);
        for (const pod of pods.items) {
          for (const container of pod.spec?.containers ?? []) {
            const component = names[container.name];
            if (!component || !Object.hasOwn(names, container.name)) continue;
            const imageID = pod.status?.containerStatuses?.find(c => c.name === container.name)?.imageID;
            const source = `Pod ${pod.metadata.namespace}/${pod.metadata.name} · ${container.name}`;
            const value = `${container.image}${imageID ? ` · ${imageID}` : ""} (${source})`;
            observations.set(component, [...observations.get(component) ?? [], value]);
          }
        }
        cursor = pods.metadata?.continue;
      } while (cursor && !signal.aborted);
    } catch (cause) {
      if (signal.aborted) throw cause;
      const error = cause as {status?: number; statusCode?: number; writeError?: {kind: string}};
      const denied = error?.status === 403 || error?.statusCode === 403 || error?.writeError?.kind === "forbidden";
      for (const component of Object.values(containers)) observations.set(component, [denied ? "Unknown · insufficient access" : "Unknown · pod discovery unavailable"]);
    }
  }));
  return observations;
}

export function observedVersion(entry: CompatibilityEntry, images: readonly string[] | undefined) {
  if (images?.length) return images.join("\n");
  return entry.detectedVersion ?? "Unknown";
}
