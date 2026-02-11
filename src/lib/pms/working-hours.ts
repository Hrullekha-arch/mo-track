export type WorkingHoursConfig = {
  startTime?: string;
  endTime?: string;
  timezoneOffsetMinutes?: number;
};

type NormalizedWorkingHours = {
  startMinute: number;
  endMinute: number;
  timezoneOffsetMinutes: number;
  isAllDay: boolean;
  isOvernight: boolean;
};

const DEFAULT_START = "10:00";
const DEFAULT_END = "20:00";

const parseTimeToMinutes = (value?: string): number | null => {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const normalizeWorkingHours = (config?: WorkingHoursConfig): NormalizedWorkingHours => {
  const startMinute =
    parseTimeToMinutes(config?.startTime) ?? parseTimeToMinutes(DEFAULT_START) ?? 0;
  const endMinute =
    parseTimeToMinutes(config?.endTime) ?? parseTimeToMinutes(DEFAULT_END) ?? 0;
  const timezoneOffsetMinutes = Number.isFinite(Number(config?.timezoneOffsetMinutes))
    ? Number(config?.timezoneOffsetMinutes)
    : 0;
  const isAllDay = startMinute === endMinute;
  const isOvernight = startMinute > endMinute;
  return { startMinute, endMinute, timezoneOffsetMinutes, isAllDay, isOvernight };
};

const getLocalParts = (date: Date, offsetMinutes: number) => {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    minutesOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
};

const makeUtcDate = (
  year: number,
  month: number,
  day: number,
  minutesOfDay: number,
  offsetMinutes: number
) => {
  const hours = Math.floor(minutesOfDay / 60);
  const minutes = minutesOfDay % 60;
  const utcMillis = Date.UTC(year, month, day, hours, minutes) - offsetMinutes * 60_000;
  return new Date(utcMillis);
};

const addLocalDays = (year: number, month: number, day: number, days: number) => {
  const utcMillis = Date.UTC(year, month, day) + days * 24 * 60 * 60_000;
  const next = new Date(utcMillis);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth(),
    day: next.getUTCDate(),
  };
};

const alignToWorkingTimeInternal = (startIso: string, normalized: NormalizedWorkingHours) => {
  const start = new Date(startIso);
  if (!Number.isFinite(start.getTime())) return startIso;
  if (normalized.isAllDay) return start.toISOString();

  const { year, month, day, minutesOfDay } = getLocalParts(
    start,
    normalized.timezoneOffsetMinutes
  );

  if (!normalized.isOvernight) {
    if (minutesOfDay < normalized.startMinute) {
      return makeUtcDate(
        year,
        month,
        day,
        normalized.startMinute,
        normalized.timezoneOffsetMinutes
      ).toISOString();
    }
    if (minutesOfDay >= normalized.endMinute) {
      const next = addLocalDays(year, month, day, 1);
      return makeUtcDate(
        next.year,
        next.month,
        next.day,
        normalized.startMinute,
        normalized.timezoneOffsetMinutes
      ).toISOString();
    }
    return start.toISOString();
  }

  if (minutesOfDay >= normalized.startMinute || minutesOfDay < normalized.endMinute) {
    return start.toISOString();
  }

  return makeUtcDate(
    year,
    month,
    day,
    normalized.startMinute,
    normalized.timezoneOffsetMinutes
  ).toISOString();
};

export const alignToWorkingTime = (startIso: string, config?: WorkingHoursConfig) =>
  alignToWorkingTimeInternal(startIso, normalizeWorkingHours(config));

export const getWorkingSchedule = (
  startIso: string,
  minutes: number,
  config?: WorkingHoursConfig
) => {
  const normalized = normalizeWorkingHours(config);
  const alignedStartIso = alignToWorkingTimeInternal(startIso, normalized);
  const alignedStart = new Date(alignedStartIso);
  if (!Number.isFinite(alignedStart.getTime())) {
    return { start: startIso, end: startIso };
  }

  const totalMinutes = Math.max(0, minutes);
  if (totalMinutes === 0) {
    return { start: alignedStartIso, end: alignedStartIso };
  }

  if (normalized.isAllDay) {
    const end = new Date(alignedStart.getTime() + totalMinutes * 60_000).toISOString();
    return { start: alignedStartIso, end };
  }

  let remaining = totalMinutes;
  let cursor = alignedStart;

  while (remaining > 0) {
    const { year, month, day, minutesOfDay } = getLocalParts(
      cursor,
      normalized.timezoneOffsetMinutes
    );

    if (!normalized.isOvernight) {
      if (minutesOfDay < normalized.startMinute) {
        cursor = makeUtcDate(
          year,
          month,
          day,
          normalized.startMinute,
          normalized.timezoneOffsetMinutes
        );
        continue;
      }
      if (minutesOfDay >= normalized.endMinute) {
        const next = addLocalDays(year, month, day, 1);
        cursor = makeUtcDate(
          next.year,
          next.month,
          next.day,
          normalized.startMinute,
          normalized.timezoneOffsetMinutes
        );
        continue;
      }

      const windowEnd = makeUtcDate(
        year,
        month,
        day,
        normalized.endMinute,
        normalized.timezoneOffsetMinutes
      );
      const available = Math.max(0, Math.ceil((windowEnd.getTime() - cursor.getTime()) / 60000));

      if (remaining <= available) {
        const end = new Date(cursor.getTime() + remaining * 60_000).toISOString();
        return { start: alignedStartIso, end };
      }

      remaining -= available;
      const next = addLocalDays(year, month, day, 1);
      cursor = makeUtcDate(
        next.year,
        next.month,
        next.day,
        normalized.startMinute,
        normalized.timezoneOffsetMinutes
      );
      continue;
    }

    if (!(minutesOfDay >= normalized.startMinute || minutesOfDay < normalized.endMinute)) {
      cursor = makeUtcDate(
        year,
        month,
        day,
        normalized.startMinute,
        normalized.timezoneOffsetMinutes
      );
      continue;
    }

    const endDay =
      minutesOfDay >= normalized.startMinute ? addLocalDays(year, month, day, 1) : { year, month, day };
    const windowEnd = makeUtcDate(
      endDay.year,
      endDay.month,
      endDay.day,
      normalized.endMinute,
      normalized.timezoneOffsetMinutes
    );
    const available = Math.max(0, Math.ceil((windowEnd.getTime() - cursor.getTime()) / 60000));

    if (remaining <= available) {
      const end = new Date(cursor.getTime() + remaining * 60_000).toISOString();
      return { start: alignedStartIso, end };
    }

    remaining -= available;
    cursor = makeUtcDate(
      endDay.year,
      endDay.month,
      endDay.day,
      normalized.startMinute,
      normalized.timezoneOffsetMinutes
    );
  }

  return { start: alignedStartIso, end: alignedStartIso };
};
