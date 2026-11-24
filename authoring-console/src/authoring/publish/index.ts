/**
 * Publish module — E2 public API.
 *
 * Exports:
 * - CR-name generator (deliverable 1)
 * - Family resolution (deliverable 2)
 * - Publish flow utilities (deliverable 3)
 * - Version suggestion
 */

export { generateCrName } from "./cr-name-generator.ts";
export {
  resolveWorkflowVersion,
  DEFINITION_GVK,
  type ResolutionResult,
  type AmbiguousResolution,
  type UnambiguousResolution,
  type NotFoundResolution,
} from "./family-resolution.ts";
export {
  buildPublishCandidate,
  useRuntimes,
  RUNTIME_GVK,
  type PublishMode,
  type RuntimeInfo,
  type PublishCandidate,
} from "./usePublishFlow.ts";
export {
  suggestNextVersion,
  isVersionOccupied,
} from "./version-suggestion.ts";
