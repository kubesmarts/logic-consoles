/**
 * Compatibility manifest type.
 *
 * ADR 0001 "Release contract" and PLAN "Compatibility and release evidence": the
 * compatibility page and CI read the SAME versioned manifest. Each component entry
 * carries tested/detected/source/unknown provenance. A mutable image tag alone
 * cannot identify a tested build, so a digest field is available.
 *
 * The dev-baseline DATA lives in src/fixtures/compatibility-baseline.ts, NOT inside
 * any logic. No row is certified yet.
 */

export type VersionSource =
  /** The value verified against a released operator tag / fixtures. */
  | "tested"
  | "development"
  /** Read from the live cluster/images at connect time. */
  | "detected"
  /** Operator or admin override. */
  | "override"
  /** Could not be identified (unreadable image, missing permission). */
  | "unknown";

export interface CompatibilityEntry {
  /** Component identifier, for example "operator", "gateway", "runner". */
  readonly component: string;
  /** Human label for the component. */
  readonly label: string;
  /** Tested version string, if a tested value exists. */
  readonly testedVersion?: string;
  readonly baseline?: string;
  /** Detected version string read from the cluster, if readable. */
  readonly detectedVersion?: string;
  /** Image digest where available (a tag alone cannot identify a build). */
  readonly digest?: string;
  readonly source: VersionSource;
  readonly notes?: string;
}

export interface CompatibilityManifest {
  /** This console artifact version. */
  readonly consoleVersion: string;
  /** Operator release this manifest was built against (or the dev commit). */
  readonly operatorRelease: string;
  readonly apiGroupVersion: string;
  /** True only once a row has been certified against a released operator tag. */
  readonly certified: boolean;
  readonly entries: readonly CompatibilityEntry[];
}
