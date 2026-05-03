"use client";

import { useMemo } from "react";
import type { Order } from "@/lib/types";
import type {
  CreateJobDialogState,
  PmsCategory,
  PmsEmbellishmentRecord,
  PmsJob,
  PmsMachine,
  PmsNextDayPlanRow,
  PmsPerson,
  PmsPlan,
  PmsProduct,
  PmsRouting,
  PmsSkill,
  PmsVasOverride,
  PmsWorkingHours,
} from "../types/pms";
import {
  EMBELLISHMENT_HOURLY_CHARGE,
  compareOrderNo,
  explainNoPlan,
  hasEmbellishmentRoutingStep,
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
import { buildJobsFromRouting } from "@/lib/pms/routing";
import { buildCapacityMap } from "@/lib/pms/capacity";
import { scheduleJobs } from "@/lib/pms/scheduler";

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
  vasOverrides: PmsVasOverride[];
  createJobDialog: CreateJobDialogState;
  workingHours: PmsWorkingHours;
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
  vasOverrides,
  createJobDialog,
  workingHours,
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
    const overrideByRowKey = new Map(vasOverrides.map((override) => [override.id, override]));
    const activePmsOrderIds = new Set(
      jobs
        .filter((job) => String(job.status || "").toUpperCase() !== "DONE")
        .map((job) => String(job.orderId || "").trim())
        .filter(Boolean)
    );
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

    const previewGroupRows = new Map<
      string,
      Array<{
        key: string;
        orderId: string;
        orderNo: string;
        customer: string;
        customerPhone: string;
        vasName: string;
        qty: number;
        group: string;
        matchedProductId?: string;
        matchedProductName?: string;
        hasProductOverride: boolean;
        hasRouting: boolean;
        requiresEmbellishment: boolean;
        hasJobsForProduct: boolean;
        invoiceReady: boolean;
        orderPriority: number;
        priorityLabel: string;
        isEmergency: boolean;
        vasIndex: number;
        embellishment: any;
        routingSteps: PmsRouting[];
      }>
    >();

    const rows = orders
      .filter((order) => {
        if ((order.sections?.VAS?.items?.length || 0) <= 0) return false;
        return !isOrderClosedForPms(order) || activePmsOrderIds.has(order.id);
      })
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
          const override = overrideByRowKey.get(rowKey);
          const searchCandidates = [vasName, item.group, item.roomName, item.type].filter(
            Boolean
          ) as string[];
          const match = matchProductToVas(vasName, searchCandidates, products);
          const matchedProductId = override?.productId || match?.id;
          const matchedProductName =
            override?.productName ||
            products.find((product) => product.id === matchedProductId)?.name ||
            match?.name;
          const routingSteps = matchedProductId
            ? lookups.routingByProduct.get(matchedProductId) || []
            : [];
          const hasRouting = matchedProductId
            ? routingSteps.length > 0
            : false;
          const requiresEmbellishment = hasEmbellishmentRoutingStep(routingSteps);
          const groupKey = matchedProductId ? `${order.id}_${matchedProductId}` : `${order.id}_${vasName}`;
          const jobBucket = jobsByGroup.get(groupKey) || { sorted: [] };
          const status = jobBucket.inProgress?.status || jobBucket.nextJob?.status || "WAITING";
          const currentProcess =
            jobBucket.inProgress?.process || jobBucket.nextJob?.process || "Not scheduled";
          const stepNo = jobBucket.inProgress?.stepNo ?? jobBucket.nextJob?.stepNo;
          const plannedStart = jobBucket.nextPlan?.plannedStart;
          const plannedEnd = jobBucket.nextPlan?.plannedEnd;
          const hasJobsForProduct = matchedProductId
            ? jobs.some((job) => job.orderId === order.id && job.productId === matchedProductId)
            : false;
          const eta = hasJobsForProduct ? jobBucket.etaFromJobs || plannedEnd : undefined;
          const machineName = jobBucket.nextPlan?.machineId
            ? lookups.machineById.get(jobBucket.nextPlan.machineId)?.name
            : undefined;
          const personName = jobBucket.nextPlan?.personId
            ? lookups.personById.get(jobBucket.nextPlan.personId)?.name
            : undefined;
          const invoiceReady = isOrderInvoiced(order);
          const waitingJob = jobBucket.nextJob?.status === "WAITING" ? jobBucket.nextJob : undefined;
          const prevJob =
            waitingJob && waitingJob.stepNo !== undefined
              ? jobBucket.sorted.find((job) => job.stepNo === waitingJob.stepNo! - 1)
              : undefined;
          const noPlanReason =
            status === "WAITING" && !plannedStart
              ? explainNoPlan(
                  matchedProductId,
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

          const baseRow = {
            key: rowKey,
            orderId: order.id,
            orderNo: order.crmOrderNo || order.orderNo || order.id,
            customer: order.customerSnapshot?.name || order.customerName || "N/A",
            customerPhone: order.customerSnapshot?.phone || order.customerPhone || "",
            vasName,
            qty: item.qty ?? (item as any)?.quantity ?? 0,
            group: item.group || "",
            matchedProductId,
            matchedProductName,
            hasProductOverride: Boolean(override?.productId),
            hasRouting,
            requiresEmbellishment,
            hasJobsForProduct,
            invoiceReady,
            orderPriority,
            priorityLabel,
            isEmergency,
            vasIndex: index,
            embellishment: existingEmbellishment,
            routingSteps,
          };

          if (
            matchedProductId &&
            hasRouting &&
            !hasJobsForProduct &&
            (!requiresEmbellishment || existingEmbellishment?.enabled)
          ) {
            const previewGroupKey = `${order.id}_${matchedProductId}`;
            if (!previewGroupRows.has(previewGroupKey)) {
              previewGroupRows.set(previewGroupKey, []);
            }
            previewGroupRows.get(previewGroupKey)!.push(baseRow);
          }

          return [
            {
              ...baseRow,
              status,
              currentProcess: stepNo ? `${currentProcess} (Step ${stepNo})` : currentProcess,
              nextProcess: jobBucket.nextJob && jobBucket.inProgress ? jobBucket.nextJob.process : undefined,
              machineName: machineName || "-",
              personName: personName || "-",
              plannedStart,
              plannedEnd,
              eta,
              lastUpdate:
                jobBucket.inProgress?.updatedAt ||
                jobBucket.nextJob?.updatedAt ||
                (order as any).updatedAt ||
                order.createdAt,
              noPlanReason,
            },
          ];
        })
      );

    const previewPlansByGroup = new Map<
      string,
      {
        process?: string;
        machineName?: string;
        personName?: string;
        plannedStart?: string;
        plannedEnd?: string;
        eta?: string;
      }
    >();

    if (previewGroupRows.size > 0) {
      const previewJobs = Array.from(previewGroupRows.entries()).flatMap(([groupKey, groupRows]) => {
        const firstRow = groupRows[0];
        if (!firstRow?.matchedProductId) return [];
        const totalQty = groupRows.reduce((sum, row) => sum + (Number(row.qty) || 0), 0);
        return buildJobsFromRouting(
          firstRow.orderId,
          firstRow.matchedProductId,
          totalQty,
          firstRow.routingSteps,
          {
            priority: firstRow.orderPriority,
            embellishment: firstRow.embellishment?.enabled ? firstRow.embellishment : undefined,
          }
        ).map((job) => ({ ...job, __groupKey: groupKey }));
      });

      if (previewJobs.length > 0) {
        const previewCapacity = buildCapacityMap({
          machines: machines.filter((machine) => machine.active !== false).map((machine) => ({
            id: machine.id,
            process: machine.process,
            shiftMinutes: machine.shiftMinutes,
            active: machine.active,
          })),
          peopleIds: people.map((person) => person.id),
          skills: skills.map((skill) => ({
            machineId: skill.machineId,
            personId: skill.personId,
            allowed: skill.allowed,
          })),
          plans: plans
            .filter((plan) => plan.plannedStart && plan.plannedEnd)
            .map((plan) => ({
              machineId: plan.machineId,
              personId: plan.personId,
              plannedStart: plan.plannedStart as string,
              plannedEnd: plan.plannedEnd as string,
            })),
          downtimes: downtimes.map((down) => ({
            machineId: down.machineId,
            from: down.from,
            to: down.to,
          })),
          now: new Date().toISOString(),
        });

        const previewPriorityMap = Object.fromEntries(
          Array.from(previewGroupRows.values()).map((groupRows) => {
            const firstRow = groupRows[0];
            return [firstRow.orderId, firstRow.orderPriority];
          })
        );

        const { planned: previewPlans } = scheduleJobs({
          jobs: previewJobs.map((job) => ({
            id: job.id,
            orderId: job.orderId,
            jobGroupId: job.jobGroupId,
            productId: job.productId,
            stepNo: job.stepNo,
            process: job.process,
            requiredMinutes: job.requiredMinutes,
            status: job.status,
            priority: (job as any).priority,
          })),
          machines: machines.filter((machine) => machine.active !== false).map((machine) => ({
            id: machine.id,
            process: machine.process,
            shiftMinutes: machine.shiftMinutes,
            active: machine.active,
          })),
          skills: skills.map((skill) => ({
            machineId: skill.machineId,
            personId: skill.personId,
            process: skill.process,
            category: skill.category,
            allowed: skill.allowed,
          })),
          products: products.map((product) => ({
            id: product.id,
            category: product.category,
          })),
          capacityMap: previewCapacity,
          allowChain: true,
          orderPriorityMap: previewPriorityMap,
          now: new Date().toISOString(),
          workingHours,
          peopleById: Object.fromEntries(
            people.map((person) => [
              person.id,
              {
                active: person.active,
                leaveFrom: person.leaveFrom,
                leaveTo: person.leaveTo,
                leaveReason: person.leaveReason,
                weekOffDay: person.weekOffDay,
              },
            ])
          ),
        });

        const previewJobsById = new Map(previewJobs.map((job: any) => [job.id, job]));

        previewPlans.forEach((plan) => {
          const job = previewJobsById.get(plan.jobId) as any;
          const groupKey = String(job?.__groupKey || job?.jobGroupId || "");
          if (!groupKey) return;

          const machineName = lookups.machineById.get(plan.machineId)?.name || plan.machineId;
          const personName = lookups.personById.get(plan.personId)?.name || plan.personId;
          const current = previewPlansByGroup.get(groupKey);
          const currentStart = current?.plannedStart ? new Date(current.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;
          const nextStart = plan.plannedStart ? new Date(plan.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;

          if (!current || nextStart < currentStart) {
            previewPlansByGroup.set(groupKey, {
              process: job?.process,
              machineName,
              personName,
              plannedStart: plan.plannedStart,
              plannedEnd: plan.plannedEnd,
              eta: current?.eta,
            });
          }

          const existing = previewPlansByGroup.get(groupKey);
          const latestEta = existing?.eta ? new Date(existing.eta).getTime() : 0;
          const candidateEta = plan.plannedEnd ? new Date(plan.plannedEnd).getTime() : 0;
          previewPlansByGroup.set(groupKey, {
            process: existing?.process,
            machineName: existing?.machineName,
            personName: existing?.personName,
            plannedStart: existing?.plannedStart,
            plannedEnd: existing?.plannedEnd,
            eta:
              candidateEta >= latestEta && plan.plannedEnd
                ? plan.plannedEnd
                : existing?.eta,
          });
        });
      }
    }

    return rows.map((row: any) => {
      if (row.hasJobsForProduct || !row.matchedProductId || !row.hasRouting) {
        return row;
      }
      const preview = previewPlansByGroup.get(`${row.orderId}_${row.matchedProductId}`);
      if (!preview) return row;
      return {
        ...row,
        currentProcess: preview.process ? `${preview.process} (Preview)` : row.currentProcess,
        machineName: preview.machineName || row.machineName,
        personName: preview.personName || row.personName,
        plannedStart: preview.plannedStart || row.plannedStart,
        plannedEnd: preview.plannedEnd || row.plannedEnd,
        eta: preview.eta || row.eta,
        noPlanReason: "Preview queue",
      };
    });
  }, [downtimes, embellishmentRecords, jobs, machines, orders, people, plans, products, routing, skills, vasOverrides, workingHours]);

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
      if (left.orderPriority !== right.orderPriority) return left.orderPriority - right.orderPriority;
      const orderDiff = compareOrderNo(left.orderNo, right.orderNo);
      if (orderDiff !== 0) return orderDiff;
      const customerDiff = String(left.customer || "").localeCompare(String(right.customer || ""));
      if (customerDiff !== 0) return customerDiff;
      const productDiff = String(left.matchedProductName || left.vasName || "").localeCompare(
        String(right.matchedProductName || right.vasName || "")
      );
      if (productDiff !== 0) return productDiff;
      const statusRankDiff = (rank[left.status] ?? 99) - (rank[right.status] ?? 99);
      if (statusRankDiff !== 0) return statusRankDiff;
      const vasIndexDiff = Number(left.vasIndex ?? 0) - Number(right.vasIndex ?? 0);
      if (vasIndexDiff !== 0) return vasIndexDiff;
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

  const nextDayPlanRows = useMemo<PmsNextDayPlanRow[]>(() => {
    const lookups = buildLookups(orders, machines, people, products, routing, plans);
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const now = new Date();
    const todayKey = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    return plans
      .map((plan) => {
        const plannedStart = plan.plannedStart;
        if (!plannedStart) return null;
        const planDayKey = new Date(plannedStart).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        if (planDayKey < todayKey) return null;

        const job = jobsById.get(plan.jobId);
        if (!job) return null;
        const order = lookups.ordersById.get(job.orderId);
        const product = job.productId ? lookups.productById.get(job.productId) : undefined;
        const vasInfo = resolveVasInfo(order, product?.name);
        if (isPmsExcludedItem(product?.name, vasInfo.vasName, vasInfo.vasGroup)) return null;

        return {
          key: `${plan.id}-${plannedStart}`,
          planId: plan.id,
          orderNo: order?.crmOrderNo || order?.orderNo || order?.id || job.orderId,
          customer: order?.customerSnapshot?.name || order?.customerName || "N/A",
          vasName: vasInfo.vasName,
          process: job.process || "Not scheduled",
          personId: plan.personId || "",
          person: plan.personId ? lookups.personById.get(plan.personId)?.name || plan.personId : "TBD",
          machineId: plan.machineId || "",
          machine: plan.machineId ? lookups.machineById.get(plan.machineId)?.name || plan.machineId : "TBD",
          plannedStart,
          plannedEnd: plan.plannedEnd,
          qty: vasInfo.qty,
          dateKey: planDayKey,
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const leftTime = new Date(left!.plannedStart || 0).getTime();
        const rightTime = new Date(right!.plannedStart || 0).getTime();
        return leftTime - rightTime;
      }) as PmsNextDayPlanRow[];
  }, [jobs, machines, orders, people, plans, products, routing]);

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
          row.requiresEmbellishment ? "Additional VAS required" : "",
          row.embellishment?.enabled ? "Filled" : "",
          row.embellishment?.totalTime,
          row.embellishment?.chargeAmount,
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
    nextDayPlanRows,
    filteredEmbellishmentRows,
  };
};
