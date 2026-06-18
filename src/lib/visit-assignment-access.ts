type VisitAssignmentUser = {
  role?: unknown;
  designation?: unknown;
  department?: unknown;
  title?: unknown;
  jobTitle?: unknown;
};

const normalizeAccessKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const VISIT_ASSIGNMENT_ACCESS_KEYS = new Set([
  "admin",
  "allocator",
  "allocators",
  "allocater",
  "pc",
  "ea",
  "executiveassistant",
  "dataanalytics",
  "misdataanalytics",
  "it",
  "informationtechnology",
  "softwaredeveloper",
]);

export const canAssignInstallerSlots = (
  user?: VisitAssignmentUser | null
): boolean => {
  if (!user) return false;

  return [
    user.role,
    user.designation,
    user.department,
    user.title,
    user.jobTitle,
  ].some((value) => VISIT_ASSIGNMENT_ACCESS_KEYS.has(normalizeAccessKey(value)));
};
