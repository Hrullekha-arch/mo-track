import { buildCapacityMap } from "./capacity";
import { scheduleJobs } from "./scheduler";

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

type JobLike = {
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

export const runAutopilot = ({
  jobs,
  machines,
  skills,
  products,
  plans,
  downtimes,
  orderPriorityMap,
  now,
}: {
  jobs: JobLike[];
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

  return scheduleJobs({
    jobs,
    machines,
    skills,
    products,
    capacityMap,
    allowChain: false,
    orderPriorityMap,
    now,
  });
};
