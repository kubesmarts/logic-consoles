import type { CompatibilityManifest } from "../contracts/index.ts";
import { LOGIC_GROUP_VERSION } from "../contracts/index.ts";

export const devBaselineCompatibilityManifest: CompatibilityManifest = {
  consoleVersion: "0.0.0",
  operatorRelease: "b9a71660267f0cad794b95e010569b280a932da8",
  apiGroupVersion: LOGIC_GROUP_VERSION,
  certified: false,
  entries: [
    { component: "operator", label: "Logic Operator", baseline: "2.0.0-Alpha4", source: "development", notes: "operator versions.mk" },
    { component: "gateway", label: "Workflow Gateway", baseline: "2.0.0-Alpha4 · /v1", source: "development", notes: "operator versions.mk and gateway routes" },
    { component: "runner", label: "Quarkus Flow runner", baseline: "1.3.0", source: "development", notes: "operator versions.mk" },
    { component: "flow", label: "Quarkus Flow", source: "unknown", notes: "Requires runner build provenance" },
    { component: "data-index", label: "Data Index", baseline: "2.0.0-SNAPSHOT-postgresql", source: "development", notes: "operator versions.mk" },
    { component: "vector", label: "Vector", baseline: "0.54.0-distroless-libc", source: "development", notes: "operator api/version/version.go" },
    { component: "postgres", label: "PostgreSQL", baseline: "postgres:16-alpine", source: "development", notes: "operator persistence sample" },
    { component: "dsl", label: "Workflow DSL", baseline: "v1.1.0", source: "development", notes: "Bundled specification schema at 09ad1dee" },
    { component: "editor", label: "CNCF diagram editor", baseline: "1.1.0", source: "development", notes: "console package-lock.json" },
    { component: "kind", label: "KIND", source: "unknown" },
    { component: "kubernetes", label: "Kubernetes", source: "unknown" },
    { component: "openshift", label: "OpenShift", source: "unknown" },
    { component: "ingress", label: "ingress-nginx", source: "unknown", notes: "Kubernetes and KIND · sample ingress class nginx" },
  ],
};
