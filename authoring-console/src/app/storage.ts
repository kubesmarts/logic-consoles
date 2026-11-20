/**
 * localStorage-backed ConsoleStorage.
 *
 * Only UI preferences and workflow drafts are persisted, inside a versioned
 * envelope. Credentials, tokens, Secret contents and execution payloads are NEVER
 * written. A failed save returns a failure outcome (it does not throw) so the UI can
 * keep the in-memory draft and offer YAML export.
 */
import {
  STORAGE_SCHEMA_VERSION,
  type ConsoleStorage,
  type DraftSaveOutcome,
  type StoredEnvelope,
  type UiPreferences,
} from "../contracts/index.ts";

const STORAGE_KEY = "authoring-console:v1";

const DEFAULT_PREFERENCES: UiPreferences = { theme: "light" };

const emptyEnvelope = (): StoredEnvelope => ({
  schemaVersion: STORAGE_SCHEMA_VERSION,
  preferences: DEFAULT_PREFERENCES,
  drafts: [],
});

export const createConsoleStorage = (storage: Storage = window.localStorage): ConsoleStorage => {
  const read = (): StoredEnvelope => {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyEnvelope();
    try {
      const parsed = JSON.parse(raw) as StoredEnvelope;
      if (parsed.schemaVersion !== STORAGE_SCHEMA_VERSION) {
        // Unknown/older format: discard rather than risk mis-reading persisted state.
        return emptyEnvelope();
      }
      return parsed;
    } catch {
      return emptyEnvelope();
    }
  };

  const write = (envelope: StoredEnvelope): void => {
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  };

  return {
    readPreferences: () => read().preferences,

    writePreferences: (next) => {
      const envelope = read();
      write({ ...envelope, preferences: next });
    },

    listDrafts: () => read().drafts,

    getDraft: (id) => read().drafts.find((d) => d.id === id),

    saveDraft: (draft): DraftSaveOutcome => {
      try {
        const envelope = read();
        const drafts = envelope.drafts.filter((d) => d.id !== draft.id).concat(draft);
        write({ ...envelope, drafts });
        return { ok: true, draft };
      } catch (cause) {
        const reason =
          cause instanceof DOMException && cause.name === "QuotaExceededError"
            ? "quota-exceeded"
            : "unavailable";
        return { ok: false, reason, draft };
      }
    },

    removeDraft: (id) => {
      const envelope = read();
      write({ ...envelope, drafts: envelope.drafts.filter((d) => d.id !== id) });
    },

    // Export the portable workflow YAML directly (it is already YAML). A header
    // comment records the draft's target context for the author's reference.
    exportDraftYaml: (draft) =>
      `# Authoring Console draft: ${draft.title}\n` +
      `# target: context=${draft.target.contextName} namespace=${draft.target.namespace}` +
      (draft.target.runtimeName ? ` runtime=${draft.target.runtimeName}` : "") +
      `\n${draft.workflowYaml}`,
  };
};
