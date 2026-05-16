// /src/lib/pms/autopilot.ts
import { getCanonicalPlans } from "./plan-utils";
import { isManualCompletionProcess } from "./process-rules";
import { isPmsSkillEligible } from "./category-match";
import {
  getPmsPersonLeaveWindow,
  getPmsPersonWeekOffConflict,
  isPmsPersonActive,
  isPmsPersonOnLeaveAt,
} from "./person-availability";
import { getWorkingSchedule, WorkingHoursConfig } from "./working-hours";

export type AutopilotArgs = {
  jobs: any[];
  machines: any[];
  skills: any[];
  products: any[];
  peopleById?: Record<string, any>;
  plans: any[];
  downtimes: any[];
  orderPriorityMap?: Record<string, number | undefined>;
  now: string;
  workingHours?: WorkingHoursConfig;
};

const normalize = (value?: string) => String(value ?? "").trim().toLowerCase();

const maxIso = (...values: Array<string | undefined | null>) => {
  const valid = values.filter(Boolean) as string[];
  if (!valid.length) return new Date().toISOString();
  return new Date(Math.max(...valid.map((value) => new Date(value).getTime()))).toISOString();
};

const overlaps = (startIso: string, endIso: string, block: { from: string; to: string }) => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const from = new Date(block.from);
  const to = new Date(block.to);
  return start < to && end > from;
};

const buildScheduleWithDowntime = (
  startIso: string,
  durationMins: number,
  blocks: Array<{ from: string; to: string }>,
  workingHours?: WorkingHoursConfig
) => {
  let candidate = startIso;
  while (true) {
    const schedule = getWorkingSchedule(candidate, durationMins, workingHours);
    const conflict = blocks.find((block) => overlaps(schedule.start, schedule.end, block));
    if (!conflict) return schedule;
    candidate = conflict.to;
  }
};

function pickLatestPlanByJobId(plans: any[]) {
  const map = new Map<string, any>();

  for (const plan of plans || []) {
    if (!plan?.jobId) continue;

    const prev = map.get(plan.jobId);
    const prevT = new Date(prev?.plannedEnd || prev?.plannedStart || 0).getTime();
    const nextT = new Date(plan?.plannedEnd || plan?.plannedStart || 0).getTime();

    if (!prev || nextT >= prevT) map.set(plan.jobId, plan);
  }

  return map;
}

function buildDowntimeByMachine(downtimes: any[]) {
  const map = new Map<string, Array<{ from: string; to: string }>>();

  for (const downtime of downtimes || []) {
    const machineId = downtime?.machineId;
    const from = downtime?.from;
    const to = downtime?.to;
    if (!machineId || !from || !to) continue;

    if (!map.has(machineId)) map.set(machineId, []);
    map.get(machineId)!.push({ from, to });
  }

  return map;
}

function groupKeyOf(job: any) {
  return job?.jobGroupId || (job?.productId ? `${job?.orderId}_${job?.productId}` : job?.orderId);
}

function seedBusyFromPlans(plans: any[], jobs: any[]) {
  const machineBusyUntil = new Map<string, string>();
  const personBusyUntil = new Map<string, string>();
  const statusByJobId = new Map<string, string>();

  for (const job of jobs || []) {
    if (!job?.id) continue;
    statusByJobId.set(String(job.id), String(job?.status || "").toUpperCase());
  }

  for (const plan of plans || []) {
    const jobId = String(plan?.jobId || "");
    if (!jobId || !statusByJobId.has(jobId)) continue;
    const status = statusByJobId.get(jobId);
    if (status !== "IN_PROGRESS" && status !== "PLANNED") continue;

    const end = plan?.plannedEnd;
    if (!end) continue;

    const machineId = plan?.machineId;
    const personId = plan?.personId;

    if (machineId) machineBusyUntil.set(machineId, maxIso(machineBusyUntil.get(machineId), end));
    if (personId) personBusyUntil.set(personId, maxIso(personBusyUntil.get(personId), end));
  }

  return { machineBusyUntil, personBusyUntil };
}

