import { format } from "date-fns";
import type {
  AttendanceRecord,
  AttendanceSummary,
  HrEmployee,
  HrExitFormState,
  HrHoliday,
  HrHolidayFormState,
  HrLeaveFormState,
  HrLeaveRequest,
  PayrollRecord,
} from "../types";

// ─── Shared helpers (inlined to avoid circular deps) ─────────────────────────

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const exportCsvInternal = (filename: string, rows: (string | number | undefined | null)[][]) => {
  const content = rows
    .map((row) =>
      row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

// private label maps (canonical versions live in parent utils.ts)
const ATTENDANCE_STATUS_LABELS_LOCAL: Record<AttendanceRecord["status"], string> = {
  present: "Present",
  absent: "Absent",
  missed_punch: "Missed Punch",
  half_day: "Half Day",
  late: "Late",
  holiday: "Holiday",
  week_off: "Week Off",
  week_off_present: "Week Off Present",
  on_leave: "On Leave",
};

const LEAVE_TYPE_LABELS_LOCAL: Record<HrLeaveRequest["leaveType"], string> = {
  casual: "Casual Leave",
  sick: "Sick Leave",
  earned: "Earned Leave",
  unpaid: "Unpaid Leave",
};

const MONTH_NAMES_LOCAL = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ─── Leave utilities ──────────────────────────────────────────────────────────

const LEAVE_PROBATION_MONTHS = 6;
const LEAVE_PROBATION_MONTHLY_ACCRUAL = 1;
const LEAVE_MONTHLY_ACCRUAL = 2.4;
const LEAVE_HALF_DAY_MONTHLY_ALLOWANCE = 1;
const LEAVE_SHORT_LEAVE_MONTHLY_ALLOWANCE = 1;

const getMonthStart = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);

const monthDiffInclusive = (start: Date, end: Date) =>
  (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;

export const calcLeaveDays = (fromDate: string, toDate: string): number => {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
};

export const getMonthlyLeaveBalance = (
  leaveRequests: HrLeaveRequest[],
  employeeId: string,
  employee?: Pick<HrEmployee, "joiningDate"> | null,
  referenceDate = new Date()
): {
  accrued: number;
  used: number;
  balance: number;
  monthsAccrued: number;
  label: string;
  monthlyPaidLeave: number;
  monthlyHalfDayLeave: number;
  monthlyShortLeave: number;
} => {
  const year = referenceDate.getFullYear();
  const monthIndex = referenceDate.getMonth();
  const startOfYear = new Date(year, 0, 1);
  const referenceMonthStart = getMonthStart(referenceDate);
  const parsedJoiningDate = employee?.joiningDate ? new Date(employee.joiningDate) : null;
  const validJoiningDate = parsedJoiningDate && !Number.isNaN(parsedJoiningDate.getTime()) ? parsedJoiningDate : null;
  const joiningMonthStart = validJoiningDate ? getMonthStart(validJoiningDate) : null;
  const accrualStart = joiningMonthStart && joiningMonthStart > startOfYear ? joiningMonthStart : startOfYear;

  let accrued = 0;
  let monthsAccrued = 0;

  if (accrualStart <= referenceMonthStart) {
    const cursor = new Date(accrualStart);
    while (cursor <= referenceMonthStart) {
      monthsAccrued += 1;
      const serviceMonthNumber = joiningMonthStart ? monthDiffInclusive(joiningMonthStart, cursor) : monthsAccrued;
      accrued += serviceMonthNumber <= LEAVE_PROBATION_MONTHS
        ? LEAVE_PROBATION_MONTHLY_ACCRUAL
        : LEAVE_MONTHLY_ACCRUAL;
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  accrued = parseFloat(accrued.toFixed(1));
  const currentServiceMonthNumber = joiningMonthStart ? monthDiffInclusive(joiningMonthStart, referenceMonthStart) : monthsAccrued;
  const monthlyPaidLeave = currentServiceMonthNumber <= LEAVE_PROBATION_MONTHS
    ? LEAVE_PROBATION_MONTHLY_ACCRUAL
    : LEAVE_MONTHLY_ACCRUAL;

  const used = leaveRequests
    .filter(
      (r) =>
        r.employeeId === employeeId &&
        r.status === "approved" &&
        r.leaveType !== "unpaid" &&
        r.fromDate.startsWith(String(year))
    )
    .reduce((sum, r) => sum + r.days, 0);

  const balance = parseFloat(Math.max(accrued - used, 0).toFixed(1));
  const label = `${MONTH_NAMES_LOCAL[accrualStart.getMonth()]} - ${MONTH_NAMES_LOCAL[monthIndex]}`;
  return {
    accrued,
    used,
    balance,
    monthsAccrued,
    label,
    monthlyPaidLeave,
    monthlyHalfDayLeave: LEAVE_HALF_DAY_MONTHLY_ALLOWANCE,
    monthlyShortLeave: LEAVE_SHORT_LEAVE_MONTHLY_ALLOWANCE,
  };
};

export const getLeaveBalance = (
  leaveRequests: HrLeaveRequest[],
  employeeId: string,
  leaveType: HrLeaveRequest["leaveType"]
) => {
  const year = new Date().getFullYear();
  const used = leaveRequests
    .filter(
      (r) =>
        r.employeeId === employeeId &&
        r.leaveType === leaveType &&
        r.status === "approved" &&
        r.fromDate.startsWith(String(year))
    )
    .reduce((sum, r) => sum + r.days, 0);
  return { allocated: 0, used, balance: 0 };
};

export const createLeaveFormState = (employeeId = ""): HrLeaveFormState => ({
  employeeId,
  leaveType: "casual",
  fromDate: format(new Date(), "yyyy-MM-dd"),
  toDate: format(new Date(), "yyyy-MM-dd"),
  reason: "",
  handoverId: "",
});

// ─── Exit & FnF utilities ─────────────────────────────────────────────────────

export const createExitFormState = (employeeId = ""): HrExitFormState => ({
  employeeId,
  exitType: "resignation",
  noticePeriodDays: "30",
  lastWorkingDay: "",
  exitDate: format(new Date(), "yyyy-MM-dd"),
  clearanceStatus: "pending",
  assetHandoverStatus: "pending",
  backupEmailStatus: "pending",
  fnfStatus: "pending",
  remarks: "",
});

export const calcFnfAmount = (
  lastPayroll: PayrollRecord | undefined,
  daysWorked: number,
  workingDays: number
): number => {
  if (!lastPayroll || workingDays <= 0) return 0;
  const ratio = daysWorked / workingDays;
  return roundMoney(lastPayroll.grossEarnings * ratio);
};

// ─── Attendance parsing ───────────────────────────────────────────────────────

const SSL_STATUS_MAP: Record<string, AttendanceRecord["status"]> = {
  p: "present",
  present: "present",
  mp: "missed_punch",
  "missed punch": "missed_punch",
  missedpunch: "missed_punch",
  wop: "week_off_present",
  "week off present": "week_off_present",
  "weekoffpresent": "week_off_present",
  a: "absent",
  absent: "absent",
  h: "holiday",
  holiday: "holiday",
  wo: "week_off",
  "week off": "week_off",
  weekoff: "week_off",
  hl: "half_day",
  "half day": "half_day",
  halfday: "half_day",
  l: "late",
  late: "late",
  ol: "on_leave",
  "on leave": "on_leave",
  onleave: "on_leave",
  lv: "on_leave",
  leave: "on_leave",
};

const parseSSLStatus = (raw: string): AttendanceRecord["status"] => {
  const key = raw.trim().toLowerCase();
  return SSL_STATUS_MAP[key] || (key ? "present" : "absent");
};

export const ATTENDANCE_GRACE_MINUTES = 14;
export const ATTENDANCE_MAX_LATE_MINUTES = 60;
export const ATTENDANCE_LATE_TO_HALF_DAY_COUNT = 3;
// Up to 2 half-days per month are forgiven; only excess counts toward LOP
export const ATTENDANCE_HALF_DAY_GRACE_COUNT = 2;
const ATTENDANCE_START_TIME = "10:00"; // HH:MM — standard shift start
const ATTENDANCE_DUTY_HOURS = 10;
const ATTENDANCE_HALF_DAY_DEVIATION_MINUTES = 180;

const getMonthDayCount = (month: string) => {
  if (!/^\d{4}-\d{2}$/.test(month)) return 30;
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return 30;
  return new Date(year, monthIndex, 0).getDate();
};

const parseTimeToMinutes = (time: string): number | null => {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
};

const formatMinutesToTime = (minutes: number) => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
};

const resolveDutyWindow = (employee?: Pick<HrEmployee, "timesheetDutyStart" | "timesheetDutyEnd"> | null) => {
  const startTime = employee?.timesheetDutyStart || ATTENDANCE_START_TIME;
  const startMinutes = parseTimeToMinutes(startTime) ?? parseTimeToMinutes(ATTENDANCE_START_TIME) ?? 600;
  const endTime = employee?.timesheetDutyEnd || formatMinutesToTime(startMinutes + ATTENDANCE_DUTY_HOURS * 60);
  const endMinutes = parseTimeToMinutes(endTime) ?? startMinutes + ATTENDANCE_DUTY_HOURS * 60;
  return {
    startTime,
    endTime,
    startMinutes,
    endMinutes,
  };
};

const applyAttendanceTimingPolicy = (
  status: AttendanceRecord["status"],
  inTime?: string,
  outTime?: string,
  employee?: Pick<HrEmployee, "timesheetDutyStart" | "timesheetDutyEnd"> | null
): AttendanceRecord["status"] => {
  const hasInTime = Boolean(inTime?.trim());
  const hasOutTime = Boolean(outTime?.trim());

  if (hasInTime !== hasOutTime && !["absent", "holiday", "week_off", "on_leave"].includes(status)) {
    return "missed_punch";
  }

  const normalizedStatus = status === "missed_punch" ? "present" : status;
  if (!hasInTime) return normalizedStatus;
  if (!["present", "late", "half_day"].includes(normalizedStatus)) return normalizedStatus;
  const { startMinutes, endMinutes } = resolveDutyWindow(employee);
  const graceLimit = startMinutes + ATTENDANCE_GRACE_MINUTES;
  const inMins = parseTimeToMinutes(inTime!);
  if (inMins === null) return normalizedStatus;
  const outMins = outTime ? parseTimeToMinutes(outTime) : null;
  const lateByMinutes = Math.max(inMins - startMinutes, 0);
  const earlyByMinutes = outMins === null ? 0 : Math.max(endMinutes - outMins, 0);
  const totalDutyLossMinutes = lateByMinutes + earlyByMinutes;

  if (totalDutyLossMinutes >= ATTENDANCE_HALF_DAY_DEVIATION_MINUTES) return "half_day";
  if (earlyByMinutes > ATTENDANCE_GRACE_MINUTES) return "late";
  if (inMins <= graceLimit) return "present";
  if (lateByMinutes <= ATTENDANCE_MAX_LATE_MINUTES) return "late";
  return "late";
};

export const resolveAttendanceStatusWithPolicy = (
  record: Pick<AttendanceRecord, "status" | "inTime" | "outTime">,
  employee?: Pick<HrEmployee, "timesheetDutyStart" | "timesheetDutyEnd"> | null
): AttendanceRecord["status"] =>
  applyAttendanceTimingPolicy(record.status, record.inTime, record.outTime, employee);

const parseDdMmYyyy = (value: string): string | null => {
  const clean = value.trim().replace(/\//g, "-");
  const parts = clean.split("-");
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (c && c.length === 4) return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    if (a && a.length === 4) return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
  }
  const d = new Date(value);
  if (!isNaN(d.getTime())) return format(d, "yyyy-MM-dd");
  return null;
};

export type SSLParseResult = {
  rows: (Omit<AttendanceRecord, "id" | "employeeId" | "employeeName" | "uploadedAt"> & {
    importedEmployeeName?: string;
  })[];
  warnings: string[];
  rawCount: number;
};

const normalizeHeaderCell = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const STRUCTURED_CODE_CANDIDATES = [
  "empcode",
  "employeecode",
  "employeeid",
  "empid",
  "userid",
  "deviceuserid",
  "enrollno",
  "enrollid",
  "enroll",
  "staffcode",
  "code",
];

const STRUCTURED_DATE_CANDIDATES = [
  "attendancedate",
  "workdate",
  "logdate",
  "punchdate",
  "date",
];

const STRUCTURED_IN_TIME_CANDIDATES = [
  "firstcheckin",
  "firstin",
  "checkin",
  "intime",
  "punchin",
  "in",
];

const STRUCTURED_OUT_TIME_CANDIDATES = [
  "lastcheckout",
  "lastout",
  "checkout",
  "outtime",
  "punchout",
  "out",
];

const STRUCTURED_STATUS_CANDIDATES = ["status", "attendance", "attstatus", "att"];
const STRUCTURED_DURATION_CANDIDATES = ["workduration", "duration", "workinghours", "hoursworked"];

const findColumnIndex = (headers: string[], candidates: string[]) => {
  for (const candidate of candidates) {
    const index = headers.findIndex((header) => header && header.includes(candidate));
    if (index !== -1) return index;
  }
  return -1;
};

const resolveStructuredColumnIndexes = (headers: string[]) => ({
  codeIdx: findColumnIndex(headers, STRUCTURED_CODE_CANDIDATES),
  dateIdx: findColumnIndex(headers, STRUCTURED_DATE_CANDIDATES),
  inIdx: findColumnIndex(headers, STRUCTURED_IN_TIME_CANDIDATES),
  outIdx: findColumnIndex(headers, STRUCTURED_OUT_TIME_CANDIDATES),
  statusIdx: findColumnIndex(headers, STRUCTURED_STATUS_CANDIDATES),
  durationIdx: findColumnIndex(headers, STRUCTURED_DURATION_CANDIDATES),
});

const hasStructuredAttendanceHeaders = (headers: string[]) => {
  const { codeIdx, dateIdx, inIdx, outIdx, statusIdx, durationIdx } = resolveStructuredColumnIndexes(headers);
  return dateIdx !== -1 && (codeIdx !== -1 || inIdx !== -1 || outIdx !== -1 || statusIdx !== -1 || durationIdx !== -1);
};

const resolveImportedStatus = (
  rawStatus: string,
  rawInTime?: string,
  rawOutTime?: string,
  rawDuration?: string
): AttendanceRecord["status"] => {
  if (rawStatus.trim()) {
    return applyAttendanceTimingPolicy(parseSSLStatus(rawStatus), rawInTime, rawOutTime);
  }

  if ((rawInTime && rawInTime.trim()) || (rawOutTime && rawOutTime.trim()) || (rawDuration && rawDuration.trim())) {
    return applyAttendanceTimingPolicy("present", rawInTime, rawOutTime);
  }

  return "absent";
};

const parseDateRangeFromCells = (lines: string[][]): Date[] => {
  const searchText = lines
    .slice(0, 12)
    .flat()
    .join(" ");
  const match = searchText.match(
    /([A-Za-z]{3,9}\s+\d{1,2}\s+\d{4})\s+To\s+([A-Za-z]{3,9}\s+\d{1,2}\s+\d{4})/i
  );

  if (!match) return [];

  const start = new Date(match[1]);
  const end = new Date(match[2]);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }

  const dates: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

const findValueAfterLabel = (cells: string[], labelPattern: RegExp) => {
  const labelIndex = cells.findIndex((cell) => labelPattern.test(cell.trim()));
  if (labelIndex === -1) return "";
  for (let index = labelIndex + 1; index < cells.length; index += 1) {
    const value = String(cells[index] || "").trim();
    if (value) return value;
  }
  return "";
};

const parseMonthDayColumns = (lines: string[][], reportDates: Date[]) => {
  const baseDate = reportDates[0];
  if (!baseDate) return [];

  const daysRow = lines.find((row) => row.some((cell) => /^days$/i.test(cell.trim())));
  if (!daysRow) return [];

  return daysRow
    .map((cell, columnIndex) => {
      const match = cell.trim().match(/^(\d{1,2})\b/);
      if (!match) return null;

      const day = Number(match[1]);
      const date = new Date(baseDate.getFullYear(), baseDate.getMonth(), day);
      if (Number.isNaN(date.getTime())) return null;
      if (!reportDates.some((entry) => format(entry, "yyyy-MM-dd") === format(date, "yyyy-MM-dd"))) {
        return null;
      }

      return { columnIndex, date };
    })
    .filter((entry): entry is { columnIndex: number; date: Date } => Boolean(entry));
};

const parseMonthlyStatusReportMatrix = (lines: string[][]): SSLParseResult | null => {
  const hasMonthlyTitle = lines.some((row) =>
    row.some((cell) => /monthly\s+status\s+report/i.test(cell) && /basic\s+work\s+duration/i.test(cell))
  );

  if (!hasMonthlyTitle) return null;

  const reportDates = parseDateRangeFromCells(lines);
  if (!reportDates.length) {
    return {
      rows: [],
      warnings: ["Could not read the report date range from the monthly status sheet."],
      rawCount: 0,
    };
  }

  const rows: SSLParseResult["rows"] = [];
  const warnings: string[] = [];
  const dayColumns = parseMonthDayColumns(lines, reportDates);

  for (let rowIndex = 0; rowIndex < lines.length; rowIndex += 1) {
    const cells = lines[rowIndex];
    const hasEmpCode = cells.some((cell) => /^emp\.?\s*code\s*:?\s*$/i.test(cell.trim()));
    if (!hasEmpCode) continue;

    const employeeCode = findValueAfterLabel(cells, /^emp\.?\s*code\s*:?\s*$/i);
    const employeeName = findValueAfterLabel(cells, /^emp\.?\s*name\s*:?\s*$/i);
    if (!employeeCode) {
      warnings.push(`Row ${rowIndex + 1}: employee code not found in monthly report block.`);
      continue;
    }

    const statusRow = lines[rowIndex + 1] || [];
    const inTimeRow = lines[rowIndex + 2] || [];
    const outTimeRow = lines[rowIndex + 3] || [];
    const totalRow = lines[rowIndex + 4] || [];

    const statusLabelIndex = statusRow.findIndex((cell) => /^status$/i.test(cell.trim()));
    if (statusLabelIndex === -1) {
      warnings.push(`Employee ${employeeCode}: status row missing.`);
      continue;
    }

    const employeeDayColumns = dayColumns.length
      ? dayColumns.filter((entry) => entry.columnIndex > statusLabelIndex)
      : reportDates.map((dateValue, dayOffset) => ({
          columnIndex: statusLabelIndex + 1 + dayOffset,
          date: dateValue,
        }));

    employeeDayColumns.forEach(({ columnIndex, date }) => {
      const rawStatus = String(statusRow[columnIndex] || "").trim();
      const rawInTime = String(inTimeRow[columnIndex] || "").trim() || undefined;
      const rawOutTime = String(outTimeRow[columnIndex] || "").trim() || undefined;
      const rawDuration = String(totalRow[columnIndex] || "").trim() || undefined;

      if (![rawStatus, rawInTime, rawOutTime, rawDuration].some(Boolean)) {
        return;
      }

      rows.push({
        employeeCode,
        importedEmployeeName: employeeName || undefined,
        date: format(date, "yyyy-MM-dd"),
        inTime: rawInTime,
        outTime: rawOutTime,
        status: resolveImportedStatus(rawStatus, rawInTime, rawOutTime, rawDuration),
        source: "biometric",
      });
    });
  }

  if (!rows.length) {
    return {
      rows: [],
      warnings: ["Monthly status report was found, but no employee attendance blocks could be converted."],
      rawCount: 0,
    };
  }

  return { rows, warnings, rawCount: rows.length };
};

const parseStructuredAttendanceRows = (
  lines: string[][],
  missingHeaderMessage: string,
  missingDateMessage: string
): SSLParseResult => {
  const headerRowIndex = lines.findIndex((cells, index) => {
    if (index > 11) return false;
    return hasStructuredAttendanceHeaders(cells.map(normalizeHeaderCell));
  });

  if (headerRowIndex === -1) {
    return {
      rows: [],
      warnings: [missingHeaderMessage],
      rawCount: Math.max(lines.length - 1, 0),
    };
  }

  const headers = lines[headerRowIndex].map(normalizeHeaderCell);
  const rows: SSLParseResult["rows"] = [];
  const warnings: string[] = [];
  const { codeIdx, dateIdx, inIdx, outIdx, statusIdx, durationIdx } = resolveStructuredColumnIndexes(headers);

  if (dateIdx === -1) {
    return {
      rows: [],
      warnings: [missingDateMessage],
      rawCount: Math.max(lines.length - headerRowIndex - 1, 0),
    };
  }

  const dataRows = lines.slice(headerRowIndex + 1);
  dataRows.forEach((cells, index) => {
    const rawDate = cells[dateIdx] || "";
    const rawCode = codeIdx !== -1 ? cells[codeIdx] || "" : "";
    const rawInTime = inIdx !== -1 ? cells[inIdx] || undefined : undefined;
    const rawOutTime = outIdx !== -1 ? cells[outIdx] || undefined : undefined;
    const rawStatus = statusIdx !== -1 ? cells[statusIdx] || "" : "";
    const rawDuration = durationIdx !== -1 ? cells[durationIdx] || "" : "";

    if (![rawDate, rawCode, rawInTime, rawOutTime, rawStatus, rawDuration].some((value) => String(value || "").trim())) {
      return;
    }

    const parsedDate = parseDdMmYyyy(rawDate);
    if (!parsedDate) {
      warnings.push(`Row ${headerRowIndex + index + 2}: skipped - unrecognised date "${rawDate}"`);
      return;
    }

    rows.push({
      employeeCode: rawCode || undefined,
      date: parsedDate,
      inTime: rawInTime || undefined,
      outTime: rawOutTime || undefined,
      status: resolveImportedStatus(rawStatus, rawInTime, rawOutTime, rawDuration),
      source: "biometric",
    });
  });

  return { rows, warnings, rawCount: dataRows.length };
};

const parseWorksheetMatrix = (matrix: unknown[][]): SSLParseResult => {
  const lines = matrix
    .map((row) =>
      Array.isArray(row)
        ? Array.from(row, (cell) => String(cell ?? "").trim())
        : []
    )
    .filter((row) => row.some(Boolean));

  if (lines.length < 2) {
    return { rows: [], warnings: ["File is empty or has no data rows."], rawCount: 0 };
  }

  const monthlyStatusResult = parseMonthlyStatusReportMatrix(lines);
  if (monthlyStatusResult) {
    return monthlyStatusResult;
  }

  return parseStructuredAttendanceRows(
    lines,
    "Could not find attendance headers. Use a sheet with employee code, date, and in/out or work duration columns.",
    "Could not find a 'Date' column in the file."
  );
};

export const parseSSLAttendanceCsv = (csvText: string): SSLParseResult => {
  const parseCsvLine = (line: string) => {
    const cells: string[] = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
        continue;
      }
      if (char === "," && !insideQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }

    cells.push(current.trim());
    return cells;
  };

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => parseCsvLine(line))
    .filter((row) => row.some((cell) => cell.trim()));

  if (lines.length < 2) return { rows: [], warnings: ["File is empty or has no data rows."], rawCount: 0 };

  const headerRowIndex = lines.findIndex((cells, index) => {
    if (index > 11) return false;
    const headers = cells.map(normalizeHeaderCell);
    const codeIdx = findColumnIndex(headers, ["empcode", "employeecode", "employeeid", "empid", "userid", "enrollno", "enroll", "staffcode", "code"]);
    const dateIdx = findColumnIndex(headers, ["attendancedate", "workdate", "logdate", "punchdate", "date"]);
    const inIdx = findColumnIndex(headers, ["firstcheckin", "firstin", "checkin", "intime", "punchin", "in"]);
    const outIdx = findColumnIndex(headers, ["lastcheckout", "lastout", "checkout", "outtime", "punchout", "out"]);
    const statusIdx = findColumnIndex(headers, ["status", "attendance", "attstatus", "att"]);
    const durationIdx = findColumnIndex(headers, ["workduration", "duration", "workinghours", "hoursworked"]);
    return dateIdx !== -1 && (codeIdx !== -1 || inIdx !== -1 || outIdx !== -1 || statusIdx !== -1 || durationIdx !== -1);
  });

  if (headerRowIndex === -1) {
    return {
      rows: [],
      warnings: [
        "Could not find attendance headers. Use a CSV with employee code, date, and in/out or work duration columns.",
      ],
      rawCount: Math.max(lines.length - 1, 0),
    };
  }

  const headers = lines[headerRowIndex].map(normalizeHeaderCell);
  const rows: SSLParseResult["rows"] = [];
  const warnings: string[] = [];

  const codeIdx = findColumnIndex(headers, ["empcode", "employeecode", "employeeid", "empid", "userid", "deviceuserid", "enrollno", "enrollid", "enroll", "staffcode", "code"]);
  const dateIdx = findColumnIndex(headers, ["attendancedate", "workdate", "logdate", "punchdate", "date"]);
  const inIdx = findColumnIndex(headers, ["firstcheckin", "firstin", "checkin", "intime", "punchin", "in"]);
  const outIdx = findColumnIndex(headers, ["lastcheckout", "lastout", "checkout", "outtime", "punchout", "out"]);
  const statusIdx = findColumnIndex(headers, ["status", "attendance", "attstatus", "att"]);
  const durationIdx = findColumnIndex(headers, ["workduration", "duration", "workinghours", "hoursworked"]);

  if (dateIdx === -1) {
    return {
      rows: [],
      warnings: ["Could not find a 'Date' column in the CSV."],
      rawCount: Math.max(lines.length - headerRowIndex - 1, 0),
    };
  }

  const dataRows = lines.slice(headerRowIndex + 1);
  dataRows.forEach((cells, i) => {
    const rawDate = cells[dateIdx] || "";
    const rawCode = codeIdx !== -1 ? cells[codeIdx] || "" : "";
    const rawInTime = inIdx !== -1 ? cells[inIdx] || undefined : undefined;
    const rawOutTime = outIdx !== -1 ? cells[outIdx] || undefined : undefined;
    const rawStatus = statusIdx !== -1 ? cells[statusIdx] || "" : "";
    const rawDuration = durationIdx !== -1 ? cells[durationIdx] || "" : "";

    if (![rawDate, rawCode, rawInTime, rawOutTime, rawStatus, rawDuration].some((value) => String(value || "").trim())) {
      return;
    }

    const parsedDate = parseDdMmYyyy(rawDate);
    if (!parsedDate) {
      warnings.push(`Row ${i + 2}: skipped — unrecognised date "${rawDate}"`);
      return;
    }
    rows.push({
      employeeCode: rawCode || undefined,
      date: parsedDate,
      inTime: rawInTime || undefined,
      outTime: rawOutTime || undefined,
      status: resolveImportedStatus(rawStatus, rawInTime, rawOutTime, rawDuration),
      source: "biometric",
    });
  });

  return { rows, warnings, rawCount: dataRows.length };
};

export const parseSSLAttendanceFile = async (file: File): Promise<SSLParseResult> => {
  const fileName = file.name.toLowerCase();

  try {
    if (fileName.endsWith(".csv")) {
      const text = await file.text();
      return parseSSLAttendanceCsv(text);
    }

    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      const { read, utils } = await import("xlsx");
      const workbook = read(buffer, { type: "array", cellDates: false });
      const sheetNames = workbook.SheetNames || [];
      if (!sheetNames.length) {
        return { rows: [], warnings: ["Workbook has no sheets."], rawCount: 0 };
      }
      const combinedRows: SSLParseResult["rows"] = [];
      const warnings: string[] = [];

      sheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) return;
        const matrix = utils.sheet_to_json(worksheet, { header: 1, raw: false }) as unknown[][];
        const result = parseWorksheetMatrix(matrix);
        combinedRows.push(...result.rows);
        warnings.push(...result.warnings.map((warning) => `${sheetName}: ${warning}`));
      });

      return {
        rows: combinedRows,
        warnings,
        rawCount: combinedRows.length,
      };
    }

    return { rows: [], warnings: ["Unsupported file format. Use CSV, XLSX, or XLS."], rawCount: 0 };
  } catch (error: any) {
    const message =
      error?.message ||
      "Unable to read this eSSL eTimeTrack Lite file. Please confirm the sheet is a row-wise export or Monthly Status Report.";
    return {
      rows: [],
      warnings: [message],
      rawCount: 0,
    };
  }
};

