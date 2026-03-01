export const normalizeIso = (value?: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
  }
  if (typeof value === "object") {
    const maybeValue = value as { toMillis?: () => number; toDate?: () => Date };
    if (typeof maybeValue.toMillis === "function") {
      const millis = maybeValue.toMillis();
      if (Number.isFinite(millis)) return new Date(millis).toISOString();
    }
    if (typeof maybeValue.toDate === "function") {
      const date = maybeValue.toDate();
      if (date instanceof Date && Number.isFinite(date.getTime())) {
        return date.toISOString();
      }
    }
  }
  return undefined;
};

export const toMillis = (value?: unknown): number | undefined => {
  const iso = normalizeIso(value);
  if (!iso) return undefined;
  const millis = new Date(iso).getTime();
  return Number.isFinite(millis) ? millis : undefined;
};

export const maxIso = (...values: unknown[]): string | undefined => {
  const millis = values
    .map((value) => toMillis(value))
    .filter((value): value is number => Number.isFinite(value));
  if (millis.length === 0) return undefined;
  return new Date(Math.max(...millis)).toISOString();
};

export const IST_TIME_ZONE = "Asia/Kolkata";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat => {
  const key = `${timeZone}:${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-IN", { timeZone, ...options });
  formatterCache.set(key, formatter);
  return formatter;
};

const toDate = (value?: unknown): Date | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value === "object") {
    const candidate = value as { toDate?: () => Date; toMillis?: () => number };
    if (typeof candidate.toDate === "function") {
      const date = candidate.toDate();
      return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
    }
    if (typeof candidate.toMillis === "function") {
      const millis = candidate.toMillis();
      if (Number.isFinite(millis)) {
        const date = new Date(millis);
        return Number.isFinite(date.getTime()) ? date : null;
      }
    }
  }
  return null;
};

type DateRenderOptions = {
  timeZone?: string;
  placeholder?: string;
  includeSeconds?: boolean;
};

export const formatDateTimeInZone = (
  value?: unknown,
  options?: DateRenderOptions
): string => {
  const date = toDate(value);
  if (!date) return options?.placeholder ?? "-";
  const timeZone = options?.timeZone || IST_TIME_ZONE;
  const formatter = getFormatter(timeZone, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: options?.includeSeconds ? "2-digit" : undefined,
    hour12: false,
  });
  return formatter.format(date);
};

export const formatDateInZone = (value?: unknown, options?: DateRenderOptions): string => {
  const date = toDate(value);
  if (!date) return options?.placeholder ?? "-";
  const timeZone = options?.timeZone || IST_TIME_ZONE;
  const formatter = getFormatter(timeZone, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return formatter.format(date);
};

export const formatTimeInZone = (value?: unknown, options?: DateRenderOptions): string => {
  const date = toDate(value);
  if (!date) return options?.placeholder ?? "-";
  const timeZone = options?.timeZone || IST_TIME_ZONE;
  const formatter = getFormatter(timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    second: options?.includeSeconds ? "2-digit" : undefined,
    hour12: false,
  });
  return formatter.format(date);
};
