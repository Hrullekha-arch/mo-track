// =============================================================================
// useAutopilotLock — Firestore-based distributed lock for autopilot
//
// Problem: Two admins clicking "Reset & Rerun" simultaneously leads to
// corrupted state (double-delete + double-create).
//
// Solution: Acquire a Firestore document lock before any destructive
// operation. Lock has a TTL so stale locks auto-expire.
// =============================================================================

import { useCallback, useRef } from "react";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const LOCK_DOC = "pmsSettings/autopilotLock";
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes max

type LockData = {
  lockedBy: string;
  lockedAt: string;
  operation: string;
};

export const useAutopilotLock = (userId?: string) => {
  const lockHeldRef = useRef(false);

  /**
   * Try to acquire the lock. Returns true if acquired, false if someone else holds it.
   */
  const acquireLock = useCallback(
    async (operation: string): Promise<{ acquired: boolean; heldBy?: string }> => {
      const lockRef = doc(db, LOCK_DOC);

      try {
        const snap = await getDoc(lockRef);

        if (snap.exists()) {
          const data = snap.data() as LockData;
          const lockedAtMs = new Date(data.lockedAt).getTime();
          const isExpired = Date.now() - lockedAtMs > LOCK_TTL_MS;

          if (!isExpired) {
            return {
              acquired: false,
              heldBy: data.lockedBy || "another admin",
            };
          }
          // Expired lock — we can overwrite it
        }

        await setDoc(lockRef, {
          lockedBy: userId || "unknown",
          lockedAt: new Date().toISOString(),
          operation,
        });

        lockHeldRef.current = true;
        return { acquired: true };
      } catch (error) {
        console.error("Failed to acquire autopilot lock:", error);
        return { acquired: false, heldBy: "system error" };
      }
    },
    [userId]
  );

  /**
   * Release the lock. Only release if we hold it.
   */
  const releaseLock = useCallback(async () => {
    if (!lockHeldRef.current) return;

    try {
      await deleteDoc(doc(db, LOCK_DOC));
    } catch (error) {
      console.error("Failed to release autopilot lock:", error);
    } finally {
      lockHeldRef.current = false;
    }
  }, []);

  return { acquireLock, releaseLock };
};