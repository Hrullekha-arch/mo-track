'use server';

import { O2D_PROCESS_CONFIG } from "@/lib/constants";
import { adminDb } from "@/lib/firebase-admin";
import { dedupeO2DMilestones } from "@/lib/o2d-milestones";
import { getOrderStatusLabel } from "@/lib/order-workflow";
import { O2DStatus, Order } from "@/lib/types";

export interface MecaFilters {
  from?: string;
  to?: string;
  salesmanId?: string;
}

export interface MecaSalesmanOption {
  id: string;
  name: string;
}

export interface MecaStageCount {
  step: string;
  count: number;
}

export interface MecaOrderProgressRow {
  orderId: string;
  orderNo: string;
  dealId?: string;
  walkinId?: string;
  customerName: string;
  salesmanId: string;
  salesmanName: string;
  createdAt: string;
  totalAmount: number;
  status: string;
  currentStep: string;
  conversionSource: "meeting" | "outside";
}

export interface MecaVisitRow {
  visitId: string;
  customerName: string;
  scheduledDate: string;
  status: string;
  attended: boolean;
  visitType: string;
  dealId?: string;
  dealDocId?: string;
  converted?: boolean;
}

export interface MecaSalesmanMetric {
  salesmanId: string;
  salesmanName: string;
  meetings: number;
  attendedMeetings: number;
  convertedOrders: number;
  convertedFromMeetings: number;
  convertedOutsideMeetings: number;
  conversionRatio: number;
  totalRevenue: number;
  averageRupeeSale: number;
  inProcessOrders: number;
  completedOrders: number;
  stageBreakdown: MecaStageCount[];
  visits: MecaVisitRow[];
}

export interface MecaSummary {
  meetings: number;
  attendedMeetings: number;
  convertedOrders: number;
  convertedFromMeetings: number;
  convertedOutsideMeetings: number;
  conversionRatio: number;
  totalRevenue: number;
  averageRupeeSale: number;
  inProcessOrders: number;
}

export interface MecaResponse {
  generatedAt: string;
  salesmanOptions: MecaSalesmanOption[];
  salesmen: MecaSalesmanMetric[];
  summary: MecaSummary;
  inProcessByStep: MecaStageCount[];
  inProcessOrders: MecaOrderProgressRow[];
  convertedOrders: MecaOrderProgressRow[];
}

type RawDoc = Record<string, unknown>;

interface MutableSalesmanMetric {
  salesmanId: string;
  salesmanName: string;
  meetings: number;
  attendedMeetings: number;
  convertedOrders: number;
  convertedFromMeetings: number;
  convertedOutsideMeetings: number;
  totalRevenue: number;
  inProcessOrders: number;
  completedOrders: number;
  stageCounter: Map<string, number>;
  visitRows: MecaVisitRow[];
}

const EMPTY_RESPONSE: MecaResponse = {
  generatedAt: new Date().toISOString(),
  salesmanOptions: [],
  salesmen: [],
  summary: {
    meetings: 0,
    attendedMeetings: 0,
    convertedOrders: 0,
    convertedFromMeetings: 0,
    convertedOutsideMeetings: 0,
    conversionRatio: 0,
    totalRevenue: 0,
    averageRupeeSale: 0,
    inProcessOrders: 0,
  },
  inProcessByStep: [],
  inProcessOrders: [],
  convertedOrders: [],
};

const normalizeText = (value: unknown): string => String(value ?? "").trim().toLowerCase();
const isOutsideVisitType = (value: unknown): boolean => normalizeText(value).includes("outside");

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const asRecord = (value: unknown): RawDoc => {
  if (typeof value === "object" && value !== null) return value as RawDoc;
  return {};
};

const toDateSafe = (value: unknown): Date | null => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "object" && value !== null && "toDate" in value) {
    const maybeTimestamp = value as { toDate?: () => Date };
    const parsed = maybeTimestamp.toDate?.();
    if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
};

