/**
 * Version suggestion tests.
 */

import { describe, it, expect } from "vitest";
import { suggestNextVersion, isVersionOccupied } from "../version-suggestion.ts";

describe("suggestNextVersion", () => {
  it("suggests 1.0.0 for empty family", () => {
    expect(suggestNextVersion([])).toBe("1.0.0");
  });

  it("suggests next patch for stable version", () => {
    expect(suggestNextVersion(["1.0.0"])).toBe("1.0.1");
    expect(suggestNextVersion(["1.2.3"])).toBe("1.2.4");
    expect(suggestNextVersion(["2.5.9"])).toBe("2.5.10");
  });

  it("increments trailing numeric identifier for prerelease", () => {
    expect(suggestNextVersion(["1.0.0-rc.1"])).toBe("1.0.0-rc.2");
    expect(suggestNextVersion(["1.3.0-beta.5"])).toBe("1.3.0-beta.6");
  });

  it("appends .1 when prerelease has no numeric identifier", () => {
    expect(suggestNextVersion(["1.0.0-alpha"])).toBe("1.0.0-alpha.1");
    expect(suggestNextVersion(["2.0.0-rc"])).toBe("2.0.0-rc.1");
  });

  it("uses highest version when multiple exist", () => {
    expect(suggestNextVersion(["1.0.0", "1.0.1", "1.1.0"])).toBe("1.1.1");
    expect(suggestNextVersion(["0.1.0", "1.0.0", "0.2.0"])).toBe("1.0.1");
  });

  it("handles prerelease as lower than release", () => {
    // 1.0.0-rc.1 < 1.0.0, so highest is 1.0.0
    expect(suggestNextVersion(["1.0.0-rc.1", "1.0.0"])).toBe("1.0.1");
  });

  it("extends prerelease when highest is prerelease", () => {
    expect(suggestNextVersion(["1.0.0", "1.0.1-rc.1"])).toBe("1.0.1-rc.2");
  });
});

describe("isVersionOccupied", () => {
  it("returns true when version exists", () => {
    expect(isVersionOccupied("1.0.0", ["1.0.0", "1.0.1"])).toBe(true);
  });

  it("returns false when version does not exist", () => {
    expect(isVersionOccupied("1.0.2", ["1.0.0", "1.0.1"])).toBe(false);
  });

  it("returns false for empty list", () => {
    expect(isVersionOccupied("1.0.0", [])).toBe(false);
  });
});
