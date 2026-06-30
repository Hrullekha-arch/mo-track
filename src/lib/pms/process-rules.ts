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

// Checkpoint 1: manual-done required AFTER these processes complete
const MANUAL_DONE_AFTER_PROCESS_KEYS = new Set([
  normalizeProcessName("Cutting"),
]);

// Checkpoint 2: manual-done required BEFORE these processes start
const MANUAL_DONE_BEFORE_PROCESS_KEYS = new Set([
  normalizeProcessName("Q&Q"),
]);

export const isManualCompletionProcess = (process?: string) =>
  MANUAL_COMPLETION_PROCESS_KEYS.has(normalizeProcessName(process));

export const requiresManualDoneAfterProcess = (process?: string) =>
  MANUAL_DONE_AFTER_PROCESS_KEYS.has(normalizeProcessName(process));

export const requiresManualDoneBeforeProcess = (process?: string) =>
  MANUAL_DONE_BEFORE_PROCESS_KEYS.has(normalizeProcessName(process));
