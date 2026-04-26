import {
  formatDateTimeInZone,
  IST_TIME_ZONE,
} from "@/lib/pms/time";
export {
  isPmsExcludedItem,
  normalizePmsItemKey,
} from "@/lib/pms/filters";

export type PmsProduct = {
  id: string;
  name: string;
  category: string;
};

export type PmsRouting = {
  id: string;
  productId: string;
  stepNo: number;
  process: string;
  cycleMinutes: number;
  ops: number;
};

export type PmsMachine = {
  id: string;
  name: string;
  process: string;
  shiftMinutes: number;
  active: boolean;
};

export type PmsPerson = {
  id: string;
  name: string;
  role?: string;
  active?: boolean;
  leaveFrom?: string | null;
  leaveTo?: string | null;
  leaveReason?: string | null;
  weekOffDay?: string | null;
};

export type PmsSkill = {
  id: string;
  machineId: string;
  personId: string;
  process: string;
  category: string;
  allowed: boolean;
};

export type PmsDowntime = {
  id: string;
  machineId: string;
  from: string;
  to: string;
  reason?: string;
};

export type PmsCategory = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PmsJob = {
  id: string;
  orderId: string;
  jobGroupId?: string;
  productId?: string;
  stepNo?: number;
  process?: string;
  requiredMinutes?: number;
  status?: "WAITING" | "PLANNED" | "IN_PROGRESS" | "DONE";
  plannedStart?: string;
  plannedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  updatedAt?: string;
};

export type PmsPlan = {
  id: string;
  jobId: string;
  machineId: string;
  personId: string;
  plannedStart?: string;
  plannedEnd?: string;
};

export type EmbellishmentFormValues = {
  customerName: string;
  customerPhone: string;
  numberOfWindows: string;
  numberOfPanels: string;
  embellishmentBarcode: string;
  stitchingPerPanel: string;
  handWorkTime: string;
};

export type StoredEmbellishment = {
  enabled?: boolean;
  customerName?: string;
  customerPhone?: string;
  numberOfWindows?: number;
  numberOfPanels?: number;
  embellishmentBarcode?: string;
  stitchingPerPanel?: number;
  handWorkTime?: number;
  totalHours?: number;
  totalTime?: number;
  hourlyCharge?: number;
  chargeAmount?: number;
};

export type CreateJobDialogRow = {
  key: string;
  orderId: string;
  orderNo: string;
  customer: string;
  customerPhone?: string;
  vasName: string;
  qty: number;
  matchedProductId?: string;
  matchedProductName?: string;
  hasRouting?: boolean;
  invoiceReady: boolean;
  hasJobsForProduct: boolean;
  vasIndex: number;
  embellishment?: StoredEmbellishment;
};

export type CreateJobDialogState = {
  open: boolean;
  row: CreateJobDialogRow | null;
  embellishmentEnabled: boolean;
  form: EmbellishmentFormValues;
};

export type PmsEmbellishmentRecord = StoredEmbellishment & {
  id: string;
  orderId?: string;
  orderNo?: string;
  customer?: string;
  customerPhone?: string;
  vasName?: string;
  vasIndex?: number;
  productId?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: {
    id?: string | null;
    name?: string | null;
    role?: string | null;
  };
};

export const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const roundToTwoDecimals = (value: number) => Math.round(value * 100) / 100;

export const IST_TIMEZONE_OFFSET_MINUTES = 330;
export const AUTO_ADVANCE_POLL_MS = 15_000;
export const EMBELLISHMENT_HOURLY_CHARGE = 300;

export const formatDateTime = (value?: string) => {
  return formatDateTimeInZone(value, {
    timeZone: IST_TIME_ZONE,
    placeholder: "-",
  });
};

export const getQueueDelayLabel = (startIso?: string) => {
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

export const normalizeText = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase();

export const matchesPmsSearch = (search: string, values: unknown[]) => {
  const query = normalizeText(search);
  if (!query) return true;
  const haystack = values
    .flatMap((value) => {
      if (Array.isArray(value)) return value.map((item) => String(item ?? ""));
      return [String(value ?? "")];
    })
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
};

export const buildSkillId = (machineId: string, personId: string, category: string) =>
  `${machineId}_${personId}_${category.replace(/[^a-zA-Z0-9]/g, "_")}`;

const EMBELLISHMENT_PROCESS_KEYS = new Set([
  "embelshment work",
  "embelishment work",
  "embellishment work",
]);

export const REQUIRED_ROUTING_FINISH_STEPS = ["Q&Q", "Final Complete Kitting", "Packaging"] as const;
export const ROUTING_QUICK_ADD_STEPS = [
  "Embelshment work",
  "Q&Q",
  "Final Complete Kitting",
  "Packaging",
] as const;

export const emptyEmbellishmentForm: EmbellishmentFormValues = {
  customerName: "",
  customerPhone: "",
  numberOfWindows: "",
  numberOfPanels: "",
  embellishmentBarcode: "",
  stitchingPerPanel: "",
  handWorkTime: "",
};

export const toFormString = (value: unknown) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

export const isEmbellishmentProcess = (process?: string) =>
  EMBELLISHMENT_PROCESS_KEYS.has(
    String(process || "")
      .trim()
      .toLowerCase()
  );

export const buildEmbellishmentForm = (
  row?: Partial<CreateJobDialogRow> | null,
  existing?: StoredEmbellishment
): EmbellishmentFormValues => ({
  customerName: toFormString(existing?.customerName ?? row?.customer ?? ""),
  customerPhone: toFormString(existing?.customerPhone ?? row?.customerPhone ?? ""),
  numberOfWindows: toFormString(existing?.numberOfWindows),
  numberOfPanels: toFormString(existing?.numberOfPanels),
  embellishmentBarcode: toFormString(existing?.embellishmentBarcode),
  stitchingPerPanel: toFormString(existing?.stitchingPerPanel),
  handWorkTime: toFormString(existing?.handWorkTime),
});

export const appendRoutingProcesses = (
  rows: PmsRouting[],
  productId: string,
  processes: readonly string[]
) => {
  const existingProcesses = new Set(rows.map((row) => normalizeText(row.process)));
  let nextStep = rows.length ? Math.max(...rows.map((row) => row.stepNo)) + 1 : 1;
  const additions: PmsRouting[] = [];

  processes.forEach((process) => {
    if (existingProcesses.has(normalizeText(process))) return;
    additions.push({
      id: `local-${process.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}-${nextStep}`,
      productId,
      stepNo: nextStep,
      process,
      cycleMinutes: 10,
      ops: 1,
    });
    existingProcesses.add(normalizeText(process));
    nextStep += 1;
  });

  return [...rows, ...additions];
};