const toMillis = (value: unknown): number | null => {
  const parsed = toDateSafe(value);
  return parsed ? parsed.getTime() : null;
};

const isWithinRange = (value: unknown, fromMs: number | null, toMs: number | null): boolean => {
  const time = toMillis(value);
  if (time === null) return false;
  if (fromMs !== null && time < fromMs) return false;
  if (toMs !== null && time > toMs) return false;
  return true;
};

const toPositiveNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value > 0 ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
};

const normalizeKey = (value: unknown): string | undefined => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || undefined;
};

const normalizePhoneDigits = (value: unknown): string | undefined => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return undefined;
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const addKeyToSet = (set: Set<string>, value: unknown) => {
  const key = normalizeKey(value);
  if (key) set.add(key);
};

const addPhoneToSet = (set: Set<string>, value: unknown) => {
  const key = normalizePhoneDigits(value);
  if (key) set.add(key);
};

interface AttendedMeetingSignals {
  dealKeys: Set<string>;
  leadKeys: Set<string>;
  customerNameKeys: Set<string>;
  customerPhoneKeys: Set<string>;
}

const newAttendedMeetingSignals = (): AttendedMeetingSignals => ({
  dealKeys: new Set<string>(),
  leadKeys: new Set<string>(),
  customerNameKeys: new Set<string>(),
  customerPhoneKeys: new Set<string>(),
});

const collectWalkinDealKeys = (walkin: RawDoc): string[] => {
  const dealSnapshot = asRecord(walkin.dealSnapshot);
  const dealRef = asRecord(walkin.dealRef);
  const cashsale = asRecord(walkin.cashsale);
  const keys = new Set<string>();
  addKeyToSet(keys, walkin.latestDealId);
  addKeyToSet(keys, walkin.latestDealDocId);
  addKeyToSet(keys, walkin.dealId);
  addKeyToSet(keys, dealSnapshot.dealId);
  addKeyToSet(keys, dealSnapshot.dealDocId);
  addKeyToSet(keys, dealRef.dealId);
  addKeyToSet(keys, cashsale.dealId);
  return Array.from(keys);
};

const collectOrderDealKeys = (order: RawDoc): string[] => {
  const keys = new Set<string>();
  addKeyToSet(keys, order.dealId);
  addKeyToSet(keys, order.dealDocId);
  addKeyToSet(keys, asRecord(order.dealSnapshot).dealId);
  addKeyToSet(keys, asRecord(order.dealSnapshot).dealDocId);
  return Array.from(keys);
};

const collectWalkinLeadKeys = (walkin: RawDoc, fallbackDocId: string): string[] => {
  const keys = new Set<string>();
  addKeyToSet(keys, walkin.walkinId);
  addKeyToSet(keys, walkin.leadId);
  addKeyToSet(keys, walkin.id);
  addKeyToSet(keys, fallbackDocId);
  return Array.from(keys);
};

const collectOrderLeadKeys = (order: RawDoc): string[] => {
  const keys = new Set<string>();
  addKeyToSet(keys, order.walkinId);
  addKeyToSet(keys, order.leadId);
  addKeyToSet(keys, order.leadDocId);
  addKeyToSet(keys, asRecord(order.instantQuotationMeta).leadId);
  return Array.from(keys);
};

const collectWalkinCustomerSignals = (walkin: RawDoc): {
  names: string[];
  phones: string[];
} => {
  const customer = asRecord(walkin.customer);
  const namesSet = new Set<string>();
  const phonesSet = new Set<string>();

  addKeyToSet(namesSet, `${asNonEmptyString(walkin.firstName) ?? ""} ${asNonEmptyString(walkin.familyName) ?? ""}`.trim());
  addKeyToSet(namesSet, walkin.customerName);
  addKeyToSet(namesSet, walkin.fullName);
  addKeyToSet(namesSet, walkin.name);
  addKeyToSet(namesSet, customer.name);

  addPhoneToSet(phonesSet, walkin.mobile);
  addPhoneToSet(phonesSet, walkin.phone);
  addPhoneToSet(phonesSet, walkin.mobileNo);
  addPhoneToSet(phonesSet, walkin.mobileLast10);
  addPhoneToSet(phonesSet, walkin.mobileNormalized);
  addPhoneToSet(phonesSet, customer.phone);

  return {
    names: Array.from(namesSet),
    phones: Array.from(phonesSet),
  };
};

