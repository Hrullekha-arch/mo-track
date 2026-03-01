// /src/lib/pms/autopilot.ts
import { getWorkingSchedule, WorkingHoursConfig } from "./working-hours";
// ✅ FIXED: No overlapping across orders (machine/person busy seeded from ALL plans)
// ✅ Chained steps inside group (Step-2 starts after Step-1 ends)
// ✅ Respects machine/person busy + downtime
// ✅ Works even if some planned jobs are not in the "jobs" input

export type AutopilotArgs = {
  jobs: any[];
  machines: any[];
  skills: any[];
  products: any[];
  plans: any[];
  downtimes: any[];
  orderPriorityMap?: Record<string, number | undefined>;
  now: string; // ISO
  workingHours?: WorkingHoursConfig;
};

const normalize = (v?: string) => String(v ?? "").trim().toLowerCase();

const maxIso = (...values: Array<string | undefined | null>) => {
  const valid = values.filter(Boolean) as string[];
  if (!valid.length) return new Date().toISOString();
  return new Date(Math.max(...valid.map((d) => new Date(d).getTime()))).toISOString();
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
    const conflict = blocks.find((b) => overlaps(schedule.start, schedule.end, b));
    if (!conflict) return schedule;
    candidate = conflict.to;
  }
};

function pickLatestPlanByJobId(plans: any[]) {
  const map = new Map<string, any>();

  for (const p of plans || []) {
    if (!p?.jobId) continue;

    const prev = map.get(p.jobId);
    const prevT = new Date(prev?.plannedEnd || prev?.plannedStart || 0).getTime();
    const nextT = new Date(p?.plannedEnd || p?.plannedStart || 0).getTime();

    if (!prev || nextT >= prevT) map.set(p.jobId, p);
  }

  return map;
}

function buildDowntimeByMachine(downtimes: any[]) {
  const map = new Map<string, Array<{ from: string; to: string }>>();

  for (const d of downtimes || []) {
    const machineId = d?.machineId;
    const from = d?.from;
    const to = d?.to;
    if (!machineId || !from || !to) continue;

    if (!map.has(machineId)) map.set(machineId, []);
    map.get(machineId)!.push({ from, to });
  }

  return map;
}

function groupKeyOf(job: any) {
  return job?.jobGroupId || (job?.productId ? `${job?.orderId}_${job?.productId}` : job?.orderId);
}

