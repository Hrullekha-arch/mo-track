export const parseDate = (date: any): Date => {
  if (date instanceof Date && !isNaN(date.getTime())) return date;
  if (date && typeof date === "object" && "_seconds" in date) {
    return new Date(
      date._seconds * 1000 + (date._nanoseconds || 0) / 1000000
    );
  }
  if (typeof date === "string" || typeof date === "number") {
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

export const parseDateNullable = (date: any): Date | null => {
  if (!date) return null;
  const d = parseDate(date);
  return isNaN(d.getTime()) ? null : d;
};

export const safeFormat = (val: any, fmt = "PPP p"): string => {
  const d = parseDateNullable(val);
  if (!d) return "N/A";
  try {
    const { format } = require("date-fns");
    return format(d, fmt);
  } catch {
    return "N/A";
  }
};