export function runAutopilot(args: AutopilotArgs) {
  const {
    jobs,
    machines,
    skills,
    products,
    peopleById = {},
    plans,
    downtimes,
    orderPriorityMap = {},
    now,
    workingHours,
  } = args;

  const canonicalPlans = getCanonicalPlans(plans || []).plans;
  const productById = new Map((products || []).map((product: any) => [product.id, product]));
  const planByJobId = pickLatestPlanByJobId(canonicalPlans);
  const downtimeByMachine = buildDowntimeByMachine(downtimes || []);
  const activeMachines = (machines || []).filter((machine: any) => machine?.active !== false);
  const { machineBusyUntil, personBusyUntil } = seedBusyFromPlans(canonicalPlans, jobs || []);

  const groups = new Map<string, any[]>();
  for (const job of jobs || []) {
    if (!job?.orderId) continue;
    const key = groupKeyOf(job);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(job);
  }

  const sortedGroupKeys = Array.from(groups.keys()).sort((left, right) => {
    const leftJob = groups.get(left)?.[0];
    const rightJob = groups.get(right)?.[0];
    const leftPriority = orderPriorityMap[leftJob?.orderId] ?? 999;
    const rightPriority = orderPriorityMap[rightJob?.orderId] ?? 999;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return String(leftJob?.orderId || "").localeCompare(String(rightJob?.orderId || ""));
  });

  const planned: any[] = [];
  const updatedJobs: any[] = [];

  for (const groupKey of sortedGroupKeys) {
    const groupJobs = groups.get(groupKey) || [];
    if (!groupJobs.length) continue;

    const steps = [...groupJobs].sort((left, right) => (left?.stepNo || 0) - (right?.stepNo || 0));

    let anchor = now;
    for (const job of steps) {
      const status = String(job?.status || "").toUpperCase();
      if (status !== "DONE" && status !== "IN_PROGRESS" && status !== "PLANNED") {
        continue;
      }
      const plan = planByJobId.get(job.id);
      const end = job?.actualEnd || job?.plannedEnd || plan?.plannedEnd;
      if (end) anchor = maxIso(anchor, end);
    }

    for (const job of steps) {
      const plan = planByJobId.get(job.id);

      if (job?.status === "DONE") {
        const doneEnd = job?.actualEnd || job?.plannedEnd || plan?.plannedEnd;
        if (doneEnd) anchor = maxIso(anchor, doneEnd);
        continue;
      }

      if (job?.status === "IN_PROGRESS") {
        const inProgressEnd = job?.plannedEnd || plan?.plannedEnd;
        if (inProgressEnd) anchor = maxIso(anchor, inProgressEnd);
        continue;
      }

      if (job?.status === "PLANNED") {
        const plannedEnd = job?.plannedEnd || plan?.plannedEnd;
        if (plannedEnd) anchor = maxIso(anchor, plannedEnd);
        continue;
      }

      if (job?.status !== "WAITING") continue;
      if (isManualCompletionProcess(job?.process)) break;

      const required = Number(job?.requiredMinutes || job?.durationMinutes || 0);
      if (!Number.isFinite(required) || required <= 0) continue;

      const processKey = normalize(job?.process);
      if (!processKey) continue;

      const product = job?.productId ? productById.get(job.productId) : null;
      const categoryKey = normalize(product?.category);

      const eligibleMachines = activeMachines.filter(
        (machine: any) => normalize(machine?.process) === processKey
      );
      if (!eligibleMachines.length) continue;

      const eligiblePairs: Array<{ machineId: string; personId: string }> = [];
      for (const machine of eligibleMachines) {
        const machineSkills = (skills || []).filter((skill: any) => {
          if (!skill?.allowed) return false;
          if (skill?.machineId !== machine.id) return false;
          if (normalize(skill?.process) !== processKey) return false;

          return isPmsSkillEligible({
            process: job?.process,
            productCategory: categoryKey,
            skillCategory: skill?.category,
          });
        });

        for (const skill of machineSkills) {
          const personId = String(skill?.personId || "");
          if (!personId) continue;
          const person = peopleById[personId];
          if (person && !isPmsPersonActive(person)) continue;
          if (person && isPmsPersonOnLeaveAt(person, anchor)) continue;
          eligiblePairs.push({ machineId: machine.id, personId });
        }
      }
      if (!eligiblePairs.length) continue;

      let best: { machineId: string; personId: string; start: string; end: string } | null = null;

      for (const pair of eligiblePairs) {
        const busyMachineUntil = machineBusyUntil.get(pair.machineId);
        const busyPersonUntil = personBusyUntil.get(pair.personId);
        let baseStart = maxIso(anchor, busyMachineUntil, busyPersonUntil);

        const blocks = [...(downtimeByMachine.get(pair.machineId) || [])];
        const person = peopleById[String(pair.personId || "")];
        const leaveWindow = getPmsPersonLeaveWindow(person);
        if (leaveWindow) {
          blocks.push({ from: leaveWindow.from, to: leaveWindow.to });
        }

        let schedule = buildScheduleWithDowntime(baseStart, required, blocks, workingHours);
        let guard = 0;
        while (guard < 7) {
          const weekOffConflict = getPmsPersonWeekOffConflict(
            person,
            schedule.start,
            schedule.end,
            workingHours?.timezoneOffsetMinutes
          );
          if (!weekOffConflict) break;
          baseStart = weekOffConflict.to;
          schedule = buildScheduleWithDowntime(baseStart, required, blocks, workingHours);
          guard += 1;
        }

        const start = schedule.start;
        const end = schedule.end;

        if (!best || new Date(start).getTime() < new Date(best.start).getTime()) {
          best = { ...pair, start, end };
        }
      }

      if (!best) continue;

      updatedJobs.push({
        ...job,
        status: "PLANNED",
        plannedStart: best.start,
        plannedEnd: best.end,
      });

      planned.push({
        jobId: job.id,
        orderId: job.orderId,
        jobGroupId: job.jobGroupId || null,
        productId: job.productId || null,
        stepNo: job.stepNo || null,
        process: job.process || null,
        machineId: best.machineId,
        personId: best.personId,
        plannedStart: best.start,
        plannedEnd: best.end,
        requiredMinutes: required,
      });

      machineBusyUntil.set(best.machineId, best.end);
      personBusyUntil.set(best.personId, best.end);
      anchor = best.end;
    }
  }

  return { planned, updatedJobs };
}
