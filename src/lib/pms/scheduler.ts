import { addWorkingMinutes, CapacityMap } from "./capacity";

export type SchedulerJob = {
  id: string;
  orderId: string;
  productId: string;
  stepNo: number;
  process: string;
  requiredMinutes: number;
  status: "WAITING" | "PLANNED" | "IN_PROGRESS" | "DONE";
  priority?: number;
  plannedStart?: string;
  plannedEnd?: string;
  actualEnd?: string;
};

export type SchedulerPlan = {
  jobId: string;
  machineId: string;
  personId: string;
  plannedStart: string;
  plannedEnd: string;
};

type MachineLike = {
  id: string;
  process: string;
  shiftMinutes: number;
  active?: boolean;
};

type SkillLike = {
  machineId: string;
  personId: string;
  process: string;
  category: string;
  allowed: boolean;
};

type ProductLike = {
  id: string;
  category: string;
};

const getOrderPriority = (job: SchedulerJob, orderPriorityMap: Record<string, number | undefined>) =>
  job.priority ?? orderPriorityMap[job.orderId] ?? 0;

const scoreCandidate = (startIso: string, loadMinutes: number, priority: number) => {
  const startScore = new Date(startIso).getTime();
  const loadPenalty = loadMinutes * 60_000;
  const priorityPenalty = priority * 1_000 * 60;
  return startScore + loadPenalty + priorityPenalty;
};

export const scheduleJobs = ({
  jobs,
  machines,
  skills,
  products,
  capacityMap,
  allowChain,
  orderPriorityMap,
  now,
}: {
  jobs: SchedulerJob[];
  machines: MachineLike[];
  skills: SkillLike[];
  products: ProductLike[];
  capacityMap: CapacityMap;
  allowChain: boolean;
  orderPriorityMap: Record<string, number | undefined>;
  now: string;
}) => {
  const productCategory = new Map(products.map((p) => [p.id, p.category]));
  const machineMap = new Map(machines.map((m) => [m.id, m]));
  const jobByOrder = new Map<string, SchedulerJob[]>();

  jobs.forEach((job) => {
    if (!jobByOrder.has(job.orderId)) jobByOrder.set(job.orderId, []);
    jobByOrder.get(job.orderId)!.push(job);
  });

  jobByOrder.forEach((orderJobs) => orderJobs.sort((a, b) => a.stepNo - b.stepNo));

  const planned: SchedulerPlan[] = [];
  const updatedJobs: SchedulerJob[] = [];

  const sortedJobs = [...jobs].sort((a, b) => {
    const priorityA = getOrderPriority(a, orderPriorityMap);
    const priorityB = getOrderPriority(b, orderPriorityMap);
    if (priorityA !== priorityB) return priorityA - priorityB;
    if (a.orderId !== b.orderId) return a.orderId.localeCompare(b.orderId);
    return a.stepNo - b.stepNo;
  });

  sortedJobs.forEach((job) => {
    if (job.status !== "WAITING") return;

    const orderJobs = jobByOrder.get(job.orderId) || [];
    const prev = orderJobs.find((candidate) => candidate.stepNo === job.stepNo - 1);
    if (!allowChain && prev && prev.status !== "DONE") {
      return;
    }

    const jobReadyAt =
      prev?.actualEnd ||
      prev?.plannedEnd ||
      (prev ? undefined : now) ||
      now;

    const category = productCategory.get(job.productId) || "";

    const eligibleMachines = machines.filter(
      (machine) => machine.active !== false && machine.process === job.process
    );

    let bestPlan: SchedulerPlan | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    eligibleMachines.forEach((machine) => {
      const machineSkills = skills.filter(
        (skill) =>
          skill.machineId === machine.id &&
          skill.allowed &&
          skill.process === job.process &&
          skill.category === category
      );

      machineSkills.forEach((skill) => {
        const slot = capacityMap[machine.id]?.[skill.personId];
        if (!slot) return;

        const candidateStart =
          jobReadyAt && new Date(jobReadyAt).getTime() > new Date(slot.freeAt).getTime()
            ? jobReadyAt
            : slot.freeAt;

        const plannedEnd = addWorkingMinutes(
          candidateStart,
          job.requiredMinutes,
          machine.shiftMinutes
        );

        const loadMinutes = slot.plannedMinutes + (slot.activeMinutes || 0);
        const priority = getOrderPriority(job, orderPriorityMap);
        const score = scoreCandidate(candidateStart, loadMinutes, priority);

        if (score < bestScore) {
          bestScore = score;
          bestPlan = {
            jobId: job.id,
            machineId: machine.id,
            personId: skill.personId,
            plannedStart: candidateStart,
            plannedEnd,
          };
        }
      });
    });

    if (!bestPlan) return;

    planned.push(bestPlan);

    const slot = capacityMap[bestPlan.machineId]?.[bestPlan.personId];
    const machine = machineMap.get(bestPlan.machineId);
    if (slot && machine) {
      slot.freeAt = bestPlan.plannedEnd;
      slot.freeMinutes = Math.max(0, slot.freeMinutes - job.requiredMinutes);
      slot.plannedMinutes += job.requiredMinutes;
    }

    updatedJobs.push({
      ...job,
      status: "PLANNED",
      plannedStart: bestPlan.plannedStart,
      plannedEnd: bestPlan.plannedEnd,
    });
  });

  return { planned, updatedJobs };
};
