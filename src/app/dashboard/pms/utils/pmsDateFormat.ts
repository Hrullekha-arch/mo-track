import {
  formatDateInZone,
  formatDateTimeInZone,
  formatTimeInZone,
  IST_TIME_ZONE,
} from "@/lib/pms/time";

export const formatPmsDate = (value?: string | Date) =>
  formatDateInZone(value, {
    timeZone: IST_TIME_ZONE,
    placeholder: "-",
  });

export const formatPmsTime = (value?: string | Date) =>
  formatTimeInZone(value, {
    timeZone: IST_TIME_ZONE,
    placeholder: "-",
  });

export const formatPmsDateTime = (value?: string | Date) =>
  formatDateTimeInZone(value, {
    timeZone: IST_TIME_ZONE,
    placeholder: "-",
  });
