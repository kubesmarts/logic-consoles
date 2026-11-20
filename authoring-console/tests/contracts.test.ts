/**
 * Contract-behaviour tests: the workflow-identity vs CR-name separation, the storage
 * invariants (versioned envelope, failed-save keeps the draft), and the independent
 * capability model. These exercise the load-bearing boundary, not UI chrome.
 */
import { describe, expect, it } from "vitest";
import { buildFamilies, compareSemver } from "../src/app/queries.ts";
import { catalogFixture } from "../src/fixtures/catalog.ts";
import { definitionFixtures } from "../src/fixtures/kubernetes.ts";
import { createConsoleStorage } from "../src/app/storage.ts";
import { decideCapability } from "../src/fixtures/capabilities.ts";
import { STORAGE_SCHEMA_VERSION, type WorkflowDraft } from "../src/contracts/index.ts";

describe("workflow identity vs CR name", () => {
  const families = buildFamilies(catalogFixture, definitionFixtures, "default");

  it("groups a family with two versions sharing one runtime", () => {
    const hello = families.find((f) => f.key.workflowName === "hello-world");
    expect(hello).toBeDefined();
    expect(hello?.versions).toHaveLength(2);
    expect(hello?.runtimeName).toBe("hello-runtime");
  });

  it("resolves a CR name that differs from the workflow name", () => {
    const payments = families.find((f) => f.key.workflowName === "payments");
    const version = payments?.versions[0];
    // workflow name is "payments" but the CR is hand-authored as legacy-payment-flow.
    expect(version?.version.workflowName).toBe("payments");
    expect(version?.crName).toBe("legacy-payment-flow");
    expect(version?.resource.name).toBe("legacy-payment-flow");
    expect(version?.crName).not.toBe(version?.version.workflowName);
  });

  it("uses the console-generated CR name for hello-world versions", () => {
    const hello = families.find((f) => f.key.workflowName === "hello-world");
    const v1 = hello?.versions.find((v) => v.version.version === "1.0.0");
    expect(v1?.crName).toBe("hello-world-v-1-0-0");
  });
});

describe("semver-aware version ordering", () => {
  it("orders by numeric segments, not lexically (1.9.0 before 1.10.0)", () => {
    expect(compareSemver("1.9.0", "1.10.0")).toBeLessThan(0);
    expect(["1.10.0", "1.9.0", "1.2.0"].sort(compareSemver)).toEqual(["1.2.0", "1.9.0", "1.10.0"]);
  });

  it("ranks a prerelease below its release and orders prerelease identifiers", () => {
    expect(compareSemver("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
    expect(compareSemver("1.0.0-rc.1", "1.0.0-rc.2")).toBeLessThan(0);
    expect(["1.0.0", "1.0.0-rc.2", "1.0.0-rc.1"].sort(compareSemver)).toEqual([
      "1.0.0-rc.1",
      "1.0.0-rc.2",
      "1.0.0",
    ]);
  });

  it("does not throw on a non-numeric segment", () => {
    expect(() => compareSemver("1.x.0", "1.2.0")).not.toThrow();
  });
});

describe("capability model (independent permissions)", () => {
  const platformWrite = { group: "logic.kubesmarts.org", resource: "clusterlogicplatforms", verb: "update" } as const;
  const definitionWrite = { group: "logic.kubesmarts.org", resource: "logicflowdefinitions", verb: "create", namespace: "default" } as const;

  it("allows a cluster-admin everything", () => {
    expect(decideCapability("cluster-admin", platformWrite).decision).toBe("allowed");
  });

  it("denies a reduced-rights author platform writes but allows publishing", () => {
    expect(decideCapability("reduced-rights-author", platformWrite).decision).toBe("denied");
    expect(decideCapability("reduced-rights-author", definitionWrite).decision).toBe("allowed");
  });
});

describe("console storage", () => {
  const draft: WorkflowDraft = {
    id: "d1",
    title: "hello",
    workflowYaml: "document:\n  name: hello\n",
    target: { contextName: "kind", namespace: "default" },
    createdAt: "2026-11-20T00:00:00Z",
    updatedAt: "2026-11-20T00:00:00Z",
  };

  it("saves, lists, exports and removes a draft inside the versioned envelope", () => {
    window.localStorage.clear();
    const storage = createConsoleStorage(window.localStorage);
    expect(storage.saveDraft(draft).ok).toBe(true);
    expect(storage.listDrafts()).toHaveLength(1);
    expect(storage.exportDraftYaml(draft)).toContain("document:");

    const raw = JSON.parse(window.localStorage.getItem("authoring-console:v1") ?? "{}") as { schemaVersion: number };
    expect(raw.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);

    storage.removeDraft("d1");
    expect(storage.listDrafts()).toHaveLength(0);
  });

  it("keeps the draft and reports failure when the save quota is exceeded", () => {
    const failing: Storage = {
      length: 0,
      clear: () => {},
      key: () => null,
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    const storage = createConsoleStorage(failing);
    const outcome = storage.saveDraft(draft);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("quota-exceeded");
      expect(outcome.draft).toBe(draft);
    }
    // Export still works so the author never loses the draft.
    expect(storage.exportDraftYaml(draft)).toContain("document:");
  });
});
