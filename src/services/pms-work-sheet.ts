import "server-only";

import { format } from "date-fns";
import { adminDb } from "@/lib/firebase-admin";

const canonicalHeader = [
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

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "dd MMM, HH:mm");
};

const normalizeText = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase();

const isOrderInvoiced = (order?: any) => {
  if (!order) return false;
  const status = order.invoicing?.status;
  const invoices = order.invoicing?.invoices || [];
  if (status && status !== "NOT_INVOICED") return true;
  return Array.isArray(invoices) && invoices.length > 0;
};

const resolveVasInfo = (order?: any, productName?: string) => {
  const items = (order?.sections as any)?.VAS?.items || [];
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
    const candidates = [
      item.description,
      item.group,
      item.roomName,
      item.type,
    ].filter(Boolean) as string[];
    return candidates.some((candidate) => {
      const left = normalizeText(candidate);
      return left === productKey || left.includes(productKey) || productKey.includes(left);
    });
  });
  const matched = fuzzyMatch || items[0] || {};
  return {
    vasName: matched.description || matched.group || productName,
    vasGroup: matched.group || "-",
    qty: matched.qty ?? matched.quantity ?? 0,
  };
};

const chunkArray = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const compareOrderNo = (left: string, right: string) => {
  const leftNum = Number(left);
  const rightNum = Number(right);
  const leftIsNum = Number.isFinite(leftNum);
  const rightIsNum = Number.isFinite(rightNum);
  if (leftIsNum && rightIsNum) return leftNum - rightNum;
  return String(left).localeCompare(String(right));
};

export async function buildPmsWorkSheetRowsFromDb() {
  const jobsSnapshot = await adminDb.collection("jobs").get();
  const jobs = jobsSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
  const activeJobs = jobs.filter((job) => job.status !== "DONE");

  if (activeJobs.length === 0) {
    return [canonicalHeader];
  }

  const [
    plansSnapshot,
    peopleSnapshot,
    machinesSnapshot,
    productsSnapshot,
    routingSnapshot,
  ] = await Promise.all([
    adminDb.collection("plan").get(),
    adminDb.collection("people").get(),
    adminDb.collection("machines").get(),
    adminDb.collection("products").get(),
    adminDb.collection("routing").get(),
  ]);

  const plans = plansSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
  const people = peopleSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
  const machines = machinesSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
  const products = productsSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
  const routing = routingSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));

  const orderIds = Array.from(
    new Set(activeJobs.map((job) => job.orderId).filter(Boolean))
  ) as string[];

  const ordersById = new Map<string, any>();
  if (orderIds.length > 0) {
    const orderRefs = orderIds.map((id) => adminDb.collection("orders").doc(id));
    for (const batch of chunkArray(orderRefs, 500)) {
      const docs = await adminDb.getAll(...batch);
      docs.forEach((doc) => {
        if (doc.exists) ordersById.set(doc.id, doc.data());
      });
    }
  }

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const machineById = new Map(machines.map((machine) => [machine.id, machine]));
  const productById = new Map(products.map((product) => [product.id, product]));

  const routingByProduct = new Map<string, any[]>();
  routing.forEach((step) => {
    if (!routingByProduct.has(step.productId)) routingByProduct.set(step.productId, []);
    routingByProduct.get(step.productId)!.push(step);
  });
  routingByProduct.forEach((steps, key) => {
    routingByProduct.set(
      key,
      [...steps].sort((a, b) => (a.stepNo || 0) - (b.stepNo || 0))
    );
  });

  const planByJob = new Map<string, any>();
  plans.forEach((plan) => {
    const existing = planByJob.get(plan.jobId);
    if (!existing) {
      planByJob.set(plan.jobId, plan);
      return;
    }
    const existingTime = new Date(existing.plannedEnd || existing.plannedStart || 0).getTime();
    const nextTime = new Date(plan.plannedEnd || plan.plannedStart || 0).getTime();
    if (nextTime >= existingTime) {
      planByJob.set(plan.jobId, plan);
    }
  });

  const rows = activeJobs
    .map((job) => {
      const order = ordersById.get(job.orderId);
      if (!isOrderInvoiced(order)) return null;
      const product = job.productId ? productById.get(job.productId) : undefined;
      const routingSteps = job.productId ? routingByProduct.get(job.productId) || [] : [];
      const currentStep =
        routingSteps.find((step) => step.stepNo === job.stepNo) || routingSteps[0];
      const nextStep = currentStep
        ? routingSteps.find((step) => step.stepNo === currentStep.stepNo + 1)
        : undefined;
      const plan = planByJob.get(job.id);
      const vasInfo = resolveVasInfo(order, product?.name);
      const processName = job.process || currentStep?.process || "Not scheduled";
      const processLabel = job.stepNo ? `${processName} (Step ${job.stepNo})` : processName;
      const nextLabel = nextStep?.process ? `${nextStep.process} (Step ${nextStep.stepNo})` : "-";

      return {
        orderNo: order?.crmOrderNo || order?.orderNo || order?.id || job.orderId,
        customer: order?.customerSnapshot?.name || order?.customerName || "N/A",
        vasName: vasInfo.vasName,
        qty: vasInfo.qty,
        productName: product?.name || job.productId || "Unknown product",
        status: job.status || "WAITING",
        nextProcess: nextLabel,
        machine: plan?.machineId ? machineById.get(plan.machineId)?.name : undefined,
        person: plan?.personId ? peopleById.get(plan.personId)?.name : undefined,
        process: processLabel,
        plannedStart: job.plannedStart || plan?.plannedStart,
        plannedEnd: job.plannedEnd || plan?.plannedEnd,
        stepNo: job.stepNo ?? currentStep?.stepNo,
      };
    })
    .filter(Boolean) as Array<{
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
  }>;

  rows.sort((a, b) => {
    const orderCompare = compareOrderNo(a.orderNo, b.orderNo);
    if (orderCompare !== 0) return orderCompare;
    const productCompare = a.productName.localeCompare(b.productName);
    if (productCompare !== 0) return productCompare;
    const vasCompare = a.vasName.localeCompare(b.vasName);
    if (vasCompare !== 0) return vasCompare;
    const stepA = a.stepNo ?? Number.MAX_SAFE_INTEGER;
    const stepB = b.stepNo ?? Number.MAX_SAFE_INTEGER;
    if (stepA !== stepB) return stepA - stepB;
    return (
      new Date(a.plannedStart || 0).getTime() - new Date(b.plannedStart || 0).getTime()
    );
  });

  const values = rows.map((row) => [
    row.orderNo,
    row.customer,
    row.vasName,
    row.qty,
    row.productName,
    row.status,
    row.nextProcess || "-",
    row.machine || "TBD",
    row.person || "TBD",
    row.process,
    formatDateTime(row.plannedStart),
    formatDateTime(row.plannedEnd),
  ]);

  return [canonicalHeader, ...values];
}
