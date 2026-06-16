import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User } from "@/lib/types";
import type { AttendanceRecord, HrEmployee, HrHolidayFormState, HrLeaveRequest } from "../types";
import {
  createHolidayFormState,
  formatMonthLabel,
  getMonthlyLeaveBalance,
  resolveAttendanceStatusWithPolicy,
} from "../utils";

interface Params {
  user: User | null;
  toast: (opts: { title: string; description?: string; variant?: "destructive" }) => void;
  selectedMonth: string;
  setSelectedMonth?: (month: string) => void;
  activeEmployees: HrEmployee[];
  leaveRequests: HrLeaveRequest[];
}

export type AttendanceApiSyncInput = {
  employeeId: string;
  employeeApiId: string;
  place: string;
  from: string;
  to: string;
};

export type AttendanceApiBulkSyncInput = {
  from: string;
  to: string;
  place?: string;
};

type AttendanceApiPunch = {
  employeeId: string | number;
  userSn?: number | string;
  punchTime: string;
  place?: string;
  machineIp?: string;
};

type AttendanceApiResponse = {
  success?: boolean;
  message?: string;
  total?: number;
  data?: AttendanceApiPunch[];
};

type NormalizedApiPunch = {
  employeeId: string;
  userSn: number | null;
  date: string;
  time: string;
  timeWithSeconds: string;
  punchAt: string;
  place: string;
  machineIp?: string;
  rawPunchTime: string;
};

type StoredAttendancePunch = {
  userSn: number | null;
  punchAt: string;
  punchTime: string;
  rawPunchTime: string;
  place: string;
  machineIp?: string;
};

type AttendanceSyncRoot = {
  collectionName: "users" | "hrEmployees";
  docId: string;
};

const sanitizeAttendancePayload = <T extends Record<string, unknown>>(payload: T) =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const pad2 = (value: number) => String(value).padStart(2, "0");
const toMonthKey = (date: string) => date.slice(0, 7);

const resolveSyncRoot = (employee: HrEmployee): AttendanceSyncRoot | null => {
  if (employee.hasLoginAccount) {
    const userId = String(employee.recordId || employee.id || "").trim();
    if (userId) return { collectionName: "users", docId: userId };
  }

  const linkedUserId = String(employee.linkedUserId || "").trim();
  if (linkedUserId) return { collectionName: "users", docId: linkedUserId };

  const manualId = String(employee.recordId || "").trim();
  if (manualId) return { collectionName: "hrEmployees", docId: manualId };
  return null;
};

const normalizeAttendanceBaseUrl = (rawValue: unknown) => {
  const value = String(rawValue || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  if (/\/api$/i.test(value)) return value;
  return `${value}/api`;
};

const buildAttendanceApiUrl = (
  baseApiUrl: string,
  payload: Pick<AttendanceApiSyncInput, "employeeApiId" | "place" | "from" | "to">
) => {
  const search = new URLSearchParams({
    employeeId: payload.employeeApiId,
    place: payload.place,
    from: payload.from,
    to: payload.to,
  });
  return `${baseApiUrl}/attendance?${search.toString()}`;
};

const isNgrokUrl = (value: string) => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host.endsWith(".ngrok-free.app") ||
      host.endsWith(".ngrok-free.dev") ||
      host.endsWith(".ngrok.app") ||
      host.endsWith(".ngrok.dev") ||
      host.endsWith(".ngrok.io")
    );
  } catch {
    return false;
  }
};

const parseApiPunchDateTime = (value: string) => {
  const match = value
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)$/i);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour12 = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || "0");
  const period = match[7].toLowerCase();

  if (
    !Number.isFinite(day) ||
    !Number.isFinite(month) ||
    !Number.isFinite(year) ||
    !Number.isFinite(hour12) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12 ||
    hour12 < 1 ||
    hour12 > 12 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const probe = new Date(year, month - 1, day);
  if (
    Number.isNaN(probe.getTime()) ||
    probe.getFullYear() !== year ||
    probe.getMonth() + 1 !== month ||
    probe.getDate() !== day
  ) {
    return null;
  }

  let hour24 = hour12 % 12;
  if (period === "pm") hour24 += 12;

  const date = `${year}-${pad2(month)}-${pad2(day)}`;
  const time = `${pad2(hour24)}:${pad2(minute)}`;
  const timeWithSeconds = `${time}:${pad2(second)}`;
  const punchAt = `${date}T${timeWithSeconds}`;

  return { date, time, timeWithSeconds, punchAt };
};

