/**
 * Deterministic CR-name generator for LogicFlowDefinitions.
 *
 * Implements ADR 0001 "Suggested versions and generated CR names" EXACTLY:
 * - Ordinary: `{name}-v-{major}-{minor}-{patch}` (e.g. `orders @ 1.2.3` → `orders-v-1-2-3`)
 * - Prerelease: append with hyphen separators (`1.3.0-rc.1` → `…-v-1-3-0-rc-1`)
 * - Suffix-first budget: compute suffix first; prefix gets remaining chars out of 63
 * - Lossy cases: insert 8 hex SHA-256 hash before suffix when prefix truncates,
 *   case-folds, or prerelease contains literal hyphen
 * - Lowercase result + trim trailing hyphens
 * - Signal when insufficient room for suffix + nonempty prefix
 * - Valid DNS-1123 label: ≤63 chars, lowercase alphanumeric + `-`, no leading/trailing `-`
 *
 * PURE module. No side effects. Exhaustively tested. This is the load-bearing part.
 */

import type { GeneratedCrNameInput } from "../../contracts/workflow.ts";

const DNS_1123_MAX_LENGTH = 63;
const HASH_SEPARATOR = "-";
const VERSION_SEPARATOR = "-v-";
const PRERELEASE_SEPARATOR = "-";

/**
 * Compute SHA-256 hash using Web Crypto API.
 * Returns the first 8 lowercase hex digits.
 */
const computeHash = async (namespace: string, workflowName: string, version: string): Promise<string> => {
  const hashInput = JSON.stringify([namespace, workflowName, version]);
  const encoder = new TextEncoder();
  const data = encoder.encode(hashInput);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex.slice(0, 8);
};

/**
 * Generate a deterministic CR name per the ADR algorithm.
 *
 * @returns The generated CR name, or an error object if the name cannot fit.
 */
export const generateCrName = async (
  input: GeneratedCrNameInput,
): Promise<{ name: string } | { error: "insufficient-room" }> => {
  const { namespace, workflowName, version } = input;

  // Parse version into main and prerelease parts
  const [mainVersion, ...prereleaseRaw] = version.split("-");
  const prerelease = prereleaseRaw.join("-");

  // Build suffix: -v-{M}-{m}-{p}[-{prerelease}]
  const mainParts = (mainVersion ?? "").split(".");
  const major = mainParts[0] ?? "0";
  const minor = mainParts[1] ?? "0";
  const patch = mainParts[2] ?? "0";

  let suffix = `${VERSION_SEPARATOR}${major}-${minor}-${patch}`;
  if (prerelease) {
    // Convert dots in prerelease to hyphens (SemVer uses dots; DNS-1123 forbids them)
    const prereleaseForDns = prerelease.replace(/\./g, "-");
    suffix += `${PRERELEASE_SEPARATOR}${prereleaseForDns}`;
  }

  // Check if we need a hash:
  // - Case folding changes identity (workflow name has uppercase)
  // - Prerelease contains a literal hyphen (after dot→hyphen conversion, we can't distinguish)
  // - Prefix will be truncated (checked below)
  const originalPrefix = workflowName;
  const lowercasePrefix = originalPrefix.toLowerCase();
  const caseFolded = originalPrefix !== lowercasePrefix;
  const prereleaseHasLiteralHyphen = prerelease.includes("-");
  const needsHash = caseFolded || prereleaseHasLiteralHyphen;

  // Compute hash if needed (8 hex digits from SHA-256 of [namespace, workflowName, version])
  let hashPart = "";
  if (needsHash) {
    const hash = await computeHash(namespace, workflowName, version);
    hashPart = `${HASH_SEPARATOR}${hash}`;
  }

  // Calculate available space for prefix
  // Total budget: 63 chars
  // Used: suffix.length + hashPart.length (if hash) + prefix
  const reservedForSuffix = suffix.length + hashPart.length;
  const availableForPrefix = DNS_1123_MAX_LENGTH - reservedForSuffix;

  // Check if we need to truncate the prefix
  let finalPrefix = lowercasePrefix;
  let truncated = false;

  if (finalPrefix.length > availableForPrefix) {
    truncated = true;
    if (availableForPrefix <= 0) {
      // No room for prefix at all
      return { error: "insufficient-room" };
    }
    finalPrefix = finalPrefix.slice(0, availableForPrefix);
  }

  // If we truncated, we need a hash (even if we didn't need one before)
  if (truncated && !needsHash) {
    // Recalculate with hash
    const hash = await computeHash(namespace, workflowName, version);
    hashPart = `${HASH_SEPARATOR}${hash}`;
    // Recalculate available space (reserve 9 chars for hash)
    const newReservedForSuffix = suffix.length + hashPart.length;
    const newAvailableForPrefix = DNS_1123_MAX_LENGTH - newReservedForSuffix;
    if (newAvailableForPrefix <= 0) {
      return { error: "insufficient-room" };
    }
    finalPrefix = lowercasePrefix.slice(0, newAvailableForPrefix);
  }

  // Trim trailing hyphens from prefix
  finalPrefix = finalPrefix.replace(/-+$/, "");

  // If trimming left us with an empty prefix, signal error
  if (!finalPrefix) {
    return { error: "insufficient-room" };
  }

  // Assemble final name
  const finalName = `${finalPrefix}${hashPart}${suffix}`;

  // Validate DNS-1123 (should always pass if logic is correct, but verify)
  if (
    finalName.length > DNS_1123_MAX_LENGTH ||
    finalName.startsWith("-") ||
    finalName.endsWith("-") ||
    !/^[a-z0-9-]+$/.test(finalName)
  ) {
    // Should never happen; if it does, there's a bug in the generator
    throw new Error(`Generated invalid DNS-1123 name: ${finalName}`);
  }

  return { name: finalName };
};