const collectOrderCustomerSignals = (order: RawDoc): {
  names: string[];
  phones: string[];
} => {
  const customerSnapshot = asRecord(order.customerSnapshot);
  const namesSet = new Set<string>();
  const phonesSet = new Set<string>();

  addKeyToSet(namesSet, order.customerName);
  addKeyToSet(namesSet, customerSnapshot.name);

  addPhoneToSet(phonesSet, order.customerPhone);
  addPhoneToSet(phonesSet, customerSnapshot.phone);

  return {
    names: Array.from(namesSet),
    phones: Array.from(phonesSet),
  };
};

const isOrderAttributedToMeeting = (
  order: RawDoc,
  signals: AttendedMeetingSignals | undefined
): boolean => {
  if (!signals) return false;

  const orderDealKeys = collectOrderDealKeys(order);
  if (orderDealKeys.some((key) => signals.dealKeys.has(key))) return true;

  const orderLeadKeys = collectOrderLeadKeys(order);
  if (orderLeadKeys.some((key) => signals.leadKeys.has(key))) return true;

  const customerSignals = collectOrderCustomerSignals(order);
  if (customerSignals.phones.some((phone) => signals.customerPhoneKeys.has(phone))) return true;
  if (customerSignals.names.some((name) => signals.customerNameKeys.has(name))) return true;

  return false;
};

const resolveOrderAmount = (order: RawDoc): number => {
  const overallSummary = asRecord(order.overallSummary);
  const fromSummary = toPositiveNumber(overallSummary.grandTotal);
  if (fromSummary > 0) return fromSummary;

  const fromTotalAmount = toPositiveNumber(order.totalAmount);
  if (fromTotalAmount > 0) return fromTotalAmount;

  const items = Array.isArray(order.items) ? order.items : [];
  const fromItems = items.reduce((sum, item) => {
    const row = asRecord(item);
    return sum + toPositiveNumber(row.totalAmount);
  }, 0);
  return fromItems > 0 ? fromItems : 0;
};

const resolveOrderWalkinId = (order: RawDoc): string | undefined => {
  const instantMeta = asRecord(order.instantQuotationMeta);
  return (
    asNonEmptyString(order.walkinId) ??
    asNonEmptyString(order.leadId) ??
    asNonEmptyString(order.leadDocId) ??
    asNonEmptyString(instantMeta.walkinId) ??
    asNonEmptyString(instantMeta.leadId)
  );
};

const isWalkinMeetingAttended = (walkin: RawDoc): boolean => {
  const status = normalizeText(walkin.status);
  if (!status) return false;
  if (status === "pending") return false;
  if (status === "handed over") return false;
  if (status.includes("deal created")) return true;
  if (status.includes("completed")) return true;
  if (status.includes("went-back")) return true;
  if (status.includes("closed")) return true;
  if (status.includes("attended")) return true;
  return false;
};

const shouldSkipWalkinMeeting = (walkin: RawDoc): boolean => {
  const status = normalizeText(walkin.status);
  if (status.includes("cancel")) return true;
  if (status === "cwc") return true;
  if (status.includes("reject")) return true;
  return false;
};

const isWalkinFollowUpClosedStatus = (status: unknown): boolean => {
  const normalized = normalizeText(status);
  if (!normalized) return false;
  if (normalized.includes("completed")) return true;
  if (normalized.includes("purchased")) return true;
  if (normalized.includes("installation done")) return true;
  if (normalized.includes("closed")) return true;
  return false;
};