const normalizeApiPunch = (entry: AttendanceApiPunch): NormalizedApiPunch | null => {
  const parsed = parseApiPunchDateTime(String(entry?.punchTime || ""));
  if (!parsed) return null;

  const rawUserSn = entry?.userSn;
  const userSn =
    typeof rawUserSn === "number"
      ? rawUserSn
      : typeof rawUserSn === "string" && rawUserSn.trim() && Number.isFinite(Number(rawUserSn))
        ? Number(rawUserSn)
        : null;

  return {
    employeeId: String(entry?.employeeId || "").trim(),
    userSn,
    date: parsed.date,
    time: parsed.time,
    timeWithSeconds: parsed.timeWithSeconds,
    punchAt: parsed.punchAt,
    place: String(entry?.place || "").trim(),
    machineIp: entry?.machineIp ? String(entry.machineIp).trim() : undefined,
    rawPunchTime: String(entry?.punchTime || "").trim(),
  };
};

const getNormalizedPunchKey = (entry: Pick<NormalizedApiPunch, "userSn" | "punchAt" | "rawPunchTime">) =>
  `${entry.userSn ?? ""}|${entry.punchAt}|${entry.rawPunchTime}`;

const dedupeNormalizedPunches = (rows: NormalizedApiPunch[]) => {
  const map = new Map<string, NormalizedApiPunch>();
  for (const row of rows) {
    const key = getNormalizedPunchKey(row);
    if (!map.has(key)) map.set(key, row);
  }
  return Array.from(map.values()).sort(
    (left, right) =>
      left.punchAt.localeCompare(right.punchAt) || (left.userSn ?? 0) - (right.userSn ?? 0)
  );
};

const toStoredPunch = (entry: NormalizedApiPunch): StoredAttendancePunch => ({
  userSn: entry.userSn,
  punchAt: entry.punchAt,
  punchTime: entry.timeWithSeconds,
  rawPunchTime: entry.rawPunchTime,
  place: entry.place,
  machineIp: entry.machineIp,
});

const normalizeStoredPunch = (value: unknown): StoredAttendancePunch | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const punchAt = typeof raw.punchAt === "string" ? raw.punchAt.trim() : "";
  if (!punchAt) return null;

  const punchTime =
    typeof raw.punchTime === "string" && raw.punchTime.trim()
      ? raw.punchTime.trim()
      : punchAt.includes("T")
        ? punchAt.slice(11, 19)
        : "00:00:00";

  const rawPunchTime =
    typeof raw.rawPunchTime === "string" && raw.rawPunchTime.trim()
      ? raw.rawPunchTime.trim()
      : punchAt;

  const userSnValue = raw.userSn;
  const userSn =
    typeof userSnValue === "number"
      ? userSnValue
      : typeof userSnValue === "string" && userSnValue.trim() && Number.isFinite(Number(userSnValue))
        ? Number(userSnValue)
        : null;

  return {
    userSn,
    punchAt,
    punchTime,
    rawPunchTime,
    place: typeof raw.place === "string" ? raw.place.trim() : "",
    machineIp: typeof raw.machineIp === "string" ? raw.machineIp.trim() : undefined,
  };
};

const getStoredPunchKey = (entry: Pick<StoredAttendancePunch, "userSn" | "punchAt" | "rawPunchTime">) =>
  `${entry.userSn ?? ""}|${entry.punchAt}|${entry.rawPunchTime}`;

const mergeStoredPunches = (existingValue: unknown, incoming: StoredAttendancePunch[]) => {
  const merged = new Map<string, StoredAttendancePunch>();

  if (Array.isArray(existingValue)) {
    for (const item of existingValue) {
      const normalized = normalizeStoredPunch(item);
      if (!normalized) continue;
      merged.set(getStoredPunchKey(normalized), normalized);
    }
  }

  for (const item of incoming) {
    merged.set(getStoredPunchKey(item), item);
  }

  return Array.from(merged.values()).sort(
    (left, right) =>
      left.punchAt.localeCompare(right.punchAt) || (left.userSn ?? 0) - (right.userSn ?? 0)
  );
};