export const getEmployeeHolidaysForMonth = (
  holidays: HrHoliday[],
  employeeId: string,
  month: string
): HrHoliday[] =>
  holidays.filter(
    (h) => h.date.startsWith(month) && (h.employeeId === undefined || h.employeeId === employeeId)
  );

export const calcAttendanceSummary = (
  records: AttendanceRecord[],
  employeeId: string,
  month: string,
  holidays: HrHoliday[] = [],
  employee?: Pick<HrEmployee, "timesheetDutyStart" | "timesheetDutyEnd"> | null
): AttendanceSummary => {
  const monthRecords = records.filter((r) => r.employeeId === employeeId && r.date.startsWith(month));
  const holidayDates = new Set(
    getEmployeeHolidaysForMonth(holidays, employeeId, month).map((holiday) => holiday.date)
  );
  const counts = { present: 0, absent: 0, missed_punch: 0, late: 0, half_day: 0, holiday: 0, week_off: 0, week_off_present: 0, on_leave: 0 };
  monthRecords.forEach((record) => {
    if (holidayDates.has(record.date)) {
      counts.holiday += 1;
      return;
    }
    const effectiveStatus = resolveAttendanceStatusWithPolicy(record, employee);
    counts[effectiveStatus] = (counts[effectiveStatus] || 0) + 1;
  });
  const recordedDates = new Set(monthRecords.map((record) => record.date));
  holidayDates.forEach((date) => {
    if (!recordedDates.has(date)) {
      counts.holiday += 1;
    }
  });
  const totalDays = monthRecords.length;
  const monthDayCount = getMonthDayCount(month);
  const latePenaltyHalfDays = Math.floor(counts.late / ATTENDANCE_LATE_TO_HALF_DAY_COUNT);
  const chargeableHalfDays = Math.max(0, counts.half_day - ATTENDANCE_HALF_DAY_GRACE_COUNT);
  const baseLopDays = roundMoney(counts.absent + counts.missed_punch + chargeableHalfDays * 0.5 + latePenaltyHalfDays * 0.5);
  const lopDays = roundMoney(Math.max(baseLopDays - counts.week_off_present, 0));
  const paidDays = roundMoney(Math.max(monthDayCount - lopDays, 0));
  return {
    present: counts.present + counts.week_off_present,
    absent: counts.absent + counts.missed_punch,
    missedPunch: counts.missed_punch,
    late: counts.late,
    halfDay: counts.half_day,
    holiday: counts.holiday,
    weekOff: counts.week_off + counts.week_off_present,
    onLeave: counts.on_leave,
    totalDays,
    workingDays: monthDayCount,
    lopDays,
    paidDays,
  };
};