const isOrderClosedStatus = (statusLabel: string): boolean => {
  const normalized = normalizeText(statusLabel);
  if (!normalized) return false;
  if (normalized.includes("installation done")) return true;
  if (normalized === "completed") return true;
  if (normalized === "cancelled") return true;
  return false;
};

const orderFallbackStatus = (order: RawDoc): string => {
  const statusFromWorkflow = asRecord(order.workflow).status;
  const baseOrder = {
    status: order.status as Order["status"],
    orderType: order.orderType as Order["orderType"],
    milestones: (Array.isArray(order.milestones) ? order.milestones : []) as Order["milestones"],
    workflow: asRecord(order.workflow) as unknown as Order["workflow"],
  } as Pick<Order, "status" | "orderType" | "milestones" | "workflow">;

  try {
    const label = getOrderStatusLabel(baseOrder);
    return asNonEmptyString(label) ?? asNonEmptyString(order.status) ?? asNonEmptyString(statusFromWorkflow) ?? "In Progress";
  } catch {
    return asNonEmptyString(order.status) ?? asNonEmptyString(statusFromWorkflow) ?? "In Progress";
  }
};

const resolveOrderProgress = (
  order: RawDoc,
  dedupedMilestones: O2DStatus[]
): { inProcess: boolean; currentStep: string; status: string } => {
  if (dedupedMilestones.length > 0) {
    const doneStepIds = new Set<number>(
      dedupedMilestones
        .filter((entry) => entry.status === "completed" || entry.status === "skipped")
        .map((entry) => entry.stepId)
    );

    const finalStep = O2D_PROCESS_CONFIG[O2D_PROCESS_CONFIG.length - 1];
    if (finalStep && doneStepIds.has(finalStep.id)) {
      return {
        inProcess: false,
        currentStep: finalStep.step,
        status: "INSTALLATION DONE",
      };
    }

    const pendingStep = O2D_PROCESS_CONFIG.find((step) => !doneStepIds.has(step.id));
    if (pendingStep) {
      return {
        inProcess: true,
        currentStep: pendingStep.step,
        status: pendingStep.step,
      };
    }
  }

  const fallbackStatus = orderFallbackStatus(order);
  const closed = isOrderClosedStatus(fallbackStatus);
  return {
    inProcess: !closed,
    currentStep: fallbackStatus,
    status: fallbackStatus,
  };
};

const sortStageCounts = (counts: Map<string, number>): MecaStageCount[] =>
  Array.from(counts.entries())
    .map(([step, count]) => ({ step, count }))
    .sort((a, b) => b.count - a.count || a.step.localeCompare(b.step));

const getOrdersSnapshot = async (from?: string, to?: string) => {
  const base = adminDb.collection("orders") as FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;
  let filtered = base;
  if (from) filtered = filtered.where("createdAt", ">=", from);
  if (to) filtered = filtered.where("createdAt", "<=", to);

  try {
    return await filtered.get();
  } catch (error) {
    console.warn("MeCA: Falling back to unfiltered order query.", error);
    return await base.get();
  }
};

const getWalkinsSnapshot = async () => {
  const base = adminDb.collection("Walkin_Customer") as FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;
  try {
    return await base.get();
  } catch (error) {
    console.warn("MeCA: Could not fetch walk-ins for meetings.", error);
    return null;
  }
};

const getO2DSnapshot = async () => {
  const base = adminDb.collection("o2d") as FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;
  return base.get();
};

