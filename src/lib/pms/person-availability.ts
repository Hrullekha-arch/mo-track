type PersonLike = {
  id?: string;
  active?: boolean | null;
  leaveFrom?: string | null;
  leaveTo?: string | null;
  leaveReason?: string | null;
  weekOffDay?: string | null;
};

const DEFAULT_OFFSET_MINUTES = 330;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const PMS_WEEK_OFF_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const WEEK_OFF_INDEX_BY_DAY = Object.fromEntries(
  PMS_WEEK_OFF_DAYS.map((day, index) => [day.toLowerCase(), index])
) as Record<string, number>;

export const isPmsPersonActive = (person?: PersonLike | null) => person?.active !== false;

export const getPmsPersonWeekOffDay = (person?: PersonLike | null) => {
  const raw = String(person?.weekOffDay || "").trim().toLowerCase();
  if (!raw) return undefined;
  const index = WEEK_OFF_INDEX_BY_DAY[raw];
  if (index === undefined) return undefined;
  return PMS_WEEK_OFF_DAYS[index];
};

export const isPmsPersonWeekOffAt = (
  person: PersonLike | null | undefined,
  atIso: string,
  offsetMinutes = DEFAULT_OFFSET_MINUTES
) => {
  const day = getPmsPersonWeekOffDay(person);
  if (!day) return false;
  const atDate = new Date(atIso);
  if (!Number.isFinite(atDate.getTime())) return false;
  const shifted = new Date(atDate.getTime() + offsetMinutes * 60_000);
  return shifted.getUTCDay() === WEEK_OFF_INDEX_BY_DAY[day.toLowerCase()];
};

export const getPmsPersonLeaveWindow = (person?: PersonLike | null) => {
  const from = String(person?.leaveFrom || "").trim();
  const to = String(person?.leaveTo || "").trim();
  if (!from || !to) return undefined;
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return undefined;
  return { from, to, fromMs, toMs };
};

export const isPmsPersonOnLeaveAt = (person: PersonLike | null | undefined, atIso: string) => {
  const leave = getPmsPersonLeaveWindow(person);
  if (!leave) return false;
  const atMs = new Date(atIso).getTime();
  if (!Number.isFinite(atMs)) return false;
  return atMs >= leave.fromMs && atMs < leave.toMs;
};

export const doesPmsPersonLeaveOverlap = (
  person: PersonLike | null | undefined,
  startIso?: string,
  endIso?: string
) => {
  const leave = getPmsPersonLeaveWindow(person);
  if (!leave || !startIso || !endIso) return false;
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return startMs < leave.toMs && endMs > leave.fromMs;
};

export const getPmsPersonWeekOffConflict = (
  person: PersonLike | null | undefined,
  startIso?: string,
  endIso?: string,
  offsetMinutes = DEFAULT_OFFSET_MINUTES
) => {
  const day = getPmsPersonWeekOffDay(person);
  if (!day || !startIso || !endIso) return undefined;
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return undefined;

  const shiftedStart = new Date(startMs + offsetMinutes * 60_000);
  const shiftedEnd = new Date(endMs + offsetMinutes * 60_000);
  const firstDayMs = Date.UTC(
    shiftedStart.getUTCFullYear(),
    shiftedStart.getUTCMonth(),
    shiftedStart.getUTCDate()
  );
  const lastDayMs = Date.UTC(
    shiftedEnd.getUTCFullYear(),
    shiftedEnd.getUTCMonth(),
    shiftedEnd.getUTCDate()
  );
  const weekOffIndex = WEEK_OFF_INDEX_BY_DAY[day.toLowerCase()];

  for (let cursorDayMs = firstDayMs; cursorDayMs <= lastDayMs; cursorDayMs += MS_PER_DAY) {
    const localDay = new Date(cursorDayMs);
    if (localDay.getUTCDay() !== weekOffIndex) continue;

    const offStartMs = cursorDayMs - offsetMinutes * 60_000;
    const offEndMs = offStartMs + MS_PER_DAY;
    if (startMs < offEndMs && endMs > offStartMs) {
      return {
        from: new Date(offStartMs).toISOString(),
        to: new Date(offEndMs).toISOString(),
      };
    }
  }

  return undefined;
};
