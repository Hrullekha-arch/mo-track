"use client";

import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { AUTO_ADVANCE_POLL_MS } from "../utils/pmsHelpers";

export const buildWorkSheetRows = (rows: Array<any>) => {
  const header = [
    "Order No",
    "Customer",
    "Vas Item",
    "Qty",
    "PMS Product",
    "Status",
    "Next Step",
    "Machine",
    "Person",
    "Process (step)",
    "Planned Start",
    "Planned End",
    "Embelshment",
    "Embelshment Total Time",
  ];

  const values = rows.map((row) => [
    row.orderNo,
    row.customer,
    row.vasName,
    row.qty,
    row.productName,
    row.status,
    row.nextProcess || "-",
    row.machine || "TBD",
    row.person || "TBD",
    row.process,
    row.plannedStart || "",
    row.plannedEnd || "",
    row.embellishment?.enabled ? "YES" : "NO",
    row.embellishment?.enabled ? row.embellishment?.totalTime || 0 : "",
  ]);

  return [header, ...values];
};

type Params = {
  role?: string | null;
  workSheetStepRows: any[];
  syncingWorkSheetRef: MutableRefObject<boolean>;
  lastWorkSheetPayloadRef: MutableRefObject<string>;
  autoAdvanceRef: MutableRefObject<boolean>;
};

export const usePmsAutoTasks = ({
  role,
  workSheetStepRows,
  syncingWorkSheetRef,
  lastWorkSheetPayloadRef,
  autoAdvanceRef,
}: Params) => {
  useEffect(() => {
    if (role && role !== "admin") return;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const syncWorkSheet = async () => {
      if (syncingWorkSheetRef.current) return;
      syncingWorkSheetRef.current = true;
      try {
        const rows = buildWorkSheetRows(workSheetStepRows);
        const payloadHash = JSON.stringify(rows);
        if (payloadHash === lastWorkSheetPayloadRef.current) {
          return;
        }
        await fetch("/api/pms/syncWorkSheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
        });
        lastWorkSheetPayloadRef.current = payloadHash;
      } catch (error) {
        console.error("PMS work sheet sync failed:", error);
      } finally {
        syncingWorkSheetRef.current = false;
      }
    };

    syncWorkSheet();
    intervalId = setInterval(syncWorkSheet, 60_000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [lastWorkSheetPayloadRef, role, syncingWorkSheetRef, workSheetStepRows]);

  useEffect(() => {
    if (role && role !== "admin") return;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const runAutoAdvance = async () => {
      if (autoAdvanceRef.current) return;
      autoAdvanceRef.current = true;
      try {
        await fetch("/api/pms/autoAdvance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("PMS auto-advance failed:", error);
      } finally {
        autoAdvanceRef.current = false;
      }
    };

    runAutoAdvance();
    intervalId = setInterval(runAutoAdvance, AUTO_ADVANCE_POLL_MS);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoAdvanceRef, role]);
};
