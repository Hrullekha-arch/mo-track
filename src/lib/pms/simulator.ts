import { buildCapacityMap, CapacityMap } from "./capacity";
import { scheduleJobs, SchedulerJob } from "./scheduler";
import { maxIso } from "./time";

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

type PlanLike = {
  machineId: string;
  personId: string;
  plannedStart: string;
  plannedEnd: string;
};

type DowntimeLike = {
  machineId: string;
  from: string;
  to: string;
};

const cloneCapacityMap = (map: CapacityMap): CapacityMap =>
  JSON.parse(JSON.stringify(map)) as CapacityMap;

export const simulateScheduleForOrder = ({
  orderId,
  jobs,
  machines,
  skills,
  products,
  plans,
  downtimes,
  orderPriorityMap,
  now,
}: {
  orderId: string;
  jobs: SchedulerJob[];
  machines: MachineLike[];
  skills: SkillLike[];
  products: ProductLike[];
  plans: PlanLike[];
  downtimes: DowntimeLike[];
  orderPriorityMap: Record<string, number | undefined>;
  now: string;
}) => {
  const peopleIds = Array.from(new Set(skills.map((skill) => skill.personId)));
  const capacityMap = buildCapacityMap({
    machines,
    peopleIds,
    skills,
    plans,
    downtimes,
    now,
  });

  const orderJobs = jobs.filter((job) => job.orderId === orderId);
  const fixedJobs = orderJobs.filter((job) => job.status === "DONE" || job.status === "IN_PROGRESS");
  const remainingJobs = orderJobs.filter((job) => job.status === "WAITING" || job.status === "PLANNED");

  const lastFixedEnd = fixedJobs.reduce(
    (latest, job) => maxIso(latest, job.actualEnd, job.plannedEnd),
    undefined as string | undefined
  );

  const mutableCapacity = cloneCapacityMap(capacityMap);

  if (lastFixedEnd) {
    Object.values(mutableCapacity).forEach((personMap) => {
      Object.values(personMap).forEach((slot) => {
        if (new Date(slot.freeAt).getTime() < new Date(lastFixedEnd).getTime()) {
          slot.freeAt = lastFixedEnd;
        }
      });
    });
  }

  const { planned } = scheduleJobs({
    jobs: remainingJobs,
    machines,
    skills,
    products,
    capacityMap: mutableCapacity,
    allowChain: true,
    orderPriorityMap,
    now: lastFixedEnd || now,
  });

  const lastPlannedEnd = planned.reduce(
    (latest, plan) => maxIso(latest, plan.plannedEnd),
    lastFixedEnd
  );

  return {
    eta: lastPlannedEnd || lastFixedEnd || now,
    planned,
  };
};
