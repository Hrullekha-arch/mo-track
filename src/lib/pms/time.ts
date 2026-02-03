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
