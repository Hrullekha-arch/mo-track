import { CapacityMap } from "./capacity";
import { maxIso, toMillis } from "./time";
import { getWorkingSchedule, WorkingHoursConfig } from "./working-hours";

export type SchedulerJob = {
  id: string;
  orderId: string;
  jobGroupId?: string;
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
  const startScore = toMillis(startIso) ?? 0;
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
  workingHours,
}: {
  jobs: SchedulerJob[];
  machines: MachineLike[];
  skills: SkillLike[];
  products: ProductLike[];
  capacityMap: CapacityMap;
  allowChain: boolean;
  orderPriorityMap: Record<string, number | undefined>;
  now: string;
  workingHours?: WorkingHoursConfig;
}) => {
  const productCategory = new Map(products.map((p) => [p.id, p.category]));
  const jobByGroup = new Map<string, SchedulerJob[]>();

  jobs.forEach((job) => {
    const groupKey = job.jobGroupId || job.orderId;
    if (!jobByGroup.has(groupKey)) jobByGroup.set(groupKey, []);
    jobByGroup.get(groupKey)!.push(job);
  });

  jobByGroup.forEach((groupJobs) => groupJobs.sort((a, b) => a.stepNo - b.stepNo));

  const planned: SchedulerPlan[] = [];
  const updatedJobs: SchedulerJob[] = [];
  const plannedByJobId = new Map<string, SchedulerPlan>();
  const bumpMachineSlots = (machineId: string, plannedEnd: string, minutes: number) => {
    const personMap = capacityMap[machineId];
    if (!personMap) return;
    Object.values(personMap).forEach((slot) => {
      slot.freeAt = maxIso(slot.freeAt, plannedEnd) || slot.freeAt;
      slot.freeMinutes = Math.max(0, slot.freeMinutes - minutes);
      slot.plannedMinutes += minutes;
    });
  };
  const bumpPersonSlots = (personId: string, plannedEnd: string, minutes: number) => {
    Object.values(capacityMap).forEach((personMap) => {
      const slot = personMap[personId];
      if (!slot) return;
      slot.freeAt = maxIso(slot.freeAt, plannedEnd) || slot.freeAt;
      slot.freeMinutes = Math.max(0, slot.freeMinutes - minutes);
      slot.plannedMinutes += minutes;
    });
  };

  const sortedJobs = [...jobs].sort((a, b) => {
    const priorityA = getOrderPriority(a, orderPriorityMap);
    const priorityB = getOrderPriority(b, orderPriorityMap);
    if (priorityA !== priorityB) return priorityA - priorityB;
    if (a.orderId !== b.orderId) return a.orderId.localeCompare(b.orderId);
    return a.stepNo - b.stepNo;
  });

  sortedJobs.forEach((job) => {
    if (job.status !== "WAITING") return;

    const groupKey = job.jobGroupId || job.orderId;
    const groupJobs = jobByGroup.get(groupKey) || [];
    const prev = groupJobs.find((candidate) => candidate.stepNo === job.stepNo - 1);
    if (!allowChain && prev && prev.status !== "DONE") {
      return;
    }

    const prevPlanned = prev ? plannedByJobId.get(prev.id) : undefined;
    const jobReadyAt =
      maxIso(prev?.actualEnd, prev?.plannedEnd, prevPlanned?.plannedEnd, prev ? undefined : now) ||
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

        const jobReadyAtMs = toMillis(jobReadyAt);
        const slotFreeAtMs = toMillis(slot.freeAt);
        const candidateStart =
          jobReadyAtMs !== undefined && (slotFreeAtMs === undefined || jobReadyAtMs > slotFreeAtMs)
            ? jobReadyAt
            : slot.freeAt;

        const schedule = getWorkingSchedule(candidateStart, job.requiredMinutes, workingHours);
        const plannedStart = schedule.start;
        const plannedEnd = schedule.end;

        const loadMinutes = slot.plannedMinutes + (slot.activeMinutes || 0);
        const priority = getOrderPriority(job, orderPriorityMap);
        const score = scoreCandidate(plannedStart, loadMinutes, priority);

        if (score < bestScore) {
          bestScore = score;
          bestPlan = {
            jobId: job.id,
            machineId: machine.id,
            personId: skill.personId,
            plannedStart,
            plannedEnd,
          };
        }
      });
    });

    if (!bestPlan) return;

    planned.push(bestPlan);
    plannedByJobId.set(job.id, bestPlan);

    bumpMachineSlots(bestPlan.machineId, bestPlan.plannedEnd, job.requiredMinutes);
    bumpPersonSlots(bestPlan.personId, bestPlan.plannedEnd, job.requiredMinutes);

    updatedJobs.push({
      ...job,
      status: "PLANNED",
      plannedStart: bestPlan.plannedStart,
      plannedEnd: bestPlan.plannedEnd,
    });
  });

  return { planned, updatedJobs };
};