export const createHolidayFormState = (employeeId = ""): HrHolidayFormState => ({
  employeeId,
  date: format(new Date(), "yyyy-MM-dd"),
  name: "",
  type: "festival",
});

export const exportAttendanceCsv = (records: AttendanceRecord[], month: string) => {
  const headers = ["Employee", "Code", "Department", "Date", "In Time", "Out Time", "Status", "Source"];
  const data = records
    .filter((r) => r.date.startsWith(month))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.date.localeCompare(b.date))
    .map((r) => [
      r.employeeName, r.employeeCode, r.department, r.date,
      r.inTime, r.outTime, ATTENDANCE_STATUS_LABELS_LOCAL[r.status], r.source,
    ]);
  exportCsvInternal(`Attendance-${month}.csv`, [headers, ...data]);
};

export const exportAttendanceExcel = async (records: AttendanceRecord[], employees: HrEmployee[], month: string) => {
  const { utils, writeFile } = await import("xlsx");

  const summaryHeaders = ["Employee", "Code", "Department", "Present", "Absent", "Late", "Half Day", "Holiday", "Week Off", "On Leave", "Working Days", "LOP Days", "Paid Days"];
  const summaryData = employees.map((emp) => {
    const s = calcAttendanceSummary(records, emp.id, month, [], emp);
    return [emp.name, emp.employeeCode || "", emp.department || "", s.present, s.absent, s.late, s.halfDay, s.holiday, s.weekOff, s.onLeave, s.workingDays, s.lopDays, s.paidDays];
  });

  const detailHeaders = ["Employee", "Code", "Department", "Date", "In Time", "Out Time", "Status", "Source"];
  const detailData = records
    .filter((r) => r.date.startsWith(month))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.date.localeCompare(b.date))
    .map((r) => [r.employeeName, r.employeeCode || "", r.department || "", r.date, r.inTime || "", r.outTime || "", ATTENDANCE_STATUS_LABELS_LOCAL[r.status], r.source]);

  const wb = utils.book_new();
  const summaryWs = utils.aoa_to_sheet([summaryHeaders, ...summaryData]);
  const detailWs = utils.aoa_to_sheet([detailHeaders, ...detailData]);
  utils.book_append_sheet(wb, summaryWs, "Summary");
  utils.book_append_sheet(wb, detailWs, "Daily Log");
  writeFile(wb, `Attendance-${month}.xlsx`);
};

export const exportLeaveCsv = (requests: HrLeaveRequest[]) => {
  const headers = [
    "Employee", "Code", "Department", "Leave Type",
    "From Date", "To Date", "Days", "Reason", "Status",
    "Applied At", "Reviewed By", "Review Note",
  ];
  const data = requests.map((r) => [
    r.employeeName, r.employeeCode, r.department,
    LEAVE_TYPE_LABELS_LOCAL[r.leaveType],
    r.fromDate, r.toDate, r.days, r.reason, r.status,
    r.appliedAt ? format(new Date(r.appliedAt), "dd MMM yyyy") : "",
    r.reviewedBy?.name,
    r.reviewNote,
  ]);
  exportCsvInternal(`Leave-Report-${format(new Date(), "yyyy-MM-dd")}.csv`, [headers, ...data]);
};
