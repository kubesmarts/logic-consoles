/**
 * Dev-baseline compatibility inputs (DATA, not logic).
 *
 * PLAN "Compatibility and release evidence": planning evidence from the inspected
 * checkout is operator/gateway `2.0.0-Alpha4`, runner `1.3.0`, Data Index
 * `2.0.0-SNAPSHOT-postgresql`, Vector `0.54.0-distroless-libc`. These are development
 * inputs. NO console compatibility row has been certified (`certified: false`).
 */
import type { CompatibilityManifest } from "../contracts/index.ts";
import { LOGIC_GROUP_VERSION } from "../contracts/index.ts";

export const devBaselineCompatibilityManifest: CompatibilityManifest = {
  consoleVersion: "0.0.0",
  operatorRelease: "b9a71660267f0cad794b95e010569b280a932da8",
  apiGroupVersion: LOGIC_GROUP_VERSION,
  certified: false,
  entries: [
    { component: "operator", label: "Operator", testedVersion: "2.0.0-Alpha4", source: "tested", notes: "Development input; not certified." },
    { component: "gateway", label: "Workflow Gateway", testedVersion: "2.0.0-Alpha4", source: "tested", notes: "Development input; not certified." },
    { component: "runner", label: "Runner", testedVersion: "1.3.0", source: "tested", notes: "Development input; not certified." },
    { component: "data-index", label: "Data Index", testedVersion: "2.0.0-SNAPSHOT-postgresql", source: "tested", notes: "Development input; not certified." },
    { component: "vector", label: "Vector", testedVersion: "0.54.0-distroless-libc", source: "tested", notes: "Development input; not certified." },
  ],
};
