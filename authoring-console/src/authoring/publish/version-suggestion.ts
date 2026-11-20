/**
 * Version suggestion logic.
 *
 * Per ADR 0001 "Suggested versions and generated CR names":
 * - For an existing stable family, suggest the next patch after the highest deployed stable SemVer
 * - When extending a prerelease, increment its trailing numeric identifier
 *   (`1.3.0-rc.1` → `1.3.0-rc.2`) or append `.1` if it has none
 * - Skip occupied suggestions
 */

import { compareSemver } from "../../app/queries.ts";

/**
 * Parse a version string into main and prerelease parts.
 */
const parseVersion = (
  version: string,
): { main: string; major: number; minor: number; patch: number; prerelease: string | null } => {
  const [main, ...prereleaseRaw] = version.split("-");
  const prerelease = prereleaseRaw.length > 0 ? prereleaseRaw.join("-") : null;
  const parts = (main ?? "").split(".");
  const major = Number(parts[0] ?? "0");
  const minor = Number(parts[1] ?? "0");
  const patch = Number(parts[2] ?? "0");
  return { main: main ?? "", major, minor, patch, prerelease };
};

/**
 * Increment a prerelease identifier.
 * - `rc.1` → `rc.2`
 * - `rc` → `rc.1`
 * - `alpha.5.beta` → `alpha.5.beta.1`
 */
const incrementPrerelease = (prerelease: string): string => {
  const parts = prerelease.split(".");
  const lastPart = parts[parts.length - 1];
  if (lastPart !== undefined && /^\d+$/.test(lastPart)) {
    // Last part is numeric, increment it
    const incremented = Number(lastPart) + 1;
    return [...parts.slice(0, -1), String(incremented)].join(".");
  }
  // Last part is not numeric, append .1
  return `${prerelease}.1`;
};

/**
 * Suggest the next unused version for a workflow family.
 *
 * @param existingVersions - Already deployed versions (sorted by compareSemver)
 * @returns Suggested version string
 */
export const suggestNextVersion = (existingVersions: readonly string[]): string => {
  if (existingVersions.length === 0) {
    return "1.0.0";
  }

  // Find the highest version
  const sorted = [...existingVersions].sort(compareSemver);
  const highest = sorted[sorted.length - 1];
  if (!highest) {
    return "1.0.0";
  }

  const parsed = parseVersion(highest);

  if (parsed.prerelease) {
    // Extending a prerelease: increment its trailing numeric identifier
    const nextPrerelease = incrementPrerelease(parsed.prerelease);
    return `${parsed.major}.${parsed.minor}.${parsed.patch}-${nextPrerelease}`;
  }

  // Extending a stable version: increment patch
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
};

/**
 * Check if a version is already occupied in the family.
 */
export const isVersionOccupied = (
  version: string,
  existingVersions: readonly string[],
): boolean => {
  return existingVersions.includes(version);
};
