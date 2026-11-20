/**
 * In-memory fixture KubernetesTransport.
 *
 * The first-release Kubernetes wire protocol belongs to the launcher / direct-browser
 * adapters (packet B), so Packet A mocks the transport in memory rather than over a
 * specific HTTP shape. Scenario flags expose the forbidden-write (403) and
 * stale-resourceVersion (409 conflict) cases consumers must handle.
 */
import type {
  GroupVersionKind,
  KubeList,
  KubeObject,
  KubernetesTransport,
  ListOptions,
  ResourceRef,
  WriteCandidate,
  WriteError,
} from "../../contracts/index.ts";
import { definitionFixtures, platformFixture, runtimeFixtures } from "../kubernetes.ts";

export interface FixtureKubernetesOptions {
  /** When true, create/update/dryRun reject with a forbidden WriteError (403). */
  readonly forbidWrites?: boolean;
  /** When true, update rejects with a conflict WriteError (stale resourceVersion). */
  readonly conflictOnUpdate?: boolean;
}

const reject = (writeError: WriteError): never => {
  throw { writeError };
};

const matchesLabelSelector = (labels: Readonly<Record<string, string>> | undefined, selector?: string): boolean => {
  if (!selector) return true;
  const pairs = selector.split(",").map((s) => s.trim()).filter(Boolean);
  return pairs.every((pair) => {
    const [key, value] = pair.split("=");
    return key !== undefined && labels?.[key] === value;
  });
};

const gvkMatches = (object: KubeObject, gvk: GroupVersionKind): boolean => object.kind === gvk.kind;

export const createFixtureKubernetesTransport = (
  options: FixtureKubernetesOptions = {},
): KubernetesTransport => {
  // A mutable copy so create/update are observable within a session.
  const store: KubeObject[] = [...definitionFixtures, ...runtimeFixtures, platformFixture];

  const find = (ref: ResourceRef): KubeObject | undefined =>
    store.find(
      (object) =>
        object.kind === ref.gvk.kind &&
        object.metadata.name === ref.name &&
        (object.metadata.namespace ?? undefined) === (ref.namespace ?? undefined),
    );

  return {
    async get<TSpec, TStatus>(ref: ResourceRef): Promise<KubeObject<TSpec, TStatus>> {
      const object = find(ref);
      if (!object) {
        reject({ kind: "server-error", status: 404, detail: `${ref.gvk.kind} ${ref.name} not found` });
      }
      return object as KubeObject<TSpec, TStatus>;
    },

    async list<TSpec, TStatus>(
      gvk: GroupVersionKind,
      opts: ListOptions,
    ): Promise<KubeList<KubeObject<TSpec, TStatus>>> {
      const items = store.filter(
        (object) =>
          gvkMatches(object, gvk) &&
          (opts.namespace === undefined || object.metadata.namespace === opts.namespace) &&
          matchesLabelSelector(object.metadata.labels, opts.labelSelector),
      );
      return {
        apiVersion: gvk.group ? `${gvk.group}/${gvk.version}` : gvk.version,
        kind: `${gvk.kind}List`,
        items: items as KubeObject<TSpec, TStatus>[],
        metadata: {},
      };
    },

    async dryRun<TSpec, TStatus>(candidate: WriteCandidate<TSpec>): Promise<KubeObject<TSpec, TStatus>> {
      if (options.forbidWrites) {
        reject({ kind: "forbidden", reason: "Dry-run forbidden for this identity." });
      }
      return candidate.object as KubeObject<TSpec, TStatus>;
    },

    async create<TSpec, TStatus>(candidate: WriteCandidate<TSpec>): Promise<KubeObject<TSpec, TStatus>> {
      if (options.forbidWrites) {
        reject({ kind: "forbidden", reason: "Create forbidden for this identity." });
      }
      const created = candidate.object as KubeObject;
      store.push(created);
      return created as KubeObject<TSpec, TStatus>;
    },

    async update<TSpec, TStatus>(candidate: WriteCandidate<TSpec>): Promise<KubeObject<TSpec, TStatus>> {
      if (options.forbidWrites) {
        reject({ kind: "forbidden", reason: "Update forbidden for this identity." });
      }
      if (options.conflictOnUpdate) {
        reject({ kind: "conflict", latestResourceVersion: "99999" });
      }
      const ref: ResourceRef = {
        gvk: { group: "", version: "v1", kind: candidate.object.kind },
        name: candidate.object.metadata.name,
        ...(candidate.object.metadata.namespace !== undefined
          ? { namespace: candidate.object.metadata.namespace }
          : {}),
      };
      const existing = find(ref);
      if (existing && candidate.expectedResourceVersion !== existing.metadata.resourceVersion) {
        reject({ kind: "conflict", latestResourceVersion: existing.metadata.resourceVersion });
      }
      const index = store.findIndex((o) => o === existing);
      if (index >= 0) store[index] = candidate.object as KubeObject;
      return candidate.object as KubeObject<TSpec, TStatus>;
    },
  };
};
