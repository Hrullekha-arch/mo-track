// =============================================================================
// PMS Pure Utility Functions
// No side effects, no React, no Firebase — easy to unit test
// =============================================================================

import type {
  PmsJob,
  PmsLookups,
  PmsMachine,
  PmsPerson,
  PmsPlan,
  PmsProduct,
  PmsRouting,
  PmsSkill,
  PmsStats,
  LiveVasStats,
  LiveVasRow,
} from "../types/pms";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const IST_TIMEZONE_OFFSET_MINUTES = 330;
export const AUTO_ADVANCE_POLL_MS = 15_000;
export const WORKSHEET_SYNC_MS = 60_000;
export const SKILL_DEBOUNCE_MS = 350;
export const FIRESTORE_BATCH_LIMIT = 450;

export const JOB_STATUS_RANK: Record<string, number> = {
  IN_PROGRESS: 0,
  PLANNED: 1,
  WAITING: 2,
  DONE: 3,
};

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Parse a string to a finite number or return 0. */
export const toNumber = (value: string | number | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Clamp qty: ensure it's at least 1 and an integer.
 * Prevents jobs being created with 0 or negative qty.
 */
export const safeQty = (raw: number | string | undefined): number => {
  const n = toNumber(String(raw ?? 0));
  return Math.max(1, Math.round(n));
};

/** Normalize a string for case-insensitive, trimmed comparison. */
export const normalizeText = (value?: string): string =>
  String(value || "")
    .trim()
    .toLowerCase();

/** Deterministic skill document ID. */
export const buildSkillId = (
  machineId: string,
  personId: string,
  category: string
): string =>
  `${machineId}_${personId}_${category.replace(/[^a-zA-Z0-9]/g, "_")}`;

// ---------------------------------------------------------------------------
// Date / Time helpers
// ---------------------------------------------------------------------------

/**
 * Relative label for how long until a planned start time.
 * Returns "" if no start time, "Ready now" if in the past, or "Queue starts in Xh Ym".
 */
export const getQueueDelayLabel = (startIso?: string): string => {
  if (!startIso) return "";
  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs)) return "";
  const diffMs = startMs - Date.now();
  if (diffMs <= 0) return "Ready now";
  const totalMinutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `Queue starts in ${minutes}m`;
  return `Queue starts in ${hours}h ${minutes}m`;
};

// ---------------------------------------------------------------------------
// Shared Lookup Builder
// ---------------------------------------------------------------------------

/**
 * Build all shared lookup maps once from raw arrays.
 * This prevents each useMemo from re-creating its own Map instances.
 */
export const buildLookups = (
  orders: any[],
  machines: PmsMachine[],
  people: PmsPerson[],
  products: PmsProduct[],
  routing: PmsRouting[],
  plans: PmsPlan[]
): PmsLookups => {
  const ordersById = new Map(orders.map((o) => [o.id, o]));
  const machineById = new Map(machines.map((m) => [m.id, m]));
  const personById = new Map(people.map((p) => [p.id, p]));
  const productById = new Map(products.map((p) => [p.id, p]));

  const routingByProduct = new Map<string, PmsRouting[]>();
  routing.forEach((step) => {
    if (!routingByProduct.has(step.productId))
      routingByProduct.set(step.productId, []);
    routingByProduct.get(step.productId)!.push(step);
  });
  routingByProduct.forEach((steps, key) => {
    routingByProduct.set(
      key,
      [...steps].sort((a, b) => a.stepNo - b.stepNo)
    );
  });

  const planDocIdsByJob = new Map<string, string[]>();
  plans.forEach((plan) => {
    const jobId = String((plan as any)?.jobId || "").trim();
    const planId = String((plan as any)?.id || "").trim();
    if (!jobId || !planId) return;
    if (!planDocIdsByJob.has(jobId)) planDocIdsByJob.set(jobId, []);
    planDocIdsByJob.get(jobId)!.push(planId);
  });

  const planByJob = new Map<string, PmsPlan>();
  plans.forEach((plan) => {
    const existing = planByJob.get(plan.jobId);
    if (!existing) {
      planByJob.set(plan.jobId, plan);
      return;
    }
    const existingTime = new Date(
      existing.plannedEnd || existing.plannedStart || 0
    ).getTime();
    const nextTime = new Date(
      plan.plannedEnd || plan.plannedStart || 0
    ).getTime();
    if (nextTime >= existingTime) {
      planByJob.set(plan.jobId, plan);
    }
  });

  return {
    ordersById,
    machineById,
    personById,
    productById,
    routingByProduct,
    planByJob,
    planDocIdsByJob,
  };
};

// ---------------------------------------------------------------------------
// Product ↔ VAS Matching
// ---------------------------------------------------------------------------

