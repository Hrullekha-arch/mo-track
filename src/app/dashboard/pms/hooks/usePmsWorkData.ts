"use client";

import { useMemo } from "react";
import type { Order } from "@/lib/types";
import type {
  PmsEmbellishmentRecord,
  PmsJob,
  PmsMachine,
  PmsPerson,
  PmsPlan,
  PmsProduct,
  PmsRouting,
} from "../types/pms";
import {
  buildLookups,
  compareOrderNo,
  getDisplayCustomerName,
  getDisplaySmName,
  normalizeText,
  resolveVasInfo,
} from "../utils/pmsHelpers";
import { isPmsExcludedItem } from "@/lib/pms/filters";
import { isManualCompletionProcess } from "@/lib/pms/process-rules";

type Params = {
  jobs: PmsJob[];
  orders: Order[];
  people: PmsPerson[];
  machines: PmsMachine[];
  products: PmsProduct[];
  routing: PmsRouting[];
  plans: PmsPlan[];
  embellishmentRecords: PmsEmbellishmentRecord[];
  workDetailSearch: string;
  statusSearch: string;
  statusQuickFilter: string;
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

export const usePmsWorkData = ({
  jobs,
  orders,
  people,
  machines,
  products,
  routing,
  plans,
  embellishmentRecords,
  workDetailSearch,
  statusSearch,
  statusQuickFilter,
}: Params) => {
  const matchesStatusQuickFilter = (row: any) => {
    switch (statusQuickFilter) {
      case "pending":
        return row.stage === "Pending";
      case "machineRunning":
        return row.stage === "Machine Running";
      case "qcPending":
        return Boolean(row.qcPending);
      case "dispatchReady":
        return Boolean(row.dispatchReady);
      case "completed":
        return row.stage === "Completed";
      case "embellishment":
        return Boolean(row.embellishment?.enabled);
      default:
        return true;
    }
  };

  const workDetailRows = useMemo(() => {
    const nowMs = Date.now();
    const lookups = buildLookups(orders, machines, people, products, routing, plans);
    const embellishmentByOrderProduct = new Map<string, PmsEmbellishmentRecord>();

    embellishmentRecords.forEach((record) => {
      const key = `${record.orderId || ""}__${record.productId || ""}`;
      if (!record.orderId || !record.productId || embellishmentByOrderProduct.has(key)) return;
      embellishmentByOrderProduct.set(key, record);
    });

    const activeAssignments = jobs
      .map((job) => {
        const status = String(job.status || "").toUpperCase();
        if (status !== "IN_PROGRESS" && status !== "PLANNED") return null;
        const plan = lookups.planByJob.get(job.id);
        if (!plan?.plannedStart || !plan?.plannedEnd) return null;
        const startMs = new Date(plan.plannedStart).getTime();
        const endMs = new Date(plan.plannedEnd).getTime();
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
        const order = lookups.ordersById.get(job.orderId);
        return {
          jobId: job.id,
          orderId: job.orderId,
          orderNo: order?.crmOrderNo || order?.orderNo || order?.id || job.orderId,
          status,
          machineId: plan.machineId,
          personId: plan.personId,
          plannedStart: plan.plannedStart,
          plannedEnd: plan.plannedEnd,
          startMs,
          endMs,
        };
      })
      .filter(Boolean) as Array<{
      jobId: string;
      orderId: string;
      orderNo: string;
      status: "IN_PROGRESS" | "PLANNED";
      machineId?: string;
      personId?: string;
      plannedStart: string;
      plannedEnd: string;
      startMs: number;
      endMs: number;
    }>;

    const jobsByGroup = new Map<string, PmsJob[]>();
    jobs.forEach((job) => {
      if (!job.orderId) return;
      const groupKey = job.jobGroupId || (job.productId ? `${job.orderId}_${job.productId}` : job.orderId);
      if (!jobsByGroup.has(groupKey)) jobsByGroup.set(groupKey, []);
      jobsByGroup.get(groupKey)!.push(job);
    });

    const rows = Array.from(jobsByGroup.entries())
      .map(([groupKey, groupJobs]) => {
        if (!groupJobs.length) return null;
        const sortedJobs = [...groupJobs].sort((a, b) => (a.stepNo || 0) - (b.stepNo || 0));
        const hasActive = sortedJobs.some((job) => job.status !== "DONE");
        if (!hasActive) return null;

        const currentJob =
          sortedJobs.find((job) => job.status === "IN_PROGRESS") ||
          sortedJobs.find((job) => job.status === "PLANNED") ||
          sortedJobs.find((job) => job.status === "WAITING") ||
          sortedJobs[0];
        if (!currentJob) return null;

        const order = lookups.ordersById.get(currentJob.orderId);
        if (!order) return null;
        const product = currentJob.productId ? lookups.productById.get(currentJob.productId) : undefined;
        const routingSteps = currentJob.productId ? lookups.routingByProduct.get(currentJob.productId) || [] : [];

        const stepPlanMap = new Map<
          number,
          {
            plannedStart?: string;
            plannedEnd?: string;
            actualStart?: string;
            actualEnd?: string;
            status?: string;
            machineName?: string;
            personName?: string;
          }
        >();

        sortedJobs.forEach((groupJob) => {
          if (groupJob.stepNo === undefined || groupJob.stepNo === null) return;
          const plan = lookups.planByJob.get(groupJob.id);
          const hasActivePlan =
            String(groupJob.status || "").toUpperCase() === "PLANNED" ||
            String(groupJob.status || "").toUpperCase() === "IN_PROGRESS";
          const machineName = plan?.machineId
            ? lookups.machineById.get(plan.machineId)?.name || plan.machineId
            : undefined;
          const personName = plan?.personId
            ? lookups.personById.get(plan.personId)?.name || plan.personId
            : undefined;
          stepPlanMap.set(groupJob.stepNo, {
            plannedStart: hasActivePlan ? groupJob.plannedStart ?? plan?.plannedStart : undefined,
            plannedEnd: hasActivePlan ? groupJob.plannedEnd ?? plan?.plannedEnd : undefined,
            actualStart: groupJob.actualStart,
            actualEnd: groupJob.actualEnd,
            status: groupJob.status,
            machineName: machineName,
            personName: personName,
          });
        });

        const currentStepNo = currentJob.stepNo ?? routingSteps[0]?.stepNo;
        const currentStep = routingSteps.find((step) => step.stepNo === currentStepNo) || routingSteps[0];
        const nextStep = currentStep
          ? routingSteps.find((step) => step.stepNo === currentStep.stepNo + 1)
          : undefined;
        const maxStepNo = routingSteps.reduce((max, step) => Math.max(max, Number(step?.stepNo || 0)), 0);
        const isFinalStep = Boolean(currentStepNo && maxStepNo && Number(currentStepNo) >= maxStepNo);
        const firstStepNo = routingSteps.length > 0 ? routingSteps[0].stepNo : undefined;
        const isFirstStep = currentStepNo !== undefined && firstStepNo !== undefined && currentStepNo === firstStepNo;
        const isManualStep = isManualCompletionProcess(currentJob.process || currentStep?.process || "");
        const currentPlan = currentStep ? stepPlanMap.get(currentStep.stepNo) : undefined;
        const nextPlan = nextStep ? stepPlanMap.get(nextStep.stepNo) : undefined;
        const machine = currentPlan?.machineName;
        const person = currentPlan?.personName;
        const currentPlanDoc = lookups.planByJob.get(currentJob.id);
        const currentMachineId = currentPlanDoc?.machineId;
        const currentPersonId = currentPlanDoc?.personId;
        const vasInfo = resolveVasInfo(order, product?.name);
        if (isPmsExcludedItem(product?.name, vasInfo.vasName, vasInfo.vasGroup)) return null;

        const embellishmentRecord = embellishmentByOrderProduct.get(
          `${currentJob.orderId || ""}__${currentJob.productId || ""}`
        );
        const customerName = getDisplayCustomerName(order, embellishmentRecord?.customerName);
        const smName = getDisplaySmName(order);
        const resetJobs = sortedJobs.filter((job) => job.status === "PLANNED" || job.status === "WAITING");
        const resetJobIds = resetJobs.map((job) => job.id).filter(Boolean);
        const resetPlanDocIds = resetJobIds.flatMap((jobId) => lookups.planDocIdsByJob.get(jobId) || []);
        let blockedByLabel: string | undefined;

        if (
          String(currentJob.status || "").toUpperCase() === "PLANNED" &&
          currentPlanDoc?.plannedStart &&
          (currentMachineId || currentPersonId)
        ) {
          const rowStartMs = new Date(currentPlanDoc.plannedStart).getTime();
          if (Number.isFinite(rowStartMs)) {
            const relatedAssignments = activeAssignments.filter((assignment) => {
              if (assignment.jobId === currentJob.id) return false;
              const sameMachine = Boolean(currentMachineId) && assignment.machineId === currentMachineId;
              const samePerson = Boolean(currentPersonId) && assignment.personId === currentPersonId;
              return sameMachine || samePerson;
            });
            const ongoingNow = relatedAssignments
              .filter(
                (assignment) =>
                  assignment.startMs <= nowMs &&
                  assignment.endMs >= nowMs &&
                  assignment.endMs <= rowStartMs
              )
              .sort((a, b) => b.endMs - a.endMs)[0];
            if (ongoingNow) {
              blockedByLabel = `Blocked by ${ongoingNow.orderNo} (${ongoingNow.status}) till ${ongoingNow.plannedEnd}`;
            }
          }
        }

        return {
          key: groupKey,
          currentJobId: currentJob.id,
          orderNo: order?.crmOrderNo || order?.orderNo || order?.id || currentJob.orderId,
          orderId: currentJob.orderId,
          customer: customerName,
          smName,
          vasName: vasInfo.vasName,
          vasGroup: vasInfo.vasGroup,
          qty: vasInfo.qty,
          process: currentJob.process || currentStep?.process || "Not scheduled",
          machine,
          person,
          plannedStart: currentPlan?.plannedStart ?? currentJob.plannedStart,
          plannedEnd: currentPlan?.plannedEnd ?? currentJob.plannedEnd,
          status: currentJob.status || "WAITING",
          routingSteps,
          currentStepNo,
          isFinalStep,
          isFirstStep,
          isManualStep,
          totalSteps: maxStepNo,
          productName: product?.name || currentJob.productId || "Unknown product",
          stepPlanMap,
          nextProcess: nextStep?.process,
          nextPlannedStart: nextPlan?.plannedStart,
          nextPlannedEnd: nextPlan?.plannedEnd,
          nextMachine: nextPlan?.machineName,
          nextPerson: nextPlan?.personName,
          resetJobIds,
          resetPlanDocIds,
          blockedByLabel,
          embellishment: embellishmentRecord,
        };
      })
      .filter(Boolean) as any[];

    const statusRank: Record<string, number> = { IN_PROGRESS: 0, PLANNED: 1, WAITING: 2, DONE: 3 };
    return rows.sort((a, b) => {
      const rankDiff = (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      const aTime = a.plannedStart ? new Date(a.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.plannedStart ? new Date(b.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [embellishmentRecords, jobs, machines, orders, people, plans, products, routing]);

  const workSheetStepRows = useMemo(() => {
    const lookups = buildLookups(orders, machines, people, products, routing, plans);
    const rows = jobs
      .map((job) => {
        const order = lookups.ordersById.get(job.orderId);
        if (!order) return null;
        const product = job.productId ? lookups.productById.get(job.productId) : undefined;
        const routingSteps = job.productId ? lookups.routingByProduct.get(job.productId) || [] : [];
        const currentStep = routingSteps.find((step) => step.stepNo === job.stepNo) || routingSteps[0];
        const nextStep = currentStep
          ? routingSteps.find((step) => step.stepNo === currentStep.stepNo + 1)
          : undefined;
        const plan = lookups.planByJob.get(job.id);
        const vasInfo = resolveVasInfo(order, product?.name);
        if (isPmsExcludedItem(product?.name, vasInfo.vasName, vasInfo.vasGroup)) return null;
        const processName = job.process || currentStep?.process || "Not scheduled";
        const processLabel = job.stepNo ? `${processName} (Step ${job.stepNo})` : processName;
        const nextLabel = nextStep?.process ? `${nextStep.process} (Step ${nextStep.stepNo})` : "-";
        const embellishment = embellishmentRecords.find(
          (record) =>
            record.orderId === job.orderId &&
            record.productId === job.productId &&
            record.enabled
        );

        return {
          key: `${job.id}-${job.stepNo || 0}`,
          orderNo: order?.crmOrderNo || order?.orderNo || order?.id || job.orderId,
          customer: order?.customerSnapshot?.name || order?.customerName || "N/A",
          vasName: vasInfo.vasName,
          qty: vasInfo.qty,
          productName: product?.name || job.productId || "Unknown product",
          status: job.status || "WAITING",
          nextProcess: nextLabel,
          machine: plan?.machineId ? lookups.machineById.get(plan.machineId)?.name : undefined,
          person: plan?.personId ? lookups.personById.get(plan.personId)?.name : undefined,
          process: processLabel,
          plannedStart: job.plannedStart || plan?.plannedStart,
          plannedEnd: job.plannedEnd || plan?.plannedEnd,
          stepNo: job.stepNo ?? currentStep?.stepNo,
          embellishment,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const orderCompare = compareOrderNo(a.orderNo, b.orderNo);
        if (orderCompare !== 0) return orderCompare;
        return a.vasName.localeCompare(b.vasName);
      });

    return rows;
  }, [embellishmentRecords, jobs, machines, orders, people, plans, products, routing]);

  const workStatusRows = useMemo(() => {
    const lookups = buildLookups(orders, machines, people, products, routing, plans);
    const embellishmentByOrderProduct = new Map<string, PmsEmbellishmentRecord>();
    embellishmentRecords.forEach((record) => {
      const key = `${record.orderId || ""}__${record.productId || ""}`;
      if (!record.orderId || !record.productId || embellishmentByOrderProduct.has(key)) return;
      embellishmentByOrderProduct.set(key, record);
    });

    const jobsByGroup = new Map<string, PmsJob[]>();
    jobs.forEach((job) => {
      if (!job.orderId) return;
      const key = job.jobGroupId || (job.productId ? `${job.orderId}_${job.productId}` : job.orderId);
      if (!jobsByGroup.has(key)) jobsByGroup.set(key, []);
      jobsByGroup.get(key)!.push(job);
    });

    return Array.from(jobsByGroup.values())
      .map((groupJobs) => {
        const sortedJobs = [...groupJobs].sort((a, b) => (a.stepNo || 0) - (b.stepNo || 0));
        const firstJob = sortedJobs[0];
        if (!firstJob) return null;
        const order = lookups.ordersById.get(firstJob.orderId);
        if (!order) return null;
        const product = firstJob.productId ? lookups.productById.get(firstJob.productId) : undefined;
        const routingSteps = firstJob.productId ? lookups.routingByProduct.get(firstJob.productId) || [] : [];
        const vasInfo = resolveVasInfo(order, product?.name);
        if (isPmsExcludedItem(product?.name, vasInfo.vasName, vasInfo.vasGroup)) return null;

        const activeJob = sortedJobs.find((job) => job.status === "IN_PROGRESS");
        const nextStep =
          activeJob && activeJob.stepNo !== undefined
            ? routingSteps.find((step) => step.stepNo === activeJob.stepNo! + 1)
            : undefined;
        const totalSteps = Math.max(routingSteps.length, sortedJobs.length, 1);
        const doneSteps = sortedJobs.filter((job) => job.status === "DONE").length;
        const progressPercent = Math.round((doneSteps / totalSteps) * 100);
        const jobStatusItems = sortedJobs.map((job, index) => {
          const routingStep = routingSteps.find((step) => step.stepNo === job.stepNo);
          const processName = job.process || routingStep?.process || "Not scheduled";
          const status = job.status || "WAITING";
          const stepLabel =
            job.stepNo !== undefined && job.stepNo !== null
              ? `${processName} (Step ${job.stepNo})`
              : processName;

          return {
            key: `${job.id || firstJob.id || firstJob.orderId || "job"}-${job.stepNo ?? index}-${status}-${index}`,
            status,
            stepNo: job.stepNo,
            processName,
            stepLabel,
          };
        });
        const currentJobStatusItem =
          jobStatusItems.find((item) => item.status === "IN_PROGRESS") ||
          jobStatusItems.find((item) => item.status === "PLANNED") ||
          jobStatusItems.find((item) => item.status === "WAITING") ||
          jobStatusItems[jobStatusItems.length - 1] ||
          null;
        const jobStatuses = jobStatusItems.map((item) => item.status);
        const processSearch = [
          activeJob?.process || nextStep?.process || routingSteps[0]?.process || "Not scheduled",
        ];
        const lastUpdate = [...sortedJobs]
          .map((job) => job.updatedAt || job.actualEnd || job.actualStart || job.plannedEnd || job.plannedStart)
          .filter(Boolean)
          .sort()
          .slice(-1)[0];
        const stage = jobStatuses.includes("IN_PROGRESS")
          ? "Machine Running"
          : jobStatuses.includes("PLANNED") || jobStatuses.includes("WAITING")
          ? "Pending"
          : "Completed";
        const embellishment = embellishmentByOrderProduct.get(
          `${firstJob.orderId || ""}__${firstJob.productId || ""}`
        );

        return {
          key: firstJob.jobGroupId || `${firstJob.orderId || ""}__${firstJob.productId || vasInfo.vasName}`,
          orderNo: order.crmOrderNo || order.orderNo || order.id,
          customer: order.customerSnapshot?.name || order.customerName || "N/A",
          vasName: vasInfo.vasName,
          productName: product?.name || firstJob.productId || "Unknown product",
          stage,
          currentJobStatusItem,
          jobStatusItems,
          jobStatuses,
          doneSteps,
          totalSteps,
          progressPercent,
          lastUpdate,
          qcPending:
            stage !== "Completed" &&
            processSearch.some((value) => normalizeText(value).includes(normalizeText("q&q"))),
          dispatchReady:
            stage !== "Completed" &&
            processSearch.some((value) => normalizeText(value).includes(normalizeText("packaging"))),
          embellishment,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const orderCompare = compareOrderNo(a.orderNo, b.orderNo);
        if (orderCompare !== 0) return orderCompare;
        return a.vasName.localeCompare(b.vasName);
      }) as any[];
  }, [embellishmentRecords, jobs, machines, orders, people, plans, products, routing]);

  const searchedWorkStatusRows = useMemo(
    () =>
      workStatusRows.filter((row) =>
        matchesPmsSearch(statusSearch, [
          row.orderNo,
          row.customer,
          row.vasName,
          row.productName,
          row.stage,
          row.jobStatuses,
          row.jobStatusItems?.map((item: any) => `${item.stepLabel} ${item.status}`),
          row.embellishment?.embellishmentBarcode,
          row.embellishment?.customerName,
          row.embellishment?.customerPhone,
        ])
      ),
    [statusSearch, workStatusRows]
  );

  const workStatusSummary = useMemo(() => {
    const filteredRows = searchedWorkStatusRows;
    const pending = filteredRows.filter((row) => row.stage === "Pending").length;
    const machineRunning = filteredRows.filter((row) => row.stage === "Machine Running").length;
    const completed = filteredRows.filter((row) => row.stage === "Completed").length;
    const qcPending = filteredRows.filter((row) => row.qcPending).length;
    const dispatchReady = filteredRows.filter((row) => row.dispatchReady).length;
    const embellishment = filteredRows.filter((row) => row.embellishment?.enabled).length;
    return {
      totalOrders: filteredRows.length,
      pending,
      machineRunning,
      completed,
      qcPending,
      dispatchReady,
      embellishment,
    };
  }, [searchedWorkStatusRows]);

  const filteredWorkStatusRows = useMemo(
    () => searchedWorkStatusRows.filter((row) => matchesStatusQuickFilter(row)),
    [searchedWorkStatusRows, statusQuickFilter]
  );

  const filteredWorkDetailRows = useMemo(
    () =>
      workDetailRows.filter((row) =>
        matchesPmsSearch(workDetailSearch, [
          row.orderNo,
          row.customer,
          row.vasName,
          row.vasGroup,
          row.process,
          row.nextProcess,
          row.machine,
          row.person,
          row.status,
          row.embellishment?.embellishmentBarcode,
          row.embellishment?.customerName,
          row.embellishment?.customerPhone,
        ])
      ),
    [workDetailRows, workDetailSearch]
  );

  return {
    workDetailRows,
    workSheetStepRows,
    workStatusRows,
    workStatusSummary,
    filteredWorkStatusRows,
    filteredWorkDetailRows,
  };
};
