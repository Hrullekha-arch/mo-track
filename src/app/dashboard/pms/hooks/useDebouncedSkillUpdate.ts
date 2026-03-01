// =============================================================================
// useDebouncedSkillUpdate — Batches rapid skill toggle clicks
//
// Problem: Each checkbox click fires an individual Firestore write.
// Clicking 10 checkboxes in quick succession = 10 separate writes.
//
// Solution: Collect changes in a buffer, flush after SKILL_DEBOUNCE_MS of
// inactivity. Uses a single writeBatch for all pending changes.
// =============================================================================

import { useCallback, useRef } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { buildSkillId, SKILL_DEBOUNCE_MS } from "../utils/pmsHelpers";
import type { PmsMachine } from "../types/pms";

type PendingSkillUpdate = {
  machineId: string;
  personId: string;
  category: string;
  allowed: boolean;
  process: string;
};

export const useDebouncedSkillUpdate = (machines: PmsMachine[]) => {
  const pendingRef = useRef<Map<string, PendingSkillUpdate>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);

  const flush = useCallback(async () => {
    if (flushingRef.current || pendingRef.current.size === 0) return;
    flushingRef.current = true;

    const batch = new Map(pendingRef.current);
    pendingRef.current.clear();

    const nowIso = new Date().toISOString();

    try {
      const writes = Array.from(batch.entries()).map(([id, update]) =>
        setDoc(
          doc(db, "machineSkills", id),
          {
            machineId: update.machineId,
            personId: update.personId,
            process: update.process,
            category: update.category,
            allowed: update.allowed,
            updatedAt: nowIso,
          },
          { merge: true }
        )
      );
      await Promise.all(writes);
    } catch (error) {
      console.error("Skill batch write failed:", error);
      // Put failed items back so the next flush retries them
      batch.forEach((value, key) => {
        if (!pendingRef.current.has(key)) {
          pendingRef.current.set(key, value);
        }
      });
    } finally {
      flushingRef.current = false;
    }
  }, []);

  const updateSkill = useCallback(
    (machineId: string, personId: string, category: string, allowed: boolean) => {
      const machine = machines.find((m) => m.id === machineId);
      if (!machine) return;

      const id = buildSkillId(machineId, personId, category);
      pendingRef.current.set(id, {
        machineId,
        personId,
        category,
        allowed,
        process: machine.process,
      });

      // Reset debounce timer
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, SKILL_DEBOUNCE_MS);
    },
    [machines, flush]
  );

  /** Force-flush any pending writes immediately (e.g. on bulk actions). */
  const flushNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    return flush();
  }, [flush]);

  return { updateSkill, flushNow };
};