const normalizeProcessName = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const MANUAL_COMPLETION_PROCESS_KEYS = new Set([
  normalizeProcessName("Packaging"),
  normalizeProcessName("Q&Q"),
  normalizeProcessName("Final Complete Kitting"),
]);

const MANUAL_DONE_AFTER_PROCESS_KEYS = new Set([
  normalizeProcessName("Cutting"),
  normalizeProcessName("Packaging"),
]);

export const isManualCompletionProcess = (process?: string) =>
  MANUAL_COMPLETION_PROCESS_KEYS.has(normalizeProcessName(process));

export const requiresManualDoneAfterProcess = (process?: string) =>
  MANUAL_DONE_AFTER_PROCESS_KEYS.has(normalizeProcessName(process));
