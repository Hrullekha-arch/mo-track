"use client";

import { useMemo } from "react";
import type { Order } from "@/lib/types";
import type {
  CreateJobDialogState,
  PmsCategory,
  PmsEmbellishmentRecord,
  PmsJob,
  PmsMachine,
  PmsPerson,
  PmsPlan,
  PmsProduct,
  PmsRouting,
  PmsSkill,
} from "../types/pms";
import {
  EMBELLISHMENT_HOURLY_CHARGE,
  explainNoPlan,
  isOrderClosedForPms,
  isOrderInvoiced,
  matchProductToVas,
  normalizeText,
  resolveVasInfo,
  roundToTwoDecimals,
  toNumber,
} from "../utils/pmsHelpers";
import { isPmsExcludedItem } from "@/lib/pms/filters";
import { buildLookups } from "../utils/pmsHelpers";

type Params = {
  products: PmsProduct[];
  pmsCategories: PmsCategory[];
  routing: PmsRouting[];
  machines: PmsMachine[];
  people: PmsPerson[];
  skills: PmsSkill[];
  downtimes: any[];
  orders: Order[];
  jobs: PmsJob[];
  plans: PmsPlan[];
  embellishmentRecords: PmsEmbellishmentRecord[];
  createJobDialog: CreateJobDialogState;
  productSearch: string;
  machineSearch: string;
  personSearch: string;
  showInactiveMachines: boolean;
  vasSearch: string;
  embellishmentSearch: string;
};