/**
 * Match a VAS item description to a PMS product.
 *
 * Priority:
 * 1. Exact match on normalizeText(name)
 * 2. Substring match (only if substring ≥ 4 chars to avoid false positives)
 *
 * The min-length guard prevents "Box" matching "Toolbox" etc.
 */
export const matchProductToVas = (
  vasName: string,
  searchCandidates: string[],
  products: PmsProduct[]
): PmsProduct | undefined => {
  const vasKey = normalizeText(vasName);

  // 1. Exact match
  const exact = products.find((p) => normalizeText(p.name) === vasKey);
  if (exact) return exact;

  // 2. Guarded substring match — both sides must be ≥ 4 chars
  const MIN_SUBSTR_LEN = 4;
  return products.find((product) => {
    const productKey = normalizeText(product.name);
    if (productKey.length < MIN_SUBSTR_LEN) return false;

    return searchCandidates.some((candidate) => {
      const left = normalizeText(candidate);
      if (left.length < MIN_SUBSTR_LEN) return false;
      return left === productKey || left.includes(productKey) || productKey.includes(left);
    });
  });
};

// ---------------------------------------------------------------------------
// VAS Info Resolver
// ---------------------------------------------------------------------------

export const resolveVasInfo = (
  order: any | undefined,
  productName: string | undefined
): { vasName: string; vasGroup: string; qty: number } => {
  const items = order?.sections?.VAS?.items || [];
  if (!items.length) {
    return { vasName: productName || "VAS", vasGroup: "-", qty: 0 };
  }
  if (!productName) {
    const fallback = items[0] || {};
    return {
      vasName: fallback.description || fallback.group || "VAS",
      vasGroup: fallback.group || "-",
      qty: fallback.qty ?? fallback.quantity ?? 0,
    };
  }
  const productKey = normalizeText(productName);
  const exactMatch = items.find(
    (item: any) => normalizeText(item.description || item.group || "") === productKey
  );
  if (exactMatch) {
    return {
      vasName: exactMatch.description || exactMatch.group || productName,
      vasGroup: exactMatch.group || "-",
      qty: exactMatch.qty ?? exactMatch.quantity ?? 0,
    };
  }
  const fuzzyMatch = items.find((item: any) => {
    const candidates = [item.description, item.group, item.roomName, item.type].filter(
      Boolean
    ) as string[];
    return candidates.some((candidate) => {
      const left = normalizeText(candidate);
      return (
        left === productKey || left.includes(productKey) || productKey.includes(left)
      );
    });
  });
  const matched = fuzzyMatch || items[0] || {};
  return {
    vasName: matched.description || matched.group || productName,
    vasGroup: matched.group || "-",
    qty: matched.qty ?? matched.quantity ?? 0,
  };
};

// ---------------------------------------------------------------------------
// "Explain No Plan" — why a WAITING job has no planned slot
// ---------------------------------------------------------------------------

export const explainNoPlan = (
  productId: string | undefined,
  hasJobs: boolean,
  waitingJob: PmsJob | undefined,
  prevJob: PmsJob | undefined,
  invoiceReady: boolean,
  lookups: PmsLookups,
  machines: PmsMachine[],
  skills: PmsSkill[]
): string => {
  if (!invoiceReady) return "Invoice not generated";
  if (!productId) return "No PMS product match";
  if (!hasJobs) return "Jobs not created";
  if (waitingJob && prevJob && prevJob.status !== "DONE") {
    return "Previous step pending";
  }

  const product = lookups.productById.get(productId);
  if (!product?.category) return "Missing product category";

  const steps = lookups.routingByProduct.get(productId) || [];
  if (steps.length === 0) return "No routing for product";

  if (waitingJob?.process) {
    const routingProcesses = new Set(steps.map((s) => normalizeText(s.process)));
    if (!routingProcesses.has(normalizeText(waitingJob.process))) {
      return "Routing changed — recreate jobs";
    }
  }

  const processKey = normalizeText(
    waitingJob?.process || steps[0]?.process || ""
  );
  if (!processKey) return "Job missing process";

  const eligibleMachines = machines.filter(
    (m) => m.active !== false && normalizeText(m.process) === processKey
  );
  if (eligibleMachines.length === 0) return "No machine for process";

  const machineIds = new Set(eligibleMachines.map((m) => m.id));
  const categoryKey = normalizeText(product.category);
  const skillMatch = skills.some(
    (skill) =>
      skill.allowed &&
      machineIds.has(skill.machineId) &&
      normalizeText(skill.process) === processKey &&
      normalizeText(skill.category) === categoryKey
  );
  if (!skillMatch) return "No skill match";

  return "Waiting for slot";
};

// ---------------------------------------------------------------------------
// Order status checks
// ---------------------------------------------------------------------------

