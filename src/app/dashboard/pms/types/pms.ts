// =============================================================================
// PMS Domain Types — Single source of truth for all PMS-related type definitions
// =============================================================================

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

export type PmsJobStatus = "WAITING" | "PLANNED" | "IN_PROGRESS" | "DONE";

export type PmsJob = {
  id: string;
  orderId: string;
  jobGroupId?: string;
  productId?: string;
  stepNo?: number;
  process?: string;
  requiredMinutes?: number;
  status?: PmsJobStatus;
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
  designTime: string;
  handWorkTime: string;
  hourlyCharge: string;
};

export type StoredEmbellishment = {
  enabled?: boolean;
  customerName?: string;
  customerPhone?: string;
  numberOfWindows?: number;
  numberOfPanels?: number;
  embellishmentBarcode?: string;
  stitchingPerPanel?: number;
  designTime?: number;
  handWorkTime?: number;
  totalHours?: number;
  totalTime?: number;
  hourlyCharge?: number;
  chargeAmount?: number;
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

export type PmsVasOverride = {
  id: string;
  orderId: string;
  vasIndex: number;
  vasName?: string;
  productId?: string;
  productName?: string;
  updatedAt?: string;
  updatedBy?: {
    id?: string | null;
    name?: string | null;
    role?: string | null;
  };
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
  requiresEmbellishment?: boolean;
  embellishment?: StoredEmbellishment;
};

export type CreateJobDialogState = {
  open: boolean;
  row: CreateJobDialogRow | null;
  embellishmentEnabled: boolean;
  form: EmbellishmentFormValues;
};

export type PmsWorkingHours = {
  startTime: string;
  endTime: string;
  timezoneOffsetMinutes: number;
};

// ---------------------------------------------------------------------------
// Derived / computed row types used by the UI
// ---------------------------------------------------------------------------

export type LiveVasRow = {
  key: string;
  orderId: string;
  orderNo: string;
  customer: string;
  customerPhone?: string;
  vasName: string;
  qty: number;
  group: string;
  status: string;
  currentProcess: string;
  nextProcess?: string;
  machineName: string;
  personName: string;
  plannedStart?: string;
  plannedEnd?: string;
  eta?: string;
  lastUpdate?: string;
  matchedProductId?: string;
  matchedProductName?: string;
  hasProductOverride?: boolean;
  hasJobsForProduct: boolean;
  noPlanReason: string;
  invoiceReady: boolean;
  orderPriority: number;
  priorityLabel: string;
  isEmergency: boolean;
  hasRouting?: boolean;
  requiresEmbellishment?: boolean;
  embellishment?: PmsEmbellishmentRecord;
  vasIndex?: number;
};

export type StepPlanInfo = {
  plannedStart?: string;
  plannedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  status?: string;
  machineName?: string;
  personName?: string;
};

export type WorkDetailRow = {
  key: string;
  currentJobId: string;
  orderId: string;
  orderNo: string;
  customer: string;
  vasName: string;
  vasGroup: string;
  qty: number;
  process: string;
  machine?: string;
  person?: string;
  plannedStart?: string;
  plannedEnd?: string;
  status: string;
  routingSteps: PmsRouting[];
  currentStepNo?: number;
  isFinalStep: boolean;
  totalSteps: number;
  productName: string;
  stepPlanMap: Map<number, StepPlanInfo>;
  nextProcess?: string;
  nextPlannedStart?: string;
  nextPlannedEnd?: string;
  nextMachine?: string;
  nextPerson?: string;
  resetJobIds: string[];
  resetPlanDocIds: string[];
  blockedByLabel?: string;
  embellishment?: PmsEmbellishmentRecord;
};

export type WorkSheetStepRow = {
  key: string;
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
  stepNo?: number;
  embellishment?: PmsEmbellishmentRecord;
};

export type LiveVasStats = {
  totalItems: number;
  inProgress: number;
  planned: number;
  waiting: number;
  done: number;
  emergency: number;
};

export type PmsNextDayPlanRow = {
  key: string;
  orderNo: string;
  customer: string;
  vasName: string;
  process: string;
  person: string;
  machine: string;
  plannedStart?: string;
  plannedEnd?: string;
  qty: number;
};

export type PmsStats = {
  products: number;
  activeMachines: number;
  totalMachines: number;
  people: number;
  totalCapacity: number;
  downtimeEvents: number;
};

// ---------------------------------------------------------------------------
// Import / Export
// ---------------------------------------------------------------------------

export type ImportTab = "routing" | "machines" | "skills" | "downtime";

export type ImportState = {
  open: boolean;
  tab: ImportTab;
  text: string;
  loading: boolean;
  preview: any[];
};

// ---------------------------------------------------------------------------
// Manual Done Dialog
// ---------------------------------------------------------------------------

export type ManualDoneDialogRow = {
  key: string;
  jobId: string;
  orderId: string;
  orderNo: string;
  customer: string;
  smName?: string;
  vasName: string;
  process: string;
  person?: string;
  qty: number;
  stepNo?: number;
  totalSteps: number;
  isFinalStep?: boolean;
  plannedStart?: string;
  plannedEnd?: string;
  nextProcess?: string;
  nextPerson?: string;
  nextMachine?: string;
  nextPlannedStart?: string;
  nextPlannedEnd?: string;
};

export type ManualDoneDialogState = {
  open: boolean;
  row: ManualDoneDialogRow | null;
};

export type SkillSelectionState = {
  selectedSkillMachine: string;
  selectedSkillPerson: string;
  copyToMachine: string;
  skillSearch: string;
  viewFilter: string;
};

// ---------------------------------------------------------------------------
// Delete Confirmation
// ---------------------------------------------------------------------------

export type DeleteDialogType = "product" | "machine" | "person" | "routing" | "downtime";

export type DeleteDialogState = {
  open: boolean;
  type: DeleteDialogType;
  id: string;
  name: string;
};

// ---------------------------------------------------------------------------
// Shared lookup maps — built once, consumed everywhere
// ---------------------------------------------------------------------------

export type PmsLookups = {
  ordersById: Map<string, any>;
  machineById: Map<string, PmsMachine>;
  personById: Map<string, PmsPerson>;
  productById: Map<string, PmsProduct>;
  routingByProduct: Map<string, PmsRouting[]>;
  planByJob: Map<string, PmsPlan>;
  planDocIdsByJob: Map<string, string[]>;
};
