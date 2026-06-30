import { useCallback, useMemo } from "react";
import { Order } from "@/lib/types";
import {
  CreateJobDialogState,
  PmsCategory,
  PmsDowntime,
  PmsEmbellishmentRecord,
  PmsJob,
  PmsMachine,
  PmsPerson,
  PmsPlan,
  PmsProduct,
  PmsRouting,
  PmsSkill,
  EMBELLISHMENT_HOURLY_CHARGE,
  formatDateTime,
  matchesPmsSearch,
  normalizeText,
  isPmsExcludedItem,
  roundToTwoDecimals,
  toNumber,
} from "../pmsCore";
import { isOrderClosedForPms as sharedIsOrderClosedForPms } from "../utils/pmsHelpers";

type UsePmsDerivedDataParams = {
  products: PmsProduct[];
  pmsCategories: PmsCategory[];
  routing: PmsRouting[];
  machines: PmsMachine[];
  people: PmsPerson[];
  skills: PmsSkill[];
  downtimes: PmsDowntime[];
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
  statusSearch: string;
  workDetailSearch: string;
  embellishmentSearch: string;
};

export function usePmsDerivedData(params: UsePmsDerivedDataParams) {
  const {
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
    statusSearch,
    workDetailSearch,
    embellishmentSearch,
  } = params;
  const categories = useMemo(
    () =>
      Array.from(
        new Set([
          ...products.map((product) => product.category).filter(Boolean),
          ...pmsCategories.map((category) => category.name).filter(Boolean),
        ])
      ).sort((left, right) => left.localeCompare(right)),
    [products, pmsCategories]
  );

  // Filtered data
  const filteredProducts = useMemo(() => {
    return products.filter((p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(productSearch.toLowerCase())
    );
  }, [products, productSearch]);

  const filteredMachines = useMemo(() => {
    return machines.filter((m) => {
      const matchesSearch = m.name.toLowerCase().includes(machineSearch.toLowerCase()) ||
        m.process.toLowerCase().includes(machineSearch.toLowerCase());
      const matchesActive = showInactiveMachines || m.active;
      return matchesSearch && matchesActive;
    });
  }, [machines, machineSearch, showInactiveMachines]);

  const filteredPeople = useMemo(() => {
    return people.filter((p) =>
      p.name.toLowerCase().includes(personSearch.toLowerCase()) ||
      (p.role?.toLowerCase() || "").includes(personSearch.toLowerCase())
    );
  }, [people, personSearch]);

  // Statistics
  const stats = useMemo(() => {
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
  }, [products, machines, people, downtimes]);

  const createJobTotals = useMemo(() => {
    const panels = toNumber(createJobDialog.form.numberOfPanels);
    const stitchingPerPanel = toNumber(createJobDialog.form.stitchingPerPanel);
    const handWorkTime = toNumber(createJobDialog.form.handWorkTime);
    const totalMinutes = panels * stitchingPerPanel + handWorkTime;
    const totalHours = roundToTwoDecimals(totalMinutes / 60);
    const chargeAmount = roundToTwoDecimals(totalHours * EMBELLISHMENT_HOURLY_CHARGE);
    return {
      totalMinutes: roundToTwoDecimals(totalMinutes),
      totalHours,
      hourlyCharge: EMBELLISHMENT_HOURLY_CHARGE,
      chargeAmount,
    };
  }, [createJobDialog.form]);

  const isOrderInvoiced = useCallback((order?: Order) => {
    if (!order) return false;
    const status = order.invoicing?.status;
    const invoices = order.invoicing?.invoices || [];
    if (status && status !== "NOT_INVOICED") return true;
    return Array.isArray(invoices) && invoices.length > 0;
  }, []);

  const isOrderClosedForPms = useCallback((order?: Order) => {
    return sharedIsOrderClosedForPms(order);
  }, []);

  const liveVasRowsAll = useMemo(() => {
    const planByJob = new Map(plans.map((plan) => [plan.jobId, plan]));
    const machineById = new Map(machines.map((machine) => [machine.id, machine]));
    const personById = new Map(people.map((person) => [person.id, person]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const embellishmentByRowKey = new Map(
      embellishmentRecords.map((record) => [record.id, record])
    );
    const routingByProduct = new Map<string, PmsRouting[]>();
    routing.forEach((step) => {
      if (!routingByProduct.has(step.productId)) routingByProduct.set(step.productId, []);
      routingByProduct.get(step.productId)!.push(step);
    });

    const toGroupKey = (orderId: string, productId?: string, jobGroupId?: string) =>
      jobGroupId || (productId ? `${orderId}_${productId}` : orderId);

    const jobsByGroup = new Map<string, PmsJob[]>();
    jobs.forEach((job) => {
      if (!job.orderId) return;
      const groupKey = toGroupKey(job.orderId, job.productId, job.jobGroupId);
      if (!jobsByGroup.has(groupKey)) jobsByGroup.set(groupKey, []);
      jobsByGroup.get(groupKey)!.push(job);
    });

    const getJobBucket = (groupKey: string) => {
      const bucket = jobsByGroup.get(groupKey) || [];
      const sorted = [...bucket].sort((a, b) => (a.stepNo || 0) - (b.stepNo || 0));
      const inProgress = sorted.find((job) => job.status === "IN_PROGRESS");
      const planned = sorted.find((job) => job.status === "PLANNED");
      const waiting = sorted.find((job) => job.status === "WAITING");
      const nextJob = inProgress || planned || waiting || null;
      const nextPlan = nextJob ? planByJob.get(nextJob.id) : null;
      const etaFromJobs = sorted
        .map((job) => job.plannedEnd)
        .filter(Boolean)
        .sort()
        .slice(-1)[0];
      return { sorted, inProgress, nextJob, nextPlan, etaFromJobs };
    };

    const explainNoPlan = (
      productId?: string,
      hasJobs?: boolean,
      waitingJob?: PmsJob,
      prevJob?: PmsJob,
      invoiceReady?: boolean
    ) => {
      if (!invoiceReady) return "Invoice not generated";
      if (!productId) return "No PMS product match";
      if (!hasJobs) return "Jobs not created";
      if (waitingJob && prevJob && prevJob.status !== "DONE") {
        return "Previous step pending";
      }
      const product = productById.get(productId);
      if (!product?.category) return "Missing product category";
      const steps = routingByProduct.get(productId) || [];
      if (steps.length === 0) return "Routing not created for this product";
      if (waitingJob?.process) {
        const routingProcesses = new Set(steps.map((step) => normalizeText(step.process)));
        if (!routingProcesses.has(normalizeText(waitingJob.process))) {
          return "Routing changed — recreate jobs";
        }
      }

      const processKey = normalizeText(waitingJob?.process || steps[0]?.process || "");
      if (!processKey) return "Job missing process";

      const eligibleMachines = machines.filter(
        (machine) =>
          machine.active !== false && normalizeText(machine.process) === processKey
      );
      if (eligibleMachines.length === 0) return "No machine for process";

      const machineIds = new Set(eligibleMachines.map((machine) => machine.id));
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

    const rows = orders
      .filter(
        (order) =>
          (order.sections?.VAS?.items?.length || 0) > 0 && !isOrderClosedForPms(order)
      )
      .flatMap((order) => {
        return (order.sections?.VAS?.items || []).flatMap((item, index) => {
          const vasName = item.description || item.group || "VAS";
          const exclusionCandidates = [vasName, item.group, item.roomName, item.type];
          if (isPmsExcludedItem(...exclusionCandidates)) return [];
          const rowKey = `${order.id}-vas-${index}`;
          const existingEmbellishment =
            embellishmentByRowKey.get(rowKey) ||
            (item as any)?.meta?.embellishment ||
            (item as any)?.embellishment;
          const searchCandidates = [
            vasName,
            item.group,
            item.roomName,
            item.type,
          ].filter(Boolean) as string[];
          const match =
            products.find((product) => normalizeText(product.name) === normalizeText(vasName)) ||
            products.find((product) =>
              searchCandidates.some((candidate) => {
                const left = normalizeText(candidate);
                const right = normalizeText(product.name);
                return left === right || left.includes(right) || right.includes(left);
              })
            );
          const hasRouting =
            Boolean(match?.id) && (routingByProduct.get(match!.id) || []).length > 0;
          const groupKey = toGroupKey(order.id, match?.id);
          const jobBucket = getJobBucket(groupKey);
          const status = jobBucket.inProgress?.status || jobBucket.nextJob?.status || "WAITING";
          const currentProcess = jobBucket.inProgress?.process || jobBucket.nextJob?.process || "Not scheduled";
          const stepNo = jobBucket.inProgress?.stepNo ?? jobBucket.nextJob?.stepNo;
          const plannedStart = jobBucket.nextPlan?.plannedStart;
          const plannedEnd = jobBucket.nextPlan?.plannedEnd;
          const eta = (order as any).pmsEta || jobBucket.etaFromJobs || plannedEnd;
          const machineName = jobBucket.nextPlan?.machineId
            ? machineById.get(jobBucket.nextPlan.machineId)?.name
            : undefined;
          const personName = jobBucket.nextPlan?.personId
            ? personById.get(jobBucket.nextPlan.personId)?.name
            : undefined;
          const invoiceReady = isOrderInvoiced(order);
          const hasJobsForProduct = match
            ? jobs.some((job) => job.orderId === order.id && job.productId === match.id)
            : false;
          const waitingJob =
            jobBucket.nextJob?.status === "WAITING" ? jobBucket.nextJob : undefined;
          const prevJob =
            waitingJob && waitingJob.stepNo !== undefined
              ? jobBucket.sorted.find((job) => job.stepNo === waitingJob.stepNo! - 1)
              : undefined;
          const noPlanReason =
            status === "WAITING" && !plannedStart
              ? explainNoPlan(match?.id, hasJobsForProduct, waitingJob, prevJob, invoiceReady)
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

          return [{
            key: rowKey,
            orderId: order.id,
            orderNo: order.crmOrderNo || order.orderNo || order.id,
            customer: order.customerSnapshot?.name || order.customerName || "N/A",
            customerPhone: order.customerSnapshot?.phone || order.customerPhone || "",
            vasName,
            qty: item.qty ?? (item as any).quantity ?? 0,
            group: item.group || "-",
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
          }];
        });
      });
    return rows;
  }, [orders, jobs, plans, machines, people, products, routing, skills, embellishmentRecords, isOrderInvoiced, isOrderClosedForPms]);

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
    return [...filtered].sort((a, b) => {
      const statusRankDiff = (rank[a.status] ?? 99) - (rank[b.status] ?? 99);
      if (statusRankDiff !== 0) return statusRankDiff;
      if (a.orderPriority !== b.orderPriority) return a.orderPriority - b.orderPriority;
      const aTime = a.plannedStart ? new Date(a.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.plannedStart ? new Date(b.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
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

    const query = normalizeText(productSearch);
    return Array.from(itemsByProduct.values())
      .filter((item) =>
        !query ||
        [item.productName, item.orderNo, item.customer, item.vasName]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .sort((left, right) => left.productName.localeCompare(right.productName));
  }, [liveVasRowsAll, productSearch]);

  const liveStats = useMemo(() => {
    const totalItems = liveVasRows.length;
    const inProgress = liveVasRows.filter((row) => row.status === "IN_PROGRESS").length;
    const planned = liveVasRows.filter((row) => row.status === "PLANNED").length;
    const waiting = liveVasRows.filter((row) => row.status === "WAITING").length;
    const done = liveVasRows.filter((row) => row.status === "DONE").length;
    const emergency = liveVasRows.filter((row) => row.isEmergency).length;
    return { totalItems, inProgress, planned, waiting, done, emergency };
  }, [liveVasRows]);

  const resolveVasInfo = useCallback((order?: Order, productName?: string) => {
    const items = ((order?.sections as any)?.VAS?.items || []).filter(
      (item: any) =>
        !isPmsExcludedItem(item?.description, item?.group, item?.roomName, item?.type)
    );
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
  }, []);

  const workDetailRows = useMemo(() => {
    const nowMs = Date.now();
    const ordersById = new Map(orders.map((order) => [order.id, order]));
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const machineById = new Map(machines.map((machine) => [machine.id, machine]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const embellishmentByOrderProduct = new Map<string, PmsEmbellishmentRecord>();
    embellishmentRecords.forEach((record) => {
      const key = `${record.orderId || ""}__${record.productId || ""}`;
      if (!record.orderId || !record.productId || embellishmentByOrderProduct.has(key)) return;
      embellishmentByOrderProduct.set(key, record);
    });
    const routingByProduct = new Map<string, PmsRouting[]>();
    routing.forEach((step) => {
      if (!routingByProduct.has(step.productId)) routingByProduct.set(step.productId, []);
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
      const existingTime = new Date(existing.plannedEnd || existing.plannedStart || 0).getTime();
      const nextTime = new Date(plan.plannedEnd || plan.plannedStart || 0).getTime();
      if (nextTime >= existingTime) {
        planByJob.set(plan.jobId, plan);
      }
    });

    const activeAssignments = jobs
      .map((job) => {
        const status = String(job.status || "").toUpperCase();
        if (status !== "IN_PROGRESS" && status !== "PLANNED") return null;
        const plan = planByJob.get(job.id);
        if (!plan?.plannedStart || !plan?.plannedEnd) return null;
        const startMs = new Date(plan.plannedStart).getTime();
        const endMs = new Date(plan.plannedEnd).getTime();
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
        const order = ordersById.get(job.orderId);
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
      const groupKey =
        job.jobGroupId || (job.productId ? `${job.orderId}_${job.productId}` : job.orderId);
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

        const order = ordersById.get(currentJob.orderId);
        if (isOrderClosedForPms(order)) return null;
        const product = currentJob.productId ? productById.get(currentJob.productId) : undefined;
        const routingSteps = currentJob.productId
          ? routingByProduct.get(currentJob.productId) || []
          : [];

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
          const plan = planByJob.get(groupJob.id);
          const machineName = plan?.machineId
            ? machineById.get(plan.machineId)?.name || plan.machineId
            : undefined;
          const personName = plan?.personId
            ? peopleById.get(plan.personId)?.name || plan.personId
            : undefined;
          stepPlanMap.set(groupJob.stepNo, {
            plannedStart: groupJob.plannedStart ?? plan?.plannedStart,
            plannedEnd: groupJob.plannedEnd ?? plan?.plannedEnd,
            actualStart: groupJob.actualStart,
            actualEnd: groupJob.actualEnd,
            status: groupJob.status,
            machineName,
            personName,
          });
        });

        const currentStepNo = currentJob.stepNo ?? routingSteps[0]?.stepNo;
        const currentStep =
          routingSteps.find((step) => step.stepNo === currentStepNo) || routingSteps[0];
        const nextStep = currentStep
          ? routingSteps.find((step) => step.stepNo === currentStep.stepNo + 1)
          : undefined;
        const maxStepNo = routingSteps.reduce((max, step) => {
          return Math.max(max, Number(step?.stepNo || 0));
        }, 0);
        const isFinalStep = Boolean(currentStepNo && maxStepNo && Number(currentStepNo) >= maxStepNo);

        const currentPlan = currentStep ? stepPlanMap.get(currentStep.stepNo) : undefined;
        const nextPlan = nextStep ? stepPlanMap.get(nextStep.stepNo) : undefined;

        const machine = currentPlan?.machineName;
        const person = currentPlan?.personName;
        const nextMachine = nextPlan?.machineName;
        const nextPerson = nextPlan?.personName;
        const currentPlanDoc = planByJob.get(currentJob.id);
        const currentMachineId = currentPlanDoc?.machineId;
        const currentPersonId = currentPlanDoc?.personId;

        const vasInfo = resolveVasInfo(order, product?.name);
        if (isPmsExcludedItem(product?.name, vasInfo.vasName, vasInfo.vasGroup)) return null;
        const embellishmentRecord = embellishmentByOrderProduct.get(
          `${currentJob.orderId || ""}__${currentJob.productId || ""}`
        );
        const resetJobs = sortedJobs.filter(
          (job) => job.status === "PLANNED" || job.status === "WAITING"
        );
        const resetJobIds = resetJobs.map((job) => job.id).filter(Boolean);
        const resetPlanDocIds = resetJobIds.flatMap(
          (jobId) => planDocIdsByJob.get(jobId) || []
        );
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
              const sameMachine =
                Boolean(currentMachineId) && assignment.machineId === currentMachineId;
              const samePerson =
                Boolean(currentPersonId) && assignment.personId === currentPersonId;
              return sameMachine || samePerson;
            });
            const ongoingNow = relatedAssignments
              .filter(
                (assignment) =>
                  assignment.status === "IN_PROGRESS" &&
                  assignment.startMs <= nowMs &&
                  assignment.endMs >= nowMs &&
                  assignment.endMs <= rowStartMs
              )
              .sort((a, b) => b.endMs - a.endMs)[0];
            if (ongoingNow) {
              blockedByLabel = `Blocked by ${ongoingNow.orderNo} (${ongoingNow.status}) till ${formatDateTime(
                ongoingNow.plannedEnd
              )}`;
            }
          }
        }

        return {
          key: groupKey,
          currentJobId: currentJob.id,
          orderNo: order?.crmOrderNo || order?.orderNo || order?.id || currentJob.orderId,
          orderId: currentJob.orderId,
          customer: order?.customerSnapshot?.name || order?.customerName || "N/A",
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
          totalSteps: maxStepNo,
          productName: product?.name || currentJob.productId || "Unknown product",
          stepPlanMap,
          nextProcess: nextStep?.process,
          nextPlannedStart: nextPlan?.plannedStart,
          nextPlannedEnd: nextPlan?.plannedEnd,
          nextMachine,
          nextPerson,
          resetJobIds,
          resetPlanDocIds,
          blockedByLabel,
          embellishment: embellishmentRecord,
        };
      })
      .filter(Boolean) as Array<{
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
        stepPlanMap: Map<
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
        >;
        nextProcess?: string;
        nextPlannedStart?: string;
        nextPlannedEnd?: string;
        nextMachine?: string;
        nextPerson?: string;
        resetJobIds: string[];
        resetPlanDocIds: string[];
        blockedByLabel?: string;
        embellishment?: PmsEmbellishmentRecord;
      }>;

    const statusRank: Record<string, number> = {
      IN_PROGRESS: 0,
      PLANNED: 1,
      WAITING: 2,
      DONE: 3,
    };

    return rows.sort((a, b) => {
      const rankDiff = (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      const aTime = a.plannedStart
        ? new Date(a.plannedStart).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bTime = b.plannedStart
        ? new Date(b.plannedStart).getTime()
        : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [plans, jobs, orders, people, machines, products, routing, embellishmentRecords, resolveVasInfo, isOrderClosedForPms]);

  const workSheetStepRows = useMemo(() => {
    const ordersById = new Map(orders.map((order) => [order.id, order]));
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const machineById = new Map(machines.map((machine) => [machine.id, machine]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const embellishmentByOrderProduct = new Map<string, PmsEmbellishmentRecord>();
    embellishmentRecords.forEach((record) => {
      const key = `${record.orderId || ""}__${record.productId || ""}`;
      if (!record.orderId || !record.productId || embellishmentByOrderProduct.has(key)) return;
      embellishmentByOrderProduct.set(key, record);
    });
    const routingByProduct = new Map<string, PmsRouting[]>();
    routing.forEach((step) => {
      if (!routingByProduct.has(step.productId)) routingByProduct.set(step.productId, []);
      routingByProduct.get(step.productId)!.push(step);
    });
    routingByProduct.forEach((steps, key) => {
      routingByProduct.set(
        key,
        [...steps].sort((a, b) => a.stepNo - b.stepNo)
      );
    });

    const planByJob = new Map<string, PmsPlan>();
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

    const rows = jobs
      .filter((job) => job.status !== "DONE")
      .map((job) => {
        const order = ordersById.get(job.orderId);
        if (!isOrderInvoiced(order) || isOrderClosedForPms(order)) return null;
        const product = job.productId ? productById.get(job.productId) : undefined;
        const routingSteps = job.productId
          ? routingByProduct.get(job.productId) || []
          : [];
        const currentStep =
          routingSteps.find((step) => step.stepNo === job.stepNo) || routingSteps[0];
        const nextStep = currentStep
          ? routingSteps.find((step) => step.stepNo === currentStep.stepNo + 1)
          : undefined;
        const plan = planByJob.get(job.id);
        const vasInfo = resolveVasInfo(order, product?.name);
        if (isPmsExcludedItem(product?.name, vasInfo.vasName, vasInfo.vasGroup)) return null;
        const embellishment = embellishmentByOrderProduct.get(
          `${job.orderId || ""}__${job.productId || ""}`
        );
        const processName = job.process || currentStep?.process || "Not scheduled";
        const processLabel = job.stepNo ? `${processName} (Step ${job.stepNo})` : processName;
        const nextLabel = nextStep?.process
          ? `${nextStep.process} (Step ${nextStep.stepNo})`
          : "-";

        return {
          key: job.id,
          stepNo: job.stepNo ?? currentStep?.stepNo,
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
          embellishment,
        };
      })
      .filter(Boolean) as Array<{
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
    }>;

    const compareOrderNo = (left: string, right: string) => {
      const leftNum = Number(left);
      const rightNum = Number(right);
      const leftIsNum = Number.isFinite(leftNum);
      const rightIsNum = Number.isFinite(rightNum);
      if (leftIsNum && rightIsNum) return leftNum - rightNum;
      return String(left).localeCompare(String(right));
    };

    return rows.sort((a, b) => {
      const orderCompare = compareOrderNo(a.orderNo, b.orderNo);
      if (orderCompare !== 0) return orderCompare;
      const productCompare = a.productName.localeCompare(b.productName);
      if (productCompare !== 0) return productCompare;
      const vasCompare = a.vasName.localeCompare(b.vasName);
      if (vasCompare !== 0) return vasCompare;
      const stepA = a.stepNo ?? Number.MAX_SAFE_INTEGER;
      const stepB = b.stepNo ?? Number.MAX_SAFE_INTEGER;
      if (stepA !== stepB) return stepA - stepB;
      const aTime = a.plannedStart ? new Date(a.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.plannedStart ? new Date(b.plannedStart).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [jobs, orders, people, machines, products, routing, plans, embellishmentRecords, resolveVasInfo, isOrderInvoiced, isOrderClosedForPms]);

  const workStatusRows = useMemo(() => {
    const ordersById = new Map(orders.map((order) => [order.id, order]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const embellishmentByOrderProduct = new Map<string, PmsEmbellishmentRecord>();
    embellishmentRecords.forEach((record) => {
      const key = `${record.orderId || ""}__${record.productId || ""}`;
      if (!record.orderId || !record.productId || embellishmentByOrderProduct.has(key)) return;
      embellishmentByOrderProduct.set(key, record);
    });
    const routingByProduct = new Map<string, PmsRouting[]>();
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

    const jobsByGroup = new Map<string, PmsJob[]>();
    jobs.forEach((job) => {
      if (!job.orderId) return;
      const key = job.jobGroupId || (job.productId ? `${job.orderId}_${job.productId}` : job.orderId);
      if (!jobsByGroup.has(key)) jobsByGroup.set(key, []);
      jobsByGroup.get(key)!.push(job);
    });

    const compareOrderNo = (left: string, right: string) => {
      const leftNum = Number(left);
      const rightNum = Number(right);
      const leftIsNum = Number.isFinite(leftNum);
      const rightIsNum = Number.isFinite(rightNum);
      if (leftIsNum && rightIsNum) return leftNum - rightNum;
      return String(left).localeCompare(String(right));
    };

    return Array.from(jobsByGroup.values())
      .map((groupJobs) => {
        const sortedJobs = [...groupJobs].sort((a, b) => (a.stepNo || 0) - (b.stepNo || 0));
        const firstJob = sortedJobs[0];
        if (!firstJob?.orderId) return null;

        const order = ordersById.get(firstJob.orderId);
        if (!order || !isOrderInvoiced(order) || isOrderClosedForPms(order)) return null;

        const product = firstJob.productId ? productById.get(firstJob.productId) : undefined;
        const routingSteps = firstJob.productId
          ? routingByProduct.get(firstJob.productId) || []
          : [];
        const activeJob =
          sortedJobs.find((job) => job.status === "IN_PROGRESS") ||
          sortedJobs.find((job) => job.status === "PLANNED") ||
          sortedJobs.find((job) => job.status === "WAITING") ||
          sortedJobs[sortedJobs.length - 1];
        const nextStep =
          activeJob?.stepNo !== undefined && activeJob?.stepNo !== null
            ? routingSteps.find((step) => step.stepNo === activeJob.stepNo! + 1)
            : undefined;
        const jobStatuses = Array.from(
          new Set(sortedJobs.map((job) => String(job.status || "WAITING").toUpperCase()))
        );
        const doneSteps = sortedJobs.filter((job) => job.status === "DONE").length;
        const totalSteps = Math.max(routingSteps.length, sortedJobs.length, 1);
        const progressPercent = Math.max(
          0,
          Math.min(100, Math.round((doneSteps / totalSteps) * 100))
        );
        const currentProcess =
          activeJob?.process || nextStep?.process || routingSteps[0]?.process || "Not scheduled";
        const processSearch = [currentProcess, nextStep?.process]
          .map((value) => normalizeText(value))
          .filter(Boolean);
        const lastUpdate = sortedJobs
          .map(
            (job) =>
              job.updatedAt ||
              job.actualEnd ||
              job.actualStart ||
              job.plannedEnd ||
              job.plannedStart
          )
          .filter(Boolean)
          .sort()
          .slice(-1)[0];
        const stage =
          jobStatuses.includes("IN_PROGRESS")
            ? "Machine Running"
            : jobStatuses.includes("PLANNED") || jobStatuses.includes("WAITING")
            ? "Pending"
            : "Completed";
        const embellishment = embellishmentByOrderProduct.get(
          `${firstJob.orderId || ""}__${firstJob.productId || ""}`
        );
        const vasInfo = resolveVasInfo(order, product?.name);
        if (isPmsExcludedItem(product?.name, vasInfo.vasName, vasInfo.vasGroup)) return null;

        return {
          key:
            firstJob.jobGroupId ||
            `${firstJob.orderId || ""}__${firstJob.productId || vasInfo.vasName}`,
          orderNo: order.crmOrderNo || order.orderNo || order.id,
          customer: order.customerSnapshot?.name || order.customerName || "N/A",
          vasName: vasInfo.vasName,
          productName: product?.name || firstJob.productId || "Unknown product",
          stage,
          jobStatuses,
          doneSteps,
          totalSteps,
          progressPercent,
          lastUpdate,
          qcPending:
            stage !== "Completed" &&
            processSearch.some(
              (value) =>
                value.includes("qc") ||
                value.includes("q&q") ||
                value.includes("quality")
            ),
          dispatchReady:
            stage !== "Completed" &&
            processSearch.some(
              (value) =>
                value.includes("dispatch") ||
                value.includes("packaging") ||
                value.includes("kitting")
            ),
          embellishment,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const orderCompare = compareOrderNo(a!.orderNo, b!.orderNo);
        if (orderCompare !== 0) return orderCompare;
        return a!.vasName.localeCompare(b!.vasName);
      }) as Array<{
      key: string;
      orderNo: string;
      customer: string;
      vasName: string;
      productName: string;
      stage: string;
      jobStatuses: string[];
      doneSteps: number;
      totalSteps: number;
      progressPercent: number;
      lastUpdate?: string;
      qcPending: boolean;
      dispatchReady: boolean;
      embellishment?: PmsEmbellishmentRecord;
    }>;
  }, [
    jobs,
    orders,
    products,
    routing,
    embellishmentRecords,
    isOrderInvoiced,
    isOrderClosedForPms,
    resolveVasInfo,
  ]);

  const workStatusSummary = useMemo(() => {
    const filteredRows = workStatusRows.filter((row) =>
      matchesPmsSearch(statusSearch, [
        row.orderNo,
        row.customer,
        row.vasName,
        row.productName,
        row.stage,
        row.jobStatuses,
        row.embellishment?.embellishmentBarcode,
        row.embellishment?.customerName,
        row.embellishment?.customerPhone,
      ])
    );
    const totalOrders = filteredRows.length;
    const pending = filteredRows.filter((row) => row.stage === "Pending").length;
    const machineRunning = filteredRows.filter(
      (row) => row.stage === "Machine Running"
    ).length;
    const qcPending = filteredRows.filter((row) => row.qcPending).length;
    const dispatchReady = filteredRows.filter((row) => row.dispatchReady).length;
    const completed = filteredRows.filter((row) => row.stage === "Completed").length;
    const embellishment = filteredRows.filter((row) => row.embellishment?.enabled).length;
    return {
      totalOrders,
      pending,
      machineRunning,
      qcPending,
      dispatchReady,
      completed,
      embellishment,
    };
  }, [workStatusRows, statusSearch]);

  const filteredWorkStatusRows = useMemo(
    () =>
      workStatusRows.filter((row) =>
        matchesPmsSearch(statusSearch, [
          row.orderNo,
          row.customer,
          row.vasName,
          row.productName,
          row.stage,
          row.jobStatuses,
          row.embellishment?.embellishmentBarcode,
          row.embellishment?.customerName,
          row.embellishment?.customerPhone,
        ])
      ),
    [workStatusRows, statusSearch]
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
          row.person,
          row.machine,
          row.status,
          row.embellishment?.embellishmentBarcode,
          row.embellishment?.customerName,
          row.embellishment?.customerPhone,
        ])
      ),
    [workDetailRows, workDetailSearch]
  );

  const filteredEmbellishmentRows = useMemo(
    () =>
      liveVasRows.filter((row) =>
        matchesPmsSearch(embellishmentSearch, [
          row.orderNo,
          row.customer,
          row.customerPhone,
          row.vasName,
          row.group,
          row.matchedProductName,
          row.status,
          row.embellishment?.embellishmentBarcode,
          row.embellishment?.customerName,
          row.embellishment?.customerPhone,
        ])
      ),
    [liveVasRows, embellishmentSearch]
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
    liveVasRowsAll,
    liveVasRows,
    routingNotEnteredItems,
    liveStats,
    resolveVasInfo,
    workDetailRows,
    workSheetStepRows,
    workStatusRows,
    workStatusSummary,
    filteredWorkStatusRows,
    filteredWorkDetailRows,
    filteredEmbellishmentRows,
  };
}