export const isOrderInvoiced = (order?: any): boolean => {
  if (!order) return false;
  const status = order.invoicing?.status;
  const invoices = order.invoicing?.invoices || [];
  if (status && status !== "NOT_INVOICED") return true;
  return Array.isArray(invoices) && invoices.length > 0;
};

export const isOrderClosedForPms = (order?: any): boolean => {
  if (!order) return false;
  const workflowStatus = String(order?.workflow?.status || "")
    .trim()
    .toUpperCase();
  if (workflowStatus === "COMPLETED" || workflowStatus === "CANCELLED") return true;
  const status = String(order?.status || "")
    .trim()
    .toUpperCase();
  return (
    status === "INSTALLATION DONE" ||
    status === "COMPLETED" ||
    status === "CANCELLED"
  );
};

// ---------------------------------------------------------------------------
// Stats builders
// ---------------------------------------------------------------------------

export const computePmsStats = (
  products: PmsProduct[],
  machines: PmsMachine[],
  people: PmsPerson[],
  downtimes: any[],
  categories: string[]
): PmsStats => {
  const activeMachines = machines.filter((m) => m.active).length;
  const totalCapacity = machines
    .filter((m) => m.active)
    .reduce((sum, m) => sum + m.shiftMinutes, 0);

  return {
    products: products.length,
    activeMachines,
    totalMachines: machines.length,
    people: people.length,
    totalCapacity,
    downtimeEvents: downtimes.length,
  };
};

export const computeLiveStats = (rows: LiveVasRow[]): LiveVasStats => ({
  totalItems: rows.length,
  inProgress: rows.filter((r) => r.status === "IN_PROGRESS").length,
  planned: rows.filter((r) => r.status === "PLANNED").length,
  waiting: rows.filter((r) => r.status === "WAITING").length,
  done: rows.filter((r) => r.status === "DONE").length,
  emergency: rows.filter((r) => r.isEmergency).length,
});

// ---------------------------------------------------------------------------
// Sorting helpers
// ---------------------------------------------------------------------------

export const sortByStatusThenTime = <
  T extends { status: string; plannedStart?: string; orderPriority?: number }
>(
  rows: T[]
): T[] => {
  return [...rows].sort((a, b) => {
    const statusDiff =
      (JOB_STATUS_RANK[a.status] ?? 99) - (JOB_STATUS_RANK[b.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    if (
      a.orderPriority !== undefined &&
      b.orderPriority !== undefined &&
      a.orderPriority !== b.orderPriority
    ) {
      return a.orderPriority - b.orderPriority;
    }
    const aTime = a.plannedStart
      ? new Date(a.plannedStart).getTime()
      : Number.MAX_SAFE_INTEGER;
    const bTime = b.plannedStart
      ? new Date(b.plannedStart).getTime()
      : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
};

/** Compare order numbers — numeric if possible, lexicographic otherwise. */
export const compareOrderNo = (left: string, right: string): number => {
  const leftNum = Number(left);
  const rightNum = Number(right);
  if (Number.isFinite(leftNum) && Number.isFinite(rightNum))
    return leftNum - rightNum;
  return String(left).localeCompare(String(right));
};

// ---------------------------------------------------------------------------
// Worksheet builder (for Google Sheet sync)
// ---------------------------------------------------------------------------

export const buildWorkSheetRows = (
  rows: Array<{
    orderNo: string;
    customer: string;
    vasName: string;
    qty: number;
    productName: string;
    status: string;
    nextProcess: string;
    machine?: string;
    person?: string;
    process: string;
    plannedStart?: string;
    plannedEnd?: string;
  }>,
  formatFn: (v?: string) => string
): string[][] => {
  const header = [
    "Order No",
    "Customer",
    "Vas Item",
    "Qty",
    "PMS Product",
    "Status",
    "Next Step",
    "Machine",
    "Person",
    "Process (step)",
    "Planned Start",
    "Planned End",
  ];

  const values = rows.map((row) => [
    row.orderNo,
    row.customer,
    row.vasName,
    String(row.qty),
    row.productName,
    row.status,
    row.nextProcess || "-",
    row.machine || "TBD",
    row.person || "TBD",
    row.process,
    formatFn(row.plannedStart),
    formatFn(row.plannedEnd),
  ]);

  return [header, ...values];
};

// ---------------------------------------------------------------------------
// Skill helpers
// ---------------------------------------------------------------------------

export const getSkillAllowed = (
  skills: PmsSkill[],
  machineId: string,
  personId: string,
  category: string
): boolean =>
  skills.some(
    (s) =>
      s.machineId === machineId &&
      s.personId === personId &&
      s.category === category &&
      s.allowed
  );

export const getUniqueAssignmentCount = (skills: PmsSkill[]): number => {
  const unique = new Set(
    skills.filter((s) => s.allowed).map((s) => `${s.machineId}-${s.personId}`)
  );
  return unique.size;
};