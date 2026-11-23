import { describe, expect, it } from "vitest";
import { catalogFixture } from "../../fixtures/catalog.ts";
import { operationLink } from "../operation-link.ts";

describe("deployed version operation links", () => {
  const entry = catalogFixture[0]!;
  it("accepts the selected version's gateway links", () => {
    for (const rel of ["execute", "executeSync", "resume", "suspend", "cancel"] as const) {
      expect(operationLink(entry, rel)).toBe(entry._links[rel]);
    }
  });

  it.each([
    "/v1/runtime/default/hello-world/sync",
    "/v1/runtime/default/hello-world/0.0.1/sync",
    "/v1/runtime/default/hello-world/1.0.0",
    "https://another.example/v1/runtime/default/hello-world/1.0.0/sync",
  ])("rejects a link that cannot address the selected synchronous operation: %s", (href) => {
    const definition = { ...entry, _links: { ...entry._links, executeSync: { ...entry._links.executeSync, href } } };
    expect(operationLink(definition, "executeSync")).toBeUndefined();
  });
});
