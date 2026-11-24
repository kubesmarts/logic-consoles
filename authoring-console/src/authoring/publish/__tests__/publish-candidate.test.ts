import { expect, it } from "vitest";
import { createFixtureKubernetesTransport } from "../../../fixtures/transports/kubernetes.ts";
import { buildPublishCandidate } from "../usePublishFlow.ts";

it("writes the chosen version and effective namespace inside the portable document", async () => {
  const flow =
    "document:\n  name: cart\n  namespace: old\n  version: 1.0.0\ndo: []";
  const result = await buildPublishCandidate(
    "create",
    flow,
    "sales",
    "cart",
    "1.0.1",
    "runtime",
    createFixtureKubernetesTransport(),
  );
  expect(result.candidate.spec?.flow.document).toMatchObject({
    name: "cart",
    version: "1.0.1",
    namespace: "sales",
  });
});