const matchesPmsSearch = (search: string, values: unknown[]) => {
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

export const usePmsLiveData = ({
  products,
  pmsCategories,
  routing,
  machines,
  people,
  skills,
  downtimes,
  orders,
  jobs,
  plans,
  embellishmentRecords,
  createJobDialog,
  productSearch,
  machineSearch,
  personSearch,
  showInactiveMachines,
  vasSearch,
  embellishmentSearch,
}: Params) => {
  const categories = useMemo(
    () =>
      Array.from(
        new Set([
          ...products.map((product) => product.category).filter(Boolean),
          ...pmsCategories.map((category) => category.name).filter(Boolean),
        ])
      ).sort((left, right) => left.localeCompare(right)),
    [pmsCategories, products]
  );

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          product.category.toLowerCase().includes(productSearch.toLowerCase())
      ),
    [products, productSearch]
  );

  const filteredMachines = useMemo(
    () =>
      machines.filter(
        (machine) =>
          (machine.name.toLowerCase().includes(machineSearch.toLowerCase()) ||
            machine.process.toLowerCase().includes(machineSearch.toLowerCase())) &&
          (showInactiveMachines || machine.active)
      ),
    [machineSearch, machines, showInactiveMachines]
  );

  const filteredPeople = useMemo(
    () =>
      people.filter(
        (person) =>
          person.name.toLowerCase().includes(personSearch.toLowerCase()) ||
          (person.role?.toLowerCase() || "").includes(personSearch.toLowerCase())
      ),
    [people, personSearch]
  );

  const stats = useMemo(() => {
    const activeMachines = machines.filter((machine) => machine.active).length;
    const totalCapacity = machines
      .filter((machine) => machine.active)
      .reduce((sum, machine) => sum + machine.shiftMinutes, 0);
    return {
      products: products.length,
      activeMachines,
      totalMachines: machines.length,
      people: people.length,
      totalCapacity,
      downtimeEvents: downtimes.length,
    };
  }, [downtimes.length, machines, people.length, products.length]);

  const createJobTotals = useMemo(() => {
    const panels = toNumber(createJobDialog.form.numberOfPanels);
    const stitchingPerPanel = toNumber(createJobDialog.form.stitchingPerPanel);
    const designTime = toNumber(createJobDialog.form.designTime);
    const handWorkTime = toNumber(createJobDialog.form.handWorkTime);
    const hourlyCharge =
      toNumber(createJobDialog.form.hourlyCharge) || EMBELLISHMENT_HOURLY_CHARGE;
    const totalMinutes = panels * stitchingPerPanel + designTime + handWorkTime;
    const totalHours = roundToTwoDecimals(totalMinutes / 60);
    const chargeAmount = roundToTwoDecimals(totalHours * hourlyCharge);
    return {
      totalMinutes: roundToTwoDecimals(totalMinutes),
      totalHours,
      hourlyCharge,
      chargeAmount,
    };
  }, [createJobDialog.form]);

  const liveVasRowsAll = useMemo(() => {
    const lookups = buildLookups(orders, machines, people, products, routing, plans);
    const embellishmentByRowKey = new Map(embellishmentRecords.map((record) => [record.id, record]));
    const jobsByGroup = new Map<
      string,
      { sorted: PmsJob[]; nextJob?: PmsJob; inProgress?: PmsJob; nextPlan?: PmsPlan; etaFromJobs?: string }
    >();

    jobs.forEach((job) => {
      if (!job.orderId) return;
      const groupKey = job.jobGroupId || (job.productId ? `${job.orderId}_${job.productId}` : job.orderId);
      if (!jobsByGroup.has(groupKey)) {
        jobsByGroup.set(groupKey, { sorted: [] });
      }
      jobsByGroup.get(groupKey)!.sorted.push(job);
    });

    jobsByGroup.forEach((bucket) => {
      bucket.sorted.sort((left, right) => (left.stepNo || 0) - (right.stepNo || 0));
      bucket.inProgress = bucket.sorted.find((job) => job.status === "IN_PROGRESS");
      bucket.nextJob =
        bucket.sorted.find((job) => job.status === "PLANNED") ||
        bucket.sorted.find((job) => job.status === "WAITING");
      bucket.nextPlan = bucket.nextJob ? lookups.planByJob.get(bucket.nextJob.id) : undefined;
      const lastTimedJob = [...bucket.sorted]
        .reverse()
        .find((job) => job.plannedEnd || job.actualEnd || job.updatedAt);
      bucket.etaFromJobs =
        lastTimedJob?.plannedEnd || lastTimedJob?.actualEnd || lastTimedJob?.updatedAt;
    });

    const rows = orders
      .filter((order) => (order.sections?.VAS?.items?.length || 0) > 0 && !isOrderClosedForPms(order))
      .flatMap((order) =>
        (order.sections?.VAS?.items || []).flatMap((item, index) => {
          const vasName = item.description || item.group || "VAS";
          const exclusionCandidates = [vasName, item.group, item.roomName, item.type];
          if (isPmsExcludedItem(...exclusionCandidates)) return [];

          const rowKey = `${order.id}-vas-${index}`;
          const existingEmbellishment =
            embellishmentByRowKey.get(rowKey) ||
            (item as any)?.meta?.embellishment ||
            (item as any)?.embellishment;
          const searchCandidates = [vasName, item.group, item.roomName, item.type].filter(
            Boolean
          ) as string[];
          const match = matchProductToVas(vasName, searchCandidates, products);
          const matchedProductId = match?.id;
          const hasRouting = matchedProductId
            ? (lookups.routingByProduct.get(matchedProductId) || []).length > 0
            : false;
          const groupKey = matchedProductId ? `${order.id}_${matchedProductId}` : `${order.id}_${vasName}`;
          const jobBucket = jobsByGroup.get(groupKey) || { sorted: [] };
          const status = jobBucket.inProgress?.status || jobBucket.nextJob?.status || "WAITING";
          const currentProcess =
            jobBucket.inProgress?.process || jobBucket.nextJob?.process || "Not scheduled";
          const stepNo = jobBucket.inProgress?.stepNo ?? jobBucket.nextJob?.stepNo;
          const plannedStart = jobBucket.nextPlan?.plannedStart;
          const plannedEnd = jobBucket.nextPlan?.plannedEnd;
          const eta = (order as any)?.pmsEta || jobBucket.etaFromJobs || plannedEnd;
          const machineName = jobBucket.nextPlan?.machineId
            ? lookups.machineById.get(jobBucket.nextPlan.machineId)?.name
            : undefined;
          const personName = jobBucket.nextPlan?.personId
            ? lookups.personById.get(jobBucket.nextPlan.personId)?.name
            : undefined;
          const invoiceReady = isOrderInvoiced(order);
          const hasJobsForProduct = match
            ? jobs.some((job) => job.orderId === order.id && job.productId === match.id)
            : false;
          const waitingJob = jobBucket.nextJob?.status === "WAITING" ? jobBucket.nextJob : undefined;
          const prevJob =
            waitingJob && waitingJob.stepNo !== undefined
              ? jobBucket.sorted.find((job) => job.stepNo === waitingJob.stepNo! - 1)
              : undefined;
          const noPlanReason =
            status === "WAITING" && !plannedStart
              ? explainNoPlan(
                  match?.id,
                  hasJobsForProduct,
                  waitingJob,
                  prevJob,
                  invoiceReady,
                  lookups,
                  machines,
                  skills
                )
              : "";
          const rawPriority = Number((order as any)?.priority);
          const orderPriority = Number.isFinite(rawPriority) ? rawPriority : 500;
          const isEmergency = orderPriority <= -100;
          const priorityLabel = isEmergency
            ? "Emergency"
            : orderPriority <= 0
            ? "High"
            : orderPriority <= 500
            ? "Normal"
            : "Low";

          return [
            {
              key: rowKey,
              orderId: order.id,
              orderNo: order.crmOrderNo || order.orderNo || order.id,
              customer: order.customerSnapshot?.name || order.customerName || "N/A",
              customerPhone: order.customerSnapshot?.phone || order.customerPhone || "",
              vasName,
              qty: item.qty ?? (item as any)?.quantity ?? 0,
              group: item.group || "",
              status,
              currentProcess: stepNo ? `${currentProcess} (Step ${stepNo})` : currentProcess,
              nextProcess: jobBucket.nextJob && jobBucket.inProgress ? jobBucket.nextJob.process : undefined,
              machineName: machineName || "TBD",
              personName: personName || "TBD",
              plannedStart,
              plannedEnd,
              eta,
              lastUpdate:
                jobBucket.inProgress?.updatedAt ||
                jobBucket.nextJob?.updatedAt ||
                (order as any).updatedAt ||
                order.createdAt,
              matchedProductId: match?.id,
              matchedProductName: match?.name,
              hasRouting,
              hasJobsForProduct,
              noPlanReason,
              invoiceReady,
              orderPriority,
              priorityLabel,
              isEmergency,
              vasIndex: index,
              embellishment: existingEmbellishment,
            },
          ];
        })
      );

    return rows;
  }, [embellishmentRecords, jobs, machines, orders, people, plans, products, routing, skills]);

  const liveVasRows = useMemo(() => {
    const filtered = liveVasRowsAll.filter((row) =>
      matchesPmsSearch(vasSearch, [
        row.orderNo,
        row.customer,
        row.customerPhone,
        row.vasName,
        row.group,
        row.machineName,
        row.personName,
        row.matchedProductName,
        row.currentProcess,
        row.nextProcess,
        row.status,
        row.embellishment?.embellishmentBarcode,
        row.embellishment?.customerPhone,
        row.embellishment?.customerName,
      ])
    );

    const rank: Record<string, number> = { IN_PROGRESS: 0, PLANNED: 1, WAITING: 2, DONE: 3 };
    return [...filtered].sort((left, right) => {
      const statusRankDiff = (rank[left.status] ?? 99) - (rank[right.status] ?? 99);
      if (statusRankDiff !== 0) return statusRankDiff;
      if (left.orderPriority !== right.orderPriority) return left.orderPriority - right.orderPriority;
      const leftTime = left.plannedStart ? new Date(left.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.plannedStart ? new Date(right.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });
  }, [liveVasRowsAll, vasSearch]);

  const routingNotEnteredItems = useMemo(() => {
    const itemsByProduct = new Map<
      string,
      {
        productId: string;
        productName: string;
        orderNo: string;
        customer: string;
        vasName: string;
      }
    >();

    liveVasRowsAll.forEach((row) => {
      if (!row.matchedProductId || row.hasRouting) return;
      if (itemsByProduct.has(row.matchedProductId)) return;
      itemsByProduct.set(row.matchedProductId, {
        productId: row.matchedProductId,
        productName: row.matchedProductName || row.vasName,
        orderNo: row.orderNo,
        customer: row.customer,
        vasName: row.vasName,
      });
    });

    return Array.from(itemsByProduct.values()).sort((left, right) =>
      left.productName.localeCompare(right.productName)
    );
  }, [liveVasRowsAll]);

  const liveStats = useMemo(() => {
    const totalItems = liveVasRows.length;
    const inProgress = liveVasRows.filter((row) => row.status === "IN_PROGRESS").length;
    const planned = liveVasRows.filter((row) => row.status === "PLANNED").length;
    const waiting = liveVasRows.filter((row) => row.status === "WAITING").length;
    const done = liveVasRows.filter((row) => row.status === "DONE").length;
    const emergency = liveVasRows.filter((row) => row.isEmergency).length;
    return { totalItems, inProgress, planned, waiting, done, emergency };
  }, [liveVasRows]);

  const filteredEmbellishmentRows = useMemo(
    () =>
      liveVasRows.filter((row) =>
        matchesPmsSearch(embellishmentSearch, [
          row.orderNo,
          row.customer,
          row.vasName,
          row.group,
          row.matchedProductName,
          row.status,
          row.embellishment?.embellishmentBarcode,
          row.embellishment?.customerName,
          row.embellishment?.customerPhone,
        ])
      ),
    [embellishmentSearch, liveVasRows]
  );

  return {
    categories,
    filteredProducts,
    filteredMachines,
    filteredPeople,
    stats,
    createJobTotals,
    isOrderInvoiced,
    isOrderClosedForPms,
    resolveVasInfo,
    liveVasRowsAll,
    liveVasRows,
    routingNotEnteredItems,
    liveStats,
    filteredEmbellishmentRows,
  };
};