export async function getMecaData(filters: MecaFilters = {}): Promise<MecaResponse> {
  if (!adminDb) {
    return { ...EMPTY_RESPONSE, generatedAt: new Date().toISOString() };
  }

  try {
    const from = asNonEmptyString(filters.from);
    const to = asNonEmptyString(filters.to);
    const selectedSalesmanId = asNonEmptyString(filters.salesmanId);

    const fromMs = from ? toMillis(from) : null;
    const toMs = to ? toMillis(to) : null;

    const [salesmenSnap, walkinsSnap, ordersSnap, o2dSnap] = await Promise.all([
      adminDb.collection("users").where("role", "==", "salesman").get(),
      getWalkinsSnapshot(),
      getOrdersSnapshot(from, to),
      getO2DSnapshot(),
    ]);

    const salesmanOptionsById = new Map<string, MecaSalesmanOption>();
    const salesmanIdByName = new Map<string, string>();

    const registerSalesman = (rawId: unknown, rawName: unknown): MecaSalesmanOption | null => {
      let id = asNonEmptyString(rawId);
      const name = asNonEmptyString(rawName);

      if (!id && name) {
        const mappedId = salesmanIdByName.get(normalizeText(name));
        if (mappedId) id = mappedId;
      }

      if (!id && !name) return null;
      if (!id && name) {
        id = `name:${normalizeText(name)}`;
      }
      if (!id) return null;

      const existing = salesmanOptionsById.get(id);
      const resolvedName = name ?? existing?.name ?? id;

      if (!existing) {
        salesmanOptionsById.set(id, { id, name: resolvedName });
      } else if (name && existing.name === existing.id) {
        salesmanOptionsById.set(id, { id, name });
      }

      if (name) {
        const key = normalizeText(name);
        if (!salesmanIdByName.has(key)) salesmanIdByName.set(key, id);
      }

      return salesmanOptionsById.get(id) ?? null;
    };

    salesmenSnap.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>) => {
      const payload = doc.data() as RawDoc;
      registerSalesman(doc.id, payload.name);
    });

    const metricsBySalesmanId = new Map<string, MutableSalesmanMetric>();
    const attendedMeetingSignalsBySalesman = new Map<string, AttendedMeetingSignals>();
    const convertedOrderDealKeysBySalesman = new Map<string, Set<string>>();
    const convertedOrderWalkinKeysBySalesman = new Map<string, Set<string>>();
    const addKeysBySalesman = (
      storage: Map<string, Set<string>>,
      salesmanId: string,
      values: string[]
    ) => {
      if (!values.length) return;
      const bucket = storage.get(salesmanId) ?? new Set<string>();
      values.forEach((value) => {
        const key = normalizeKey(value);
        if (key) bucket.add(key);
      });
      storage.set(salesmanId, bucket);
    };
    const ensureMetric = (salesman: MecaSalesmanOption): MutableSalesmanMetric => {
      let metric = metricsBySalesmanId.get(salesman.id);
      if (!metric) {
        metric = {
          salesmanId: salesman.id,
          salesmanName: salesman.name,
          meetings: 0,
          attendedMeetings: 0,
          convertedOrders: 0,
          convertedFromMeetings: 0,
          convertedOutsideMeetings: 0,
          totalRevenue: 0,
          inProcessOrders: 0,
          completedOrders: 0,
          stageCounter: new Map<string, number>(),
          visitRows: [],
        };
        metricsBySalesmanId.set(salesman.id, metric);
      }
      if (metric.salesmanName === metric.salesmanId && salesman.name) {
        metric.salesmanName = salesman.name;
      }
      return metric;
    };

    salesmanOptionsById.forEach((salesman) => ensureMetric(salesman));

    const o2dByDealKey = new Map<string, O2DStatus[]>();
    const upsertO2DByKey = (key: string | undefined, milestones: O2DStatus[]) => {
      if (!key) return;
      const existing = o2dByDealKey.get(key);
      if (!existing || milestones.length >= existing.length) {
        o2dByDealKey.set(key, milestones);
      }
    };

    o2dSnap.docs.forEach((doc) => {
      const row = doc.data() as RawDoc;
      const milestones = Array.isArray(row.milestones)
        ? dedupeO2DMilestones(row.milestones as O2DStatus[])
        : [];
      const dealId = asNonEmptyString(row.dealId);
      upsertO2DByKey(doc.id, milestones);
      upsertO2DByKey(dealId, milestones);
    });

    (walkinsSnap?.docs ?? []).forEach((doc) => {
      const walkin = doc.data() as RawDoc;
      const assignedOwnerType = normalizeText(walkin.assignedOwnerType);
      const hasSalesmanAssignment =
        Boolean(asNonEmptyString(walkin.salesmanId)) ||
        (assignedOwnerType === "salesman" && Boolean(asNonEmptyString(walkin.assignedOwnerId)));
      if (!hasSalesmanAssignment) return;

      const meetingDate =
        walkin.assignedAt ??
        walkin.createdAt ??
        walkin.lastUpdatedAt;
      if (!isWithinRange(meetingDate, fromMs, toMs)) return;
      if (shouldSkipWalkinMeeting(walkin)) return;

      const salesman = registerSalesman(
        walkin.salesmanId ?? (assignedOwnerType === "salesman" ? walkin.assignedOwnerId : undefined),
        walkin.salesmanName ?? walkin.handoverToName
      );
      if (!salesman) return;
      if (selectedSalesmanId && salesman.id !== selectedSalesmanId) return;

      const attended = isWalkinMeetingAttended(walkin);
      const metric = ensureMetric(salesman);
      metric.meetings += 1;
      if (attended) {
        metric.attendedMeetings += 1;
        const signals =
          attendedMeetingSignalsBySalesman.get(salesman.id) ?? newAttendedMeetingSignals();
        collectWalkinDealKeys(walkin).forEach((key) => signals.dealKeys.add(key));
        collectWalkinLeadKeys(walkin, doc.id).forEach((key) => signals.leadKeys.add(key));
        const customerSignals = collectWalkinCustomerSignals(walkin);
        customerSignals.names.forEach((name) => signals.customerNameKeys.add(name));
        customerSignals.phones.forEach((phone) => signals.customerPhoneKeys.add(phone));
        attendedMeetingSignalsBySalesman.set(salesman.id, signals);
      }

      const scheduledDate =
        toDateSafe(meetingDate)?.toISOString() ??
        new Date(0).toISOString();
      const customerName =
        asNonEmptyString(`${asNonEmptyString(walkin.firstName) ?? ""} ${asNonEmptyString(walkin.familyName) ?? ""}`.trim()) ??
        asNonEmptyString(walkin.customerName) ??
        asNonEmptyString(walkin.fullName) ??
        asNonEmptyString(walkin.name) ??
        asNonEmptyString(asRecord(walkin.customer).name) ??
        "Customer";
      const visitType =
        asNonEmptyString(walkin.leadType) ??
        asNonEmptyString(walkin.customerType) ??
        "Walk-in";
      const visitStatus =
        asNonEmptyString(walkin.status) ??
        (attended ? "Attended" : "Pending");
      const walkinId = asNonEmptyString(walkin.walkinId) ?? doc.id;
      const walkinDealSnapshot = asRecord(walkin.dealSnapshot);
      const walkinDealRef = asRecord(walkin.dealRef);
      const walkinCashsale = asRecord(walkin.cashsale);
      const visitDealId =
        asNonEmptyString(walkin.latestDealId) ??
        asNonEmptyString(walkin.dealId) ??
        asNonEmptyString(walkinDealSnapshot.dealId) ??
        asNonEmptyString(walkinDealRef.dealId) ??
        asNonEmptyString(walkinCashsale.dealId);
      const visitDealDocId =
        asNonEmptyString(walkin.latestDealDocId) ??
        asNonEmptyString(walkinDealSnapshot.dealDocId) ??
        asNonEmptyString(walkinDealRef.dealDocId);
      const outsideVisit = isOutsideVisitType(visitType);

      metric.visitRows.push({
        visitId: walkinId,
        customerName,
        scheduledDate,
        status: visitStatus,
        attended,
        visitType,
        dealId: visitDealId,
        dealDocId: visitDealDocId,
        converted: outsideVisit ? undefined : false,
      });
    });

    const inProcessOrders: MecaOrderProgressRow[] = [];
    const convertedOrders: MecaOrderProgressRow[] = [];
    ordersSnap.docs.forEach((doc) => {
      const order = { id: doc.id, ...(doc.data() as RawDoc) } as RawDoc;
      if (!isWithinRange(order.createdAt, fromMs, toMs)) return;

      const salesman = registerSalesman(order.representativeId, order.salesPerson);
      if (!salesman) return;
      if (selectedSalesmanId && salesman.id !== selectedSalesmanId) return;

      const metric = ensureMetric(salesman);
      metric.convertedOrders += 1;
      metric.totalRevenue += resolveOrderAmount(order);
      addKeysBySalesman(convertedOrderDealKeysBySalesman, salesman.id, collectOrderDealKeys(order));
      addKeysBySalesman(convertedOrderWalkinKeysBySalesman, salesman.id, collectOrderLeadKeys(order));
      const convertedFromMeeting = isOrderAttributedToMeeting(
        order,
        attendedMeetingSignalsBySalesman.get(salesman.id)
      );
      if (!convertedFromMeeting) metric.convertedOutsideMeetings += 1;

      const dealId = asNonEmptyString(order.dealId);
      const orderMilestones = dealId
        ? o2dByDealKey.get(dealId) ?? []
        : Array.isArray(order.o2dMilestones)
          ? dedupeO2DMilestones(order.o2dMilestones as O2DStatus[])
          : [];

      const progress = resolveOrderProgress(order, orderMilestones);
      const convertedOrderRow: MecaOrderProgressRow = {
        orderId: asNonEmptyString(order.id) ?? doc.id,
        orderNo:
          asNonEmptyString(order.crmOrderNo) ??
          asNonEmptyString(order.orderNo) ??
          asNonEmptyString(order.orderId) ??
          doc.id,
        dealId,
        walkinId: resolveOrderWalkinId(order),
        customerName: asNonEmptyString(order.customerName) ?? "Unknown",
        salesmanId: salesman.id,
        salesmanName: salesman.name,
        createdAt: toDateSafe(order.createdAt)?.toISOString() ?? new Date(0).toISOString(),
        totalAmount: resolveOrderAmount(order),
        status: progress.status,
        currentStep: progress.currentStep,
        conversionSource: convertedFromMeeting ? "meeting" : "outside",
      };
      convertedOrders.push(convertedOrderRow);

      if (progress.inProcess) {
        metric.inProcessOrders += 1;
        metric.stageCounter.set(
          progress.currentStep,
          (metric.stageCounter.get(progress.currentStep) ?? 0) + 1
        );
        inProcessOrders.push(convertedOrderRow);
      } else {
        metric.completedOrders += 1;
      }
    });

    metricsBySalesmanId.forEach((entry, salesmanId) => {
      const convertedDealKeys = convertedOrderDealKeysBySalesman.get(salesmanId) ?? new Set<string>();
      const convertedWalkinKeys = convertedOrderWalkinKeysBySalesman.get(salesmanId) ?? new Set<string>();
      let convertedFromWalkinMeetings = 0;

      entry.visitRows = entry.visitRows.map((visit) => {
        if (isOutsideVisitType(visit.visitType)) {
          return { ...visit, converted: undefined };
        }

        const visitKeys = [
          normalizeKey(visit.visitId),
          normalizeKey(visit.dealId),
          normalizeKey(visit.dealDocId),
        ].filter((key): key is string => Boolean(key));

        const convertedByOrder = visitKeys.some(
          (key) => convertedWalkinKeys.has(key) || convertedDealKeys.has(key)
        );
        const convertedByClosedStatus = isWalkinFollowUpClosedStatus(visit.status);
        const converted = convertedByOrder || convertedByClosedStatus;

        if (convertedByOrder) convertedFromWalkinMeetings += 1;
        return { ...visit, converted };
      });

      entry.convertedFromMeetings = convertedFromWalkinMeetings;
    });

    let salesmen = Array.from(metricsBySalesmanId.values());
    if (selectedSalesmanId) {
      salesmen = salesmen.filter((entry) => entry.salesmanId === selectedSalesmanId);
    }

    const salesmanMetrics: MecaSalesmanMetric[] = salesmen
      .map((entry) => {
        const conversionRatio =
          entry.convertedOrders > 0
            ? (entry.convertedFromMeetings / entry.convertedOrders) * 100
            : 0;
        const averageRupeeSale = entry.convertedOrders > 0 ? entry.totalRevenue / entry.convertedOrders : 0;
        const sortedVisits = [...entry.visitRows].sort(
          (a, b) => (b.scheduledDate > a.scheduledDate ? 1 : -1)
        );
        return {
          salesmanId: entry.salesmanId,
          salesmanName: entry.salesmanName,
          meetings: entry.meetings,
          attendedMeetings: entry.attendedMeetings,
          convertedOrders: entry.convertedOrders,
          convertedFromMeetings: entry.convertedFromMeetings,
          convertedOutsideMeetings: entry.convertedOutsideMeetings,
          conversionRatio,
          totalRevenue: entry.totalRevenue,
          averageRupeeSale,
          inProcessOrders: entry.inProcessOrders,
          completedOrders: entry.completedOrders,
          stageBreakdown: sortStageCounts(entry.stageCounter),
          visits: sortedVisits,
        };
      })
      .sort(
        (a, b) =>
          b.convertedOrders - a.convertedOrders ||
          b.totalRevenue - a.totalRevenue ||
          a.salesmanName.localeCompare(b.salesmanName)
      );

    const summary: MecaSummary = salesmanMetrics.reduce(
      (acc, row) => {
        acc.meetings += row.meetings;
        acc.attendedMeetings += row.attendedMeetings;
        acc.convertedOrders += row.convertedOrders;
        acc.convertedFromMeetings += row.convertedFromMeetings;
        acc.convertedOutsideMeetings += row.convertedOutsideMeetings;
        acc.totalRevenue += row.totalRevenue;
        acc.inProcessOrders += row.inProcessOrders;
        return acc;
      },
      {
        meetings: 0,
        attendedMeetings: 0,
        convertedOrders: 0,
        convertedFromMeetings: 0,
        convertedOutsideMeetings: 0,
        conversionRatio: 0,
        totalRevenue: 0,
        averageRupeeSale: 0,
        inProcessOrders: 0,
      } as MecaSummary
    );

    summary.conversionRatio =
      summary.convertedOrders > 0
        ? (summary.convertedFromMeetings / summary.convertedOrders) * 100
        : 0;
    summary.averageRupeeSale =
      summary.convertedOrders > 0 ? summary.totalRevenue / summary.convertedOrders : 0;

    const inProcessByStepMap = new Map<string, number>();
    inProcessOrders.forEach((row) => {
      inProcessByStepMap.set(row.currentStep, (inProcessByStepMap.get(row.currentStep) ?? 0) + 1);
    });

    const filteredInProcessOrders = selectedSalesmanId
      ? inProcessOrders.filter((row) => row.salesmanId === selectedSalesmanId)
      : inProcessOrders;
    const filteredConvertedOrders = selectedSalesmanId
      ? convertedOrders.filter((row) => row.salesmanId === selectedSalesmanId)
      : convertedOrders;
    filteredInProcessOrders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    filteredConvertedOrders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const sortedSalesmanOptions = Array.from(salesmanOptionsById.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return {
      generatedAt: new Date().toISOString(),
      salesmanOptions: sortedSalesmanOptions,
      salesmen: salesmanMetrics,
      summary,
      inProcessByStep: sortStageCounts(inProcessByStepMap),
      inProcessOrders: filteredInProcessOrders,
      convertedOrders: filteredConvertedOrders,
    };
  } catch (error) {
    console.error("Error loading MeCA data:", error);
    return { ...EMPTY_RESPONSE, generatedAt: new Date().toISOString() };
  }
}