// ✅ NEW: seed busy maps from ALL plans (source of truth)
function seedBusyFromPlans(plans: any[], jobs: any[]) {
  const machineBusyUntil = new Map<string, string>();
  const personBusyUntil = new Map<string, string>();
  const statusByJobId = new Map<string, string>();

  for (const job of jobs || []) {
    if (!job?.id) continue;
    statusByJobId.set(String(job.id), String(job?.status || "").toUpperCase());
  }

  for (const p of plans || []) {
    const jobId = String(p?.jobId || "");
    if (!jobId || !statusByJobId.has(jobId)) continue;
    const status = statusByJobId.get(jobId);
    if (status !== "IN_PROGRESS" && status !== "PLANNED") continue;

    const end = p?.plannedEnd;
    if (!end) continue;

    const machineId = p?.machineId;
    const personId = p?.personId;

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
    plans,
    downtimes,
    orderPriorityMap = {},
    now,
    workingHours,
  } = args;

  const productById = new Map((products || []).map((p: any) => [p.id, p]));
  const planByJobId = pickLatestPlanByJobId(plans || []);
  const downtimeByMachine = buildDowntimeByMachine(downtimes || []);
  const activeMachines = (machines || []).filter((m: any) => m?.active !== false);

  // Seed busy maps from plans tied to current scheduling jobs only.
  const { machineBusyUntil, personBusyUntil } = seedBusyFromPlans(plans || [], jobs || []);

  // ✅ Group jobs (only jobs we are allowed to schedule are in "jobs" input)
  const groups = new Map<string, any[]>();
  for (const j of jobs || []) {
    if (!j?.orderId) continue;
    const k = groupKeyOf(j);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(j);
  }

  // ✅ Sort groups by order priority
  const sortedGroupKeys = Array.from(groups.keys()).sort((a, b) => {
    const aj = groups.get(a)?.[0];
    const bj = groups.get(b)?.[0];
    const ap = orderPriorityMap[aj?.orderId] ?? 999;
    const bp = orderPriorityMap[bj?.orderId] ?? 999;
    if (ap !== bp) return ap - bp;
    return String(aj?.orderId || "").localeCompare(String(bj?.orderId || ""));
  });

  const planned: any[] = [];
  const updatedJobs: any[] = [];

  for (const gk of sortedGroupKeys) {
    const groupJobs = groups.get(gk) || [];
    if (!groupJobs.length) continue;

    // ✅ Sort by stepNo (1,2,3,4...)
    const steps = [...groupJobs].sort((a, b) => (a?.stepNo || 0) - (b?.stepNo || 0));

    // ✅ Anchor: latest end among already-done/planned steps in this group
    // (no lexicographic issues; we compute by date)
    let anchor = now;
    for (const j of steps) {
      const status = String(j?.status || "").toUpperCase();
      if (status !== "DONE" && status !== "IN_PROGRESS" && status !== "PLANNED") {
        continue;
      }
      const p = planByJobId.get(j.id);
      const end = j?.actualEnd || j?.plannedEnd || p?.plannedEnd;
      if (end) anchor = maxIso(anchor, end);
    }

    for (const job of steps) {
      const plan = planByJobId.get(job.id);

      // DONE -> advance anchor and skip
      if (job?.status === "DONE") {
        const doneEnd = job?.actualEnd || job?.plannedEnd || plan?.plannedEnd;
        if (doneEnd) anchor = maxIso(anchor, doneEnd);
        continue;
      }

      // IN_PROGRESS -> advance anchor and skip
      if (job?.status === "IN_PROGRESS") {
        const ipEnd = job?.plannedEnd || plan?.plannedEnd;
        if (ipEnd) anchor = maxIso(anchor, ipEnd);
        continue;
      }

      // PLANNED -> advance anchor and skip
      if (job?.status === "PLANNED") {
        const pe = job?.plannedEnd || plan?.plannedEnd;
        if (pe) anchor = maxIso(anchor, pe);
        continue;
      }

      // only schedule WAITING
      if (job?.status !== "WAITING") continue;

      // required minutes
      const required = Number(job?.requiredMinutes || job?.durationMinutes || 0);
      if (!Number.isFinite(required) || required <= 0) continue;

      const processKey = normalize(job?.process);
      if (!processKey) continue;

      const product = job?.productId ? productById.get(job.productId) : null;
      const categoryKey = normalize(product?.category);

      // eligible machines by process
      const eligibleMachines = activeMachines.filter(
        (m: any) => normalize(m?.process) === processKey
      );
      if (!eligibleMachines.length) continue;

      // eligible machine-person pairs from skills
      const eligiblePairs: Array<{ machineId: string; personId: string }> = [];
      for (const m of eligibleMachines) {
        const machineSkills = (skills || []).filter((s: any) => {
          if (!s?.allowed) return false;
          if (s?.machineId !== m.id) return false;
          if (normalize(s?.process) !== processKey) return false;

          // if you don't use category in skills, remove this condition
          const skillCat = normalize(s?.category);
          if (categoryKey && skillCat && skillCat !== categoryKey) return false;

          return Boolean(s?.personId);
        });

        for (const s of machineSkills) {
          eligiblePairs.push({ machineId: m.id, personId: s.personId });
        }
      }
      if (!eligiblePairs.length) continue;

      // choose earliest possible start (respects anchor + busy + downtime)
      let best:
        | { machineId: string; personId: string; start: string; end: string }
        | null = null;

        for (const pair of eligiblePairs) {
          const busyM = machineBusyUntil.get(pair.machineId);
          const busyP = personBusyUntil.get(pair.personId);

          // ✅ CRITICAL: start must be >= anchor AND >= machine/person availability
          const baseStart = maxIso(anchor, busyM, busyP);

          // ✅ apply downtime + working hours window
          const blocks = downtimeByMachine.get(pair.machineId) || [];
          const schedule = buildScheduleWithDowntime(
            baseStart,
            required,
            blocks,
            workingHours
          );

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

      // ✅ update busy maps so next jobs (even other orders) cannot overlap
      machineBusyUntil.set(best.machineId, best.end);
      personBusyUntil.set(best.personId, best.end);

      // ✅ chain next step inside same group
      anchor = best.end;
    }
  }

  return { planned, updatedJobs };
}
