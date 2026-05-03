import { maxIso, normalizeIso, toMillis } from "./time";
import { getCanonicalPlans } from "./plan-utils";

export type CapacitySlot = {
  machineId: string;
  personId: string;
  freeAt: string;
  freeMinutes: number;
  plannedMinutes: number;
  activeMinutes: number;
  downtimeMinutes: number;
};

export type CapacityMap = Record<string, Record<string, CapacitySlot>>;

export type MachineLike = {
  id: string;
  process: string;
  shiftMinutes: number;
  active?: boolean;
};

export type PlanLike = {
  machineId: string;
  personId: string;
  plannedStart: string;
  plannedEnd: string;
};

export type DowntimeLike = {
  machineId: string;
  from: string;
  to: string;
};

export const minutesBetween = (start: string, end: string) => {
  const from = toMillis(start);
  const to = toMillis(end);
  if (from === undefined || to === undefined) return 0;
  return Math.max(0, Math.ceil((to - from) / 60000));
};

export const addWorkingMinutes = (startIso: string, minutes: number, shiftMinutes: number) => {
  const normalized = normalizeIso(startIso);
  const start = new Date(normalized || String(startIso || ""));
  if (!Number.isFinite(start.getTime())) return normalized || String(startIso || "");
  let remaining = Math.max(0, minutes);
  let cursor = start;
  const perDay = Math.max(1, shiftMinutes);

  while (remaining > 0) {
    const chunk = Math.min(perDay, remaining);
    cursor = new Date(cursor.getTime() + chunk * 60000);
    remaining -= chunk;
    if (remaining > 0) {
      cursor = new Date(cursor.getTime() + (24 * 60 - perDay) * 60000);
    }
  }

  return cursor.toISOString();
};

export const buildCapacityMap = ({
  machines,
  peopleIds,
  skills,
  plans,
  downtimes,
  now,
}: {
  machines: MachineLike[];
  peopleIds: string[];
  skills: Array<{ machineId: string; personId: string; allowed: boolean }>;
  plans: PlanLike[];
  downtimes: DowntimeLike[];
  now: string;
}): CapacityMap => {
  const canonicalPlans = getCanonicalPlans(
    plans as Array<PlanLike & { id?: string }>
  ).plans as PlanLike[];
  const map: CapacityMap = {};

  const planByMachine = new Map<string, PlanLike[]>();
  const planByPerson = new Map<string, PlanLike[]>();

  canonicalPlans.forEach((plan) => {
    if (!planByMachine.has(plan.machineId)) planByMachine.set(plan.machineId, []);
    planByMachine.get(plan.machineId)!.push(plan);

    if (!planByPerson.has(plan.personId)) planByPerson.set(plan.personId, []);
    planByPerson.get(plan.personId)!.push(plan);
  });

  const downtimeByMachine = new Map<string, DowntimeLike[]>();
  downtimes.forEach((entry) => {
    if (!downtimeByMachine.has(entry.machineId)) downtimeByMachine.set(entry.machineId, []);
    downtimeByMachine.get(entry.machineId)!.push(entry);
  });

  machines.forEach((machine) => {
    const machinePlans = planByMachine.get(machine.id) || [];
    const machineDowntimes = downtimeByMachine.get(machine.id) || [];

    const machinePlannedMinutes = machinePlans.reduce(
      (sum, plan) => sum + minutesBetween(plan.plannedStart, plan.plannedEnd),
      0
    );
    const machineDowntimeMinutes = machineDowntimes.reduce(
      (sum, down) => sum + minutesBetween(down.from, down.to),
      0
    );
    const machineFreeAt = maxIso(
      now,
      ...machinePlans.map((plan) => plan.plannedEnd),
      ...machineDowntimes.map((down) => down.to)
    );

    const allowedPeople = peopleIds.filter((personId) =>
      skills.some(
        (skill) =>
          skill.machineId === machine.id &&
          skill.personId === personId &&
          skill.allowed
      )
    );

    allowedPeople.forEach((personId) => {
      const personPlans = planByPerson.get(personId) || [];
      const personPlannedMinutes = personPlans.reduce(
        (sum, plan) => sum + minutesBetween(plan.plannedStart, plan.plannedEnd),
        0
      );

      const personFreeAt = maxIso(now, ...personPlans.map((plan) => plan.plannedEnd));
      const freeAt = maxIso(machineFreeAt, personFreeAt) || now;

      const usedMinutes = machinePlannedMinutes + machineDowntimeMinutes + personPlannedMinutes;
      const shiftMinutes = Math.max(1, machine.shiftMinutes || 0);
      const freeMinutes = Math.max(0, shiftMinutes - usedMinutes);

      if (!map[machine.id]) {
        map[machine.id] = {};
      }

      map[machine.id][personId] = {
        machineId: machine.id,
        personId,
        freeAt,
        freeMinutes,
        plannedMinutes: machinePlannedMinutes + personPlannedMinutes,
        activeMinutes: 0,
        downtimeMinutes: machineDowntimeMinutes,
      };
    });
  });

  return map;
};
