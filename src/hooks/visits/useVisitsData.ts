import * as React from "react";
import {
  collection,
  onSnapshot,
  query,
  collectionGroup,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DealVisit, Customer, Deal, User } from "@/lib/types";
import { EnrichedDealVisit } from "@/types/visits";

// Cache for customer and deal data to reduce Firestore reads
const customerCache = new Map<string, Customer>();
const dealCache = new Map<string, Deal>();

// Helper to get date range for queries
function getDateRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAhead = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    from: weekAgo.toISOString().split("T")[0],
    to: monthAhead.toISOString().split("T")[0],
  };
}

export function useVisitsData() {
  const [visits, setVisits] = React.useState<EnrichedDealVisit[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const dateRange = getDateRange();

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

    // Subscribe to visits with date range filter
    const unsubVisits = onSnapshot(
      query(
        collectionGroup(db, "visits"),
        where("slotDate", ">=", dateRange.from),
        where("slotDate", "<=", dateRange.to),
        orderBy("slotDate", "desc"),
        limit(500)
      ),
      async (snap) => {
        // Batch process visits to enrich with customer/deal data
        const enrichedVisits = await Promise.all(
          snap.docs.map(async (docSnap) => {
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

        setVisits(enrichedVisits);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching visits:", error);
        setLoading(false);
      }
    );

    return () => {
      unsubUsers();
      unsubVisits();
    };
  }, []);

  return { visits, users, loading };
}