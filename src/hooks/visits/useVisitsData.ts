import * as React from "react";
import {
  collection,
  onSnapshot,
  query,
  collectionGroup,
  where,
  orderBy,
  doc,
  getDoc,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DealVisit, Customer, Deal, User } from "@/lib/types";
import { EnrichedDealVisit } from "@/types/visits";

// Cache for customer and deal data to reduce Firestore reads
const customerCache = new Map<string, Customer>();
const dealCache = new Map<string, Deal>();

const VISITS_LOOKBACK_YEARS = 10;
const VISITS_LOOKAHEAD_YEARS = 10;

const toDateOnly = (value: Date) => value.toISOString().split("T")[0];

// Helper to get a broad query range so client-side date filters work across history.
function getDateRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fromDate = new Date(today);
  fromDate.setFullYear(fromDate.getFullYear() - VISITS_LOOKBACK_YEARS);
  const toDate = new Date(today);
  toDate.setFullYear(toDate.getFullYear() + VISITS_LOOKAHEAD_YEARS);

  return {
    from: toDateOnly(fromDate),
    to: toDateOnly(toDate),
  };
}

export function useVisitsData() {
  const [visits, setVisits] = React.useState<EnrichedDealVisit[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const dateRange = getDateRange();
    let isCancelled = false;
    let slotDateDocs: QueryDocumentSnapshot<DocumentData>[] = [];
    let dueDateDocs: QueryDocumentSnapshot<DocumentData>[] = [];

    const enrichAndSetVisits = async () => {
      const allDocs = [...slotDateDocs, ...dueDateDocs];
      if (!allDocs.length) {
        if (!isCancelled) {
          setVisits([]);
          setLoading(false);
        }
        return;
      }

      const uniqueDocMap = new Map<string, (typeof allDocs)[number]>();
      for (const snap of allDocs) {
        uniqueDocMap.set(snap.ref.path, snap);
      }
      const uniqueDocs = Array.from(uniqueDocMap.values());

      const enrichedVisits = await Promise.all(
        uniqueDocs.map(async (docSnap) => {
          const visit = docSnap.data() as DealVisit;
          const parts = docSnap.ref.path.split("/");
          const customerId = parts[1];
          const dealDocId = parts[3];

          // Use cache to minimize Firestore reads
          if (!customerCache.has(customerId)) {
            const customerSnap = await getDoc(
              doc(db, "customers", customerId)
            );
            if (customerSnap.exists()) {
              customerCache.set(customerId, {
                id: customerSnap.id,
                ...customerSnap.data(),
              } as Customer);
            }
          }

          const cacheKey = `${customerId}-${dealDocId}`;
          if (!dealCache.has(cacheKey)) {
            const dealSnap = await getDoc(
              doc(db, "customers", customerId, "deals", dealDocId)
            );
            if (dealSnap.exists()) {
              dealCache.set(cacheKey, {
                id: dealSnap.id,
                ...dealSnap.data(),
              } as Deal);
            }
          }

          const customer = customerCache.get(customerId);
          const deal = dealCache.get(cacheKey);

          return {
            ...visit,
            id: docSnap.id,
            customerId,
            dealDocId,
            customerName: customer?.name || "Unknown",
            dealName: deal?.dealName || "Unknown",
            dealId: deal?.dealId || "N/A",
            customer: customer || null,
            customerAddress:
              visit.location?.address || customer?.address || "",
          } as EnrichedDealVisit;
        })
      );

      // Prefer slot date for ordering, then due date, then createdAt.
      enrichedVisits.sort((left, right) => {
        const leftKey = left.slotDate || left.dueDate || left.createdAt || "";
        const rightKey = right.slotDate || right.dueDate || right.createdAt || "";
        return String(rightKey).localeCompare(String(leftKey));
      });

      if (!isCancelled) {
        setVisits(enrichedVisits);
        setLoading(false);
      }
    };

    // Subscribe to users
    const unsubUsers = onSnapshot(
      query(collection(db, "users")),
      (snap) => {
        setUsers(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as User))
        );
      },
      (error) => {
        console.error("Error fetching users:", error);
      }
    );

    // Stream 1: Visits scheduled via slotDate.
    const unsubSlotDateVisits = onSnapshot(
      query(
        collectionGroup(db, "visits"),
        where("slotDate", ">=", dateRange.from),
        where("slotDate", "<=", dateRange.to),
        orderBy("slotDate", "desc")
      ),
      async (snap) => {
        slotDateDocs = snap.docs;
        await enrichAndSetVisits();
      },
      (error) => {
        console.error("Error fetching slotDate visits:", error);
        setLoading(false);
      }
    );

    // Stream 2: Visits still pending by dueDate (covers unassigned visits where slotDate is removed).
    const unsubDueDateVisits = onSnapshot(
      query(
        collectionGroup(db, "visits"),
        where("dueDate", ">=", dateRange.from),
        where("dueDate", "<=", dateRange.to),
        orderBy("dueDate", "desc")
      ),
      async (snap) => {
        dueDateDocs = snap.docs;
        await enrichAndSetVisits();
      },
      (error) => {
        console.error("Error fetching dueDate visits:", error);
      }
    );

    return () => {
      isCancelled = true;
      unsubUsers();
      unsubSlotDateVisits();
      unsubDueDateVisits();
    };
  }, []);

  return { visits, users, loading };
}