const extractLatestAttendanceDate = (data: Record<string, any> | null): string | null => {
  if (!data) return null;

  const directDate = typeof data.latestAttendanceDate === "string" ? data.latestAttendanceDate.trim() : "";
  if (DATE_KEY_PATTERN.test(directDate)) return directDate;

  const nestedDate =
    typeof data.attendanceSync?.latestPunchDate === "string"
      ? String(data.attendanceSync.latestPunchDate).trim()
      : "";
  if (DATE_KEY_PATTERN.test(nestedDate)) return nestedDate;

  const nestedPunchAt =
    typeof data.attendanceSync?.latestPunchAt === "string"
      ? String(data.attendanceSync.latestPunchAt).trim()
      : "";
  const nestedPunchDate = nestedPunchAt.slice(0, 10);
  if (DATE_KEY_PATTERN.test(nestedPunchDate)) return nestedPunchDate;

  return null;
};

export function useAttendanceHandlers({
  user,
  toast,
  selectedMonth,
  setSelectedMonth,
  activeEmployees,
  leaveRequests,
}: Params) {
  const [showAttendanceUpload, setShowAttendanceUpload] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [holidayForm, setHolidayForm] = useState<HrHolidayFormState | null>(null);
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [manageAttendanceEmployee, setManageAttendanceEmployee] = useState<HrEmployee | null>(null);

  const syncAttendanceFromApi = async (input: AttendanceApiSyncInput) => {
    const employee = activeEmployees.find((entry) => entry.id === input.employeeId);
    const employeeApiId = String(input.employeeApiId || "").trim();
    const place = String(input.place || "").trim();
    const from = String(input.from || "").trim();
    const to = String(input.to || "").trim();
    const API_TOKEN =
      process.env.NEXT_PUBLIC_ATTENDANCE_API_TOKEN?.trim() ||
      process.env.ATTENDANCE_API_TOKEN?.trim() ||
      "";

    if (!employee) {
      toast({ variant: "destructive", title: "Sync failed", description: "Employee is required for attendance sync." });
      return;
    }
    if (!employeeApiId || !place || !DATE_KEY_PATTERN.test(from) || !DATE_KEY_PATTERN.test(to) || from > to) {
      toast({
        variant: "destructive",
        title: "Invalid sync range",
        description: "Provide a valid employee API ID, place, and date range.",
      });
      return;
    }

    setSavingAttendance(true);
    try {
      const syncRoot = resolveSyncRoot(employee);
      const syncRootRef = syncRoot ? doc(db, syncRoot.collectionName, syncRoot.docId) : null;
      const nowIso = new Date().toISOString();
      let effectiveFrom = from;

      if (syncRootRef) {
        const syncSnap = await getDoc(syncRootRef);
        const syncData = syncSnap.exists() ? (syncSnap.data() as Record<string, any>) : null;
        const latestSyncedDate = extractLatestAttendanceDate(syncData);
        if (latestSyncedDate && latestSyncedDate > effectiveFrom) {
          effectiveFrom = latestSyncedDate;
        }
      }

      if (effectiveFrom > to) {
        toast({
          title: "Already up to date",
          description: `${employee.name} is already synced up to ${effectiveFrom}.`,
        });
        setShowAttendanceUpload(false);
        return;
      }

      const configSnap = await getDoc(doc(db, "moAttendanceConfig", "config"));
      
      const configData = configSnap.data() as Record<string, unknown> | undefined;
      const baseApiUrl = normalizeAttendanceBaseUrl(
        configData?.baseUrl
          ?? configData?.baseURL
          ?? configData?.baseUr1
          ?? configData?.baseURl
      );
      console.log("Attendance API config:", baseApiUrl);
      if (!baseApiUrl) {
        throw new Error("Attendance API base URL is missing in moAttendanceConfig/config.");
      }
      if (!API_TOKEN) {
        throw new Error("Attendance API token is missing. Set NEXT_PUBLIC_ATTENDANCE_API_TOKEN in frontend env.");
      }

      const requestUrl = buildAttendanceApiUrl(baseApiUrl, {
        employeeApiId,
        place,
        from: effectiveFrom,
        to,
      });

      const headers: Record<string, string> = {
        "x-api-token": API_TOKEN,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      };
      if (isNgrokUrl(requestUrl)) {
        headers["ngrok-skip-browser-warning"] = "true";
      }

      const response = await fetch(requestUrl, {
        method: "GET",
        headers,
      });
      let payload: AttendanceApiResponse | null = null;
      try {
        payload = (await response.json()) as AttendanceApiResponse;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(payload?.message || `Attendance API request failed with ${response.status}.`);
      }
      if (!payload?.success) {
        throw new Error(payload?.message || "Attendance API returned an unsuccessful response.");
      }

      const normalizedPunches = dedupeNormalizedPunches(
        (Array.isArray(payload.data) ? payload.data : [])
          .map((entry) => normalizeApiPunch(entry))
          .filter((entry): entry is NormalizedApiPunch => Boolean(entry))
      );

      if (!normalizedPunches.length) {
        if (syncRootRef) {
          await setDoc(
            syncRootRef,
            {
              attendanceSync: {
                lastFetchedAt: nowIso,
                lastFetchRange: { from: effectiveFrom, to },
                lastFetchCount: 0,
                place,
                baseApiUrl,
              },
            },
            { merge: true }
          );
        }
        toast({
          title: "No attendance found",
          description: `${employee.name} has no punches between ${effectiveFrom} and ${to}.`,
        });
        setShowAttendanceUpload(false);
        return;
      }

      const punchesByDate = new Map<string, NormalizedApiPunch[]>();
      for (const entry of normalizedPunches) {
        const rows = punchesByDate.get(entry.date) || [];
        rows.push(entry);
        punchesByDate.set(entry.date, rows);
      }
      punchesByDate.forEach((rows) =>
        rows.sort(
          (left, right) =>
            left.punchAt.localeCompare(right.punchAt) || (left.userSn ?? 0) - (right.userSn ?? 0)
        )
      );

      const uploadBatch = `api_${Date.now()}`;
      const dailyRecords: Omit<AttendanceRecord, "id">[] = [];
      for (const [date, rows] of punchesByDate.entries()) {
        const first = rows[0];
        const last = rows[rows.length - 1];
        const inTime = first?.time;
        const outTime = rows.length > 1 ? last?.time : undefined;
        const baseStatus: AttendanceRecord["status"] = rows.length > 1 ? "present" : "missed_punch";
        const resolvedStatus = resolveAttendanceStatusWithPolicy(
          { status: baseStatus, inTime, outTime },
          employee
        );

        dailyRecords.push({
          employeeId: employee.id,
          employeeName: employee.name,
          biometricId: employee.biometricId || employeeApiId,
          employeeCode: employee.employeeCode || employeeApiId,
          department: employee.department || undefined,
          date,
          inTime,
          outTime,
          status: resolvedStatus,
          source: "biometric",
          uploadBatch,
          uploadedAt: nowIso,
        });
      }

      const attendanceBatch = writeBatch(db);
      for (const record of dailyRecords) {
        const docId = `${record.employeeId}_${record.date}`;
        attendanceBatch.set(
          doc(db, "hrAttendance", docId),
          sanitizeAttendancePayload(record),
          { merge: true }
        );
      }
      await attendanceBatch.commit();

      if (syncRoot) {
        const monthDateMap = new Map<string, Map<string, StoredAttendancePunch[]>>();
        for (const punch of normalizedPunches) {
          const monthKey = toMonthKey(punch.date);
          if (!monthDateMap.has(monthKey)) monthDateMap.set(monthKey, new Map<string, StoredAttendancePunch[]>());
          const dateMap = monthDateMap.get(monthKey)!;
          const punches = dateMap.get(punch.date) || [];
          punches.push(toStoredPunch(punch));
          dateMap.set(punch.date, punches);
        }

        for (const [monthKey, dateMap] of monthDateMap.entries()) {
          const monthRef = doc(db, syncRoot.collectionName, syncRoot.docId, "attendance", monthKey);
          const monthSnap = await getDoc(monthRef);
          const monthData = monthSnap.exists() ? (monthSnap.data() as Record<string, unknown>) : {};
          const existingDays =
            monthData && typeof monthData.days === "object" && monthData.days !== null
              ? (monthData.days as Record<string, unknown>)
              : {};
          const mergedDays: Record<string, unknown> = { ...existingDays };

          for (const [date, newPunches] of dateMap.entries()) {
            mergedDays[date] = mergeStoredPunches(existingDays[date], newPunches);
          }

          await setDoc(
            monthRef,
            {
              month: monthKey,
              employeeId: employee.id,
              employeeName: employee.name,
              employeeCode: employee.employeeCode || null,
              biometricId: employee.biometricId || employeeApiId,
              place,
              days: mergedDays,
              updatedAt: nowIso,
            },
            { merge: true }
          );
        }

        const latestPunch = normalizedPunches[normalizedPunches.length - 1];
        await setDoc(
          doc(db, syncRoot.collectionName, syncRoot.docId),
          {
            attendanceSync: {
              latestPunchAt: latestPunch.punchAt,
              latestPunchDate: latestPunch.date,
              latestPunchTime: latestPunch.timeWithSeconds,
              lastFetchedAt: nowIso,
              lastFetchRange: { from: effectiveFrom, to },
              lastFetchCount: normalizedPunches.length,
              place,
              baseApiUrl,
            },
            latestAttendanceAt: latestPunch.punchAt,
            latestAttendanceDate: latestPunch.date,
            latestAttendanceTime: latestPunch.timeWithSeconds,
          },
          { merge: true }
        );
      }

      const importedMonths = [...new Set(dailyRecords.map((record) => toMonthKey(record.date)).filter(Boolean))];
      const primaryImportedMonth =
        importedMonths.length === 1 && importedMonths[0]
          ? importedMonths[0]
          : selectedMonth;

      toast({
        title: "Attendance synced",
        description: `${normalizedPunches.length} punch(es) saved as ${dailyRecords.length} day record(s) for ${employee.name} in ${formatMonthLabel(primaryImportedMonth)}.`,
      });

      if (effectiveFrom !== from) {
        toast({
          title: "From date adjusted",
          description: `Sync started from ${effectiveFrom} to avoid duplicate pulls.`,
        });
      }

      if (importedMonths.length === 1 && importedMonths[0] && importedMonths[0] !== selectedMonth) {
        setSelectedMonth?.(importedMonths[0]);
        toast({
          title: "Month switched",
          description: `Synced attendance belongs to ${formatMonthLabel(importedMonths[0])}, so the view was updated automatically.`,
        });
      }

      setShowAttendanceUpload(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Attendance sync failed", description: error?.message });
    } finally {
      setSavingAttendance(false);
    }
  };

  const saveHoliday = async () => {
    if (!holidayForm || !holidayForm.date || !holidayForm.name.trim()) return;
    setSavingHoliday(true);
    try {
      const emp = holidayForm.employeeId
        ? activeEmployees.find((entry) => entry.id === holidayForm.employeeId)
        : null;
      await addDoc(collection(db, "hrHolidays"), {
        employeeId: holidayForm.employeeId || null,
        employeeName: emp?.name || null,
        date: holidayForm.date,
        name: holidayForm.name.trim(),
        type: holidayForm.type,
      });
      toast({ title: "Holiday saved", description: `${holidayForm.name} added successfully.` });
      setHolidayForm(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingHoliday(false);
    }
  };

  const deleteHoliday = async (id: string) => {
    try {
      await deleteDoc(doc(db, "hrHolidays", id));
      toast({ title: "Holiday removed" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete failed", description: error?.message });
    }
  };

  const saveAttendanceRecord = async (record: Omit<AttendanceRecord, "id">) => {
    setSavingAttendance(true);
    try {
      const docId = `${record.employeeId}_${record.date}`;
      const leaveDocId = `attendance_${record.employeeId}_${record.date}`;
      const attendanceRef = doc(db, "hrAttendance", docId);
      const leaveRef = doc(db, "hrLeaveRequests", leaveDocId);
      const employee = activeEmployees.find((entry) => entry.id === record.employeeId);
      const referenceDate = new Date(`${record.date}T00:00:00`);
      const hasManagedLeave = leaveRequests.some((entry) => entry.id === leaveDocId);
      const comparableLeaveRequests = leaveRequests.filter((entry) => entry.id !== leaveDocId);
      const currentBalance = getMonthlyLeaveBalance(comparableLeaveRequests, record.employeeId, employee, referenceDate);

      if (record.status === "on_leave" && !hasManagedLeave && currentBalance.balance < 1) {
        toast({
          variant: "destructive",
          title: "No paid leave balance",
          description: `${employee?.name || record.employeeName} has only ${currentBalance.balance} paid leave left.`,
        });
        return;
      }

      const batch = writeBatch(db);
      batch.set(attendanceRef, sanitizeAttendancePayload(record), { merge: true });

      if (record.status === "on_leave") {
        batch.set(
          leaveRef,
          {
            employeeId: record.employeeId,
            employeeName: record.employeeName,
            employeeCode: record.employeeCode || null,
            department: record.department || null,
            leaveType: "casual",
            fromDate: record.date,
            toDate: record.date,
            days: 1,
            reason: "Attendance-managed paid leave",
            status: "approved",
            appliedAt: new Date().toISOString(),
            reviewedAt: new Date().toISOString(),
            reviewedBy: user ? { id: user.id, name: user.name } : null,
            approvalDate: record.date,
            reviewNote: "Auto-approved from HR attendance management.",
          },
          { merge: true }
        );
      } else {
        batch.delete(leaveRef);
      }

      await batch.commit();

      const balanceAfterSave = currentBalance.balance - (record.status === "on_leave" && !hasManagedLeave ? 1 : 0);
      toast({
        title: "Attendance saved",
        description:
          record.status === "on_leave"
            ? `${record.date} - Paid leave used. Remaining balance: ${Math.max(balanceAfterSave, 0)} day(s).`
            : record.status === "missed_punch" || (!record.inTime || !record.outTime)
              ? `${record.date} - Missed punch recorded. HR can complete the missing punch later.`
            : `${record.date} - ${record.status}`,
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save failed", description: error?.message });
    } finally {
      setSavingAttendance(false);
    }
  };

  const deleteAttendanceRecord = async (record: AttendanceRecord) => {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "hrAttendance", record.id));
      batch.delete(doc(db, "hrLeaveRequests", `attendance_${record.employeeId}_${record.date}`));
      await batch.commit();
      toast({ title: "Record deleted" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete failed", description: error?.message });
    }
  };

  const openHolidayDialog = (employeeId?: string) => {
    setHolidayForm(createHolidayFormState(employeeId));
  };

  const syncAttendanceForStoreFromApi = async (input: AttendanceApiBulkSyncInput) => {
    const from = String(input.from || "").trim();
    const to = String(input.to || "").trim();
    const fallbackPlace = String(input.place || user?.store || "").trim();

    if (!DATE_KEY_PATTERN.test(from) || !DATE_KEY_PATTERN.test(to) || from > to) {
      toast({
        variant: "destructive",
        title: "Invalid sync range",
        description: "Provide a valid date range.",
      });
      return;
    }

    const userStore = String(user?.store || "").trim().toLowerCase();
    const employees = activeEmployees.filter((employee) => {
      if (!userStore) return true;
      return String(employee.store || "").trim().toLowerCase() === userStore;
    });

    if (!employees.length) {
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: userStore ? `No active employees found for ${user?.store}.` : "No active employees found.",
      });
      return;
    }

    let attempted = 0;
    let skipped = 0;
    for (const employee of employees) {
      const employeeApiId = String(employee.biometricId || employee.employeeCode || "").trim();
      const place = String(employee.store || fallbackPlace).trim();
      if (!employeeApiId || !place) {
        skipped += 1;
        continue;
      }

      attempted += 1;
      await syncAttendanceFromApi({
        employeeId: employee.id,
        employeeApiId,
        place,
        from,
        to,
      });
    }

    toast({
      title: "Bulk sync finished",
      description: `Attempted ${attempted} employee(s). Skipped ${skipped} missing API ID/place.`,
    });
  };

  return {
    showAttendanceUpload,
    setShowAttendanceUpload,
    savingAttendance,
    holidayForm,
    setHolidayForm,
    savingHoliday,
    manageAttendanceEmployee,
    setManageAttendanceEmployee,
    syncAttendanceFromApi,
    syncAttendanceForStoreFromApi,
    saveHoliday,
    deleteHoliday,
    saveAttendanceRecord,
    deleteAttendanceRecord,
    openHolidayDialog,
  };
}
