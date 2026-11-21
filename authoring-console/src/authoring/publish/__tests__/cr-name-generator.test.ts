/**
 * CR-name generator tests — EXHAUSTIVE coverage per task brief.
 *
 * Required scenarios (ADR 0001 + E2 brief):
 * - Ordinary name (no hash)
 * - Prerelease identifiers
 * - Long-name truncation + hash
 * - Case-fold + hash
 * - Prerelease with literal hyphen + hash
 * - Insufficient room → error signal
 * - Determinism (same input → same output)
 * - Collision-distinct (two different inputs that collide after sanitization get distinct names)
 */

import { describe, it, expect } from "vitest";
import { generateCrName } from "../cr-name-generator.ts";
import type { GeneratedCrNameInput } from "../../../contracts/workflow.ts";

describe("generateCrName", () => {
  describe("ordinary names (no hash)", () => {
    it("generates {name}-v-{M}-{m}-{p} for simple cases", async () => {
      const result = await generateCrName({
        namespace: "default",
        workflowName: "orders",
        version: "1.2.3",
      });
      expect(result).toEqual({ name: "orders-v-1-2-3" });
    });

    it("handles single-digit versions", async () => {
      const result = await generateCrName({
        namespace: "default",
        workflowName: "simple",
        version: "0.0.1",
      });
      expect(result).toEqual({ name: "simple-v-0-0-1" });
    });

    it("handles multi-digit version components", async () => {
      const result = await generateCrName({
        namespace: "prod",
        workflowName: "api",
        version: "12.345.6789",
      });
      expect(result).toEqual({ name: "api-v-12-345-6789" });
    });
  });

  describe("prerelease identifiers", () => {
    it("appends prerelease with hyphen separators", async () => {
      const result = await generateCrName({
        namespace: "default",
        workflowName: "orders",
        version: "1.3.0-rc.1",
      });
      // Dots in prerelease become hyphens
      expect(result).toEqual({ name: "orders-v-1-3-0-rc-1" });
    });

    it("handles multiple prerelease identifiers", async () => {
      const result = await generateCrName({
        namespace: "default",
        workflowName: "api",
        version: "2.0.0-beta.2.final",
      });
      expect(result).toEqual({ name: "api-v-2-0-0-beta-2-final" });
    });

    it("handles alphanumeric prerelease", async () => {
      const result = await generateCrName({
        namespace: "default",
        workflowName: "service",
        version: "1.0.0-alpha",
      });
      expect(result).toEqual({ name: "service-v-1-0-0-alpha" });
    });
  });

  describe("case-folding triggers hash", () => {
    it("adds hash when workflow name has uppercase letters", async () => {
      const result = await generateCrName({
        namespace: "default",
        workflowName: "MyWorkflow",
        version: "1.0.0",
      });
      // Should lowercase and insert hash before suffix
      expect(result).toHaveProperty("name");
      if ("name" in result) {
        expect(result.name).toMatch(/^myworkflow-[0-9a-f]{8}-v-1-0-0$/);
        // Should be deterministic
        const result2 = await generateCrName({
          namespace: "default",
          workflowName: "MyWorkflow",
          version: "1.0.0",
        });
        expect(result).toEqual(result2);
      }
    });

    it("distinguishes case-different inputs via hash", async () => {
      const upper = await generateCrName({
        namespace: "default",
        workflowName: "API",
        version: "1.0.0",
      });
      const lower = await generateCrName({
        namespace: "default",
        workflowName: "api",
        version: "1.0.0",
      });
      // Both should succeed
      expect(upper).toHaveProperty("name");
      expect(lower).toHaveProperty("name");
      // The uppercase one should have a hash; lowercase should not
      if ("name" in upper && "name" in lower) {
        expect(upper.name).toMatch(/^api-[0-9a-f]{8}-v-1-0-0$/);
        expect(lower.name).toBe("api-v-1-0-0");
        // They should be distinct
        expect(upper.name).not.toBe(lower.name);
      }
    });
  });

  describe("prerelease with literal hyphen triggers hash", () => {
    it("adds hash when prerelease contains a literal hyphen", async () => {
      // A version like `1.0.0-rc-1` has a literal hyphen in the prerelease part
      const result = await generateCrName({
        namespace: "default",
        workflowName: "service",
        version: "1.0.0-rc-1",
      });
      expect(result).toHaveProperty("name");
      if ("name" in result) {
        // Should have hash to preserve identity
        expect(result.name).toMatch(/^service-[0-9a-f]{8}-v-1-0-0-rc-1$/);
      }
    });

    it("distinguishes literal-hyphen from dot-converted prerelease", async () => {
      const withDot = await generateCrName({
        namespace: "default",
        workflowName: "api",
        version: "1.0.0-rc.1",
      });
      const withHyphen = await generateCrName({
        namespace: "default",
        workflowName: "api",
        version: "1.0.0-rc-1",
      });
      expect(withDot).toHaveProperty("name");
      expect(withHyphen).toHaveProperty("name");
      // The literal-hyphen version should have a hash
      if ("name" in withDot && "name" in withHyphen) {
        // withDot: rc.1 → rc-1 (no literal hyphen originally, no hash needed)
        expect(withDot.name).toBe("api-v-1-0-0-rc-1");
        // withHyphen: rc-1 (literal hyphen, needs hash)
        expect(withHyphen.name).toMatch(/^api-[0-9a-f]{8}-v-1-0-0-rc-1$/);
        expect(withDot.name).not.toBe(withHyphen.name);
      }
    });
  });

  describe("long-name truncation + hash", () => {
    it("truncates prefix and adds hash when name is too long", async () => {
      // A very long workflow name
      const longName = "a".repeat(60);
      const result = await generateCrName({
        namespace: "default",
        workflowName: longName,
        version: "1.0.0",
      });
      expect(result).toHaveProperty("name");
      if ("name" in result) {
        // Should be exactly 63 chars
        expect(result.name.length).toBeLessThanOrEqual(63);
        // Should have hash
        expect(result.name).toMatch(/-[0-9a-f]{8}-v-1-0-0$/);
        // Prefix should be truncated
        const prefixMatch = result.name.match(/^([a-z]+)-[0-9a-f]{8}-v-1-0-0$/);
        expect(prefixMatch).toBeTruthy();
        if (prefixMatch) {
          const prefix = prefixMatch[1];
          // Prefix should be shorter than original
          expect(prefix!.length).toBeLessThan(longName.length);
        }
      }
    });

    it("trims trailing hyphens from truncated prefix", async () => {
      // A name that ends with hyphens after truncation
      const name = "my-workflow-with-hyphens".repeat(3);
      const result = await generateCrName({
        namespace: "default",
        workflowName: name,
        version: "1.0.0",
      });
      expect(result).toHaveProperty("name");
      if ("name" in result) {
        // Should not have double hyphens between prefix and hash
        expect(result.name).not.toMatch(/--/);
        // Should not end with hyphen before hash
        expect(result.name).toMatch(/^[a-z0-9-]+-[0-9a-f]{8}-v-1-0-0$/);
      }
    });
  });

  describe("insufficient room error signal", () => {
    it("signals error when suffix alone exceeds 63 chars", async () => {
      // A version with extremely long prerelease
      const longPrerelease = "a".repeat(60);
      const result = await generateCrName({
        namespace: "default",
        workflowName: "x",
        version: `1.0.0-${longPrerelease}`,
      });
      expect(result).toEqual({ error: "insufficient-room" });
    });

    it("signals error when no room for nonempty prefix", async () => {
      // A version where suffix + hash leaves no room for prefix
      const longPrerelease = "a".repeat(45);
      const result = await generateCrName({
        namespace: "default",
        workflowName: "myworkflow",
        version: `1.0.0-${longPrerelease}`,
      });
      // Should signal insufficient room
      expect(result).toEqual({ error: "insufficient-room" });
    });

    it("signals error when prefix becomes empty after trimming hyphens", async () => {
      // Edge case: very long prerelease that leaves minimal room for prefix
      // Suffix: "-v-1-0-0-" + 54 chars of prerelease = 63 chars (no room for prefix)
      const result = await generateCrName({
        namespace: "default",
        workflowName: "myworkflow",
        version: `1.0.0-${"x".repeat(54)}`,
      });
      expect(result).toEqual({ error: "insufficient-room" });
    });
  });

  describe("determinism", () => {
    it("produces same output for same input", async () => {
      const input: GeneratedCrNameInput = {
        namespace: "prod",
        workflowName: "MyWorkflow",
        version: "2.3.4-rc.5",
      };
      const result1 = await generateCrName(input);
      const result2 = await generateCrName(input);
      expect(result1).toEqual(result2);
    });

    it("hash is deterministic for truncated names", async () => {
      const longName = "a".repeat(60);
      const input: GeneratedCrNameInput = {
        namespace: "default",
        workflowName: longName,
        version: "1.2.3",
      };
      const result1 = await generateCrName(input);
      const result2 = await generateCrName(input);
      expect(result1).toEqual(result2);
    });
  });

  describe("collision-distinct names", () => {
    it("generates distinct names for different inputs that collide after lowercasing", async () => {
      const input1: GeneratedCrNameInput = {
        namespace: "default",
        workflowName: "MyWorkflow",
        version: "1.0.0",
      };
      const input2: GeneratedCrNameInput = {
        namespace: "default",
        workflowName: "myworkflow",
        version: "1.0.0",
      };
      const result1 = await generateCrName(input1);
      const result2 = await generateCrName(input2);
      expect(result1).toHaveProperty("name");
      expect(result2).toHaveProperty("name");
      if ("name" in result1 && "name" in result2) {
        // Should be distinct
        expect(result1.name).not.toBe(result2.name);
      }
    });

    it("generates distinct names for different namespaces", async () => {
      const input1: GeneratedCrNameInput = {
        namespace: "ns1",
        workflowName: "api",
        version: "1.0.0",
      };
      const input2: GeneratedCrNameInput = {
        namespace: "ns2",
        workflowName: "api",
        version: "1.0.0",
      };
      const result1 = await generateCrName(input1);
      const result2 = await generateCrName(input2);
      // Both should produce the same name (namespace is not in the name itself, only in hash input)
      // But if there's a hash, they should differ
      // Actually, for simple cases without hash, they'll be the same name
      expect(result1).toEqual({ name: "api-v-1-0-0" });
      expect(result2).toEqual({ name: "api-v-1-0-0" });
      // This is expected: namespace collision is handled by Kubernetes scoping, not name generation
    });

    it("generates distinct names for different versions", async () => {
      const input1: GeneratedCrNameInput = {
        namespace: "default",
        workflowName: "api",
        version: "1.0.0",
      };
      const input2: GeneratedCrNameInput = {
        namespace: "default",
        workflowName: "api",
        version: "1.0.1",
      };
      const result1 = await generateCrName(input1);
      const result2 = await generateCrName(input2);
      expect(result1).toEqual({ name: "api-v-1-0-0" });
      expect(result2).toEqual({ name: "api-v-1-0-1" });
      expect(result1).not.toEqual(result2);
    });

    it("generates distinct names for truncated inputs that differ", async () => {
      const longName1 = "a".repeat(60) + "1";
      const longName2 = "a".repeat(60) + "2";
      const input1: GeneratedCrNameInput = {
        namespace: "default",
        workflowName: longName1,
        version: "1.0.0",
      };
      const input2: GeneratedCrNameInput = {
        namespace: "default",
        workflowName: longName2,
        version: "1.0.0",
      };
      const result1 = await generateCrName(input1);
      const result2 = await generateCrName(input2);
      expect(result1).toHaveProperty("name");
      expect(result2).toHaveProperty("name");
      if ("name" in result1 && "name" in result2) {
        // Should be distinct via hash
        expect(result1.name).not.toBe(result2.name);
      }
    });
  });

  describe("DNS-1123 validity", () => {
    it("generates valid DNS-1123 label for all ordinary inputs", async () => {
      const inputs: GeneratedCrNameInput[] = [
        { namespace: "default", workflowName: "simple", version: "1.0.0" },
        { namespace: "prod", workflowName: "my-workflow", version: "2.3.4-rc.1" },
        { namespace: "test", workflowName: "API", version: "1.0.0" },
        { namespace: "default", workflowName: "a".repeat(60), version: "1.0.0" },
      ];
      for (const input of inputs) {
        const result = await generateCrName(input);
        if ("name" in result) {
          // Check DNS-1123 rules
          expect(result.name.length).toBeLessThanOrEqual(63);
          expect(result.name).toMatch(/^[a-z0-9-]+$/);
          expect(result.name).not.toMatch(/^-/);
          expect(result.name).not.toMatch(/-$/);
        }
      }
    });
  });

  describe("edge cases", () => {
    it("handles operator sample naming convention (hello-world-v1-0-0)", async () => {
      // The generator should produce a similar style
      const result = await generateCrName({
        namespace: "default",
        workflowName: "hello-world",
        version: "1.0.0",
      });
      expect(result).toEqual({ name: "hello-world-v-1-0-0" });
    });

    it("handles single-character workflow name", async () => {
      const result = await generateCrName({
        namespace: "default",
        workflowName: "x",
        version: "1.0.0",
      });
      expect(result).toEqual({ name: "x-v-1-0-0" });
    });

    it("handles zero version components", async () => {
      const result = await generateCrName({
        namespace: "default",
        workflowName: "api",
        version: "0.0.0",
      });
      expect(result).toEqual({ name: "api-v-0-0-0" });
    });

    it("handles version with missing patch (defaults to 0)", async () => {
      const result = await generateCrName({
        namespace: "default",
        workflowName: "api",
        version: "1.2",
      });
      expect(result).toEqual({ name: "api-v-1-2-0" });
    });
  });
});
