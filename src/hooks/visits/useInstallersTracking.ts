import * as React from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { InstallerTracking } from "@/types/visits";
import { normalizeTrackingDoc } from "@/lib/visits/trackingUtils";

export function useInstallersTracking() {
  const [tracking, setTracking] = React.useState<InstallerTracking[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "installerTracking"),
      (snap) => {
        const trackingData: InstallerTracking[] = [];
        snap.forEach((docSnap) => {
          trackingData.push(normalizeTrackingDoc(docSnap.id, docSnap.data()));
        });
        setTracking(trackingData);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching installer tracking:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { tracking, loading };
}

export function useJobSuggestions() {
  const [suggestions, setSuggestions] = React.useState<Record<string, any>>({});

  React.useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "jobSuggestions"),
      (snap) => {
        const next: Record<string, any> = {};
        snap.forEach((d) => {
          next[d.id] = { installerId: d.id, ...d.data() };
        });
        setSuggestions(next);
      }
    );

    return () => unsubscribe();
  }, []);

  return suggestions;
}

export function useDailyStats() {
  const [stats, setStats] = React.useState<Record<string, any>>({});

  React.useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "adminDailyStats"),
      (snap) => {
        const next: Record<string, any> = {};
        snap.forEach((d) => {
          const data = d.data();
          if (data?.installerId) {
            next[data.installerId] = data;
          }
        });
        setStats(next);
      }
    );

    return () => unsubscribe();
  }, []);

  return stats;
}