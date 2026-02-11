import { adminDb } from "@/lib/firebase-admin";
import { Stock } from "@/lib/types";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";

const PAGE_SIZE = 20;

export type PaginatedStockResult = {
  items: Stock[];
  lastDocId: string | null;
  totalCount: number;
};

export async function getStockPaginated(
  lastDocId?: string
): Promise<PaginatedStockResult> {
  try {
    let query = adminDb
      .collection("stocks")
      .orderBy("bcn")
      .limit(PAGE_SIZE);

    if (lastDocId) {
      const lastDocSnap = await adminDb
        .collection("stocks")
        .doc(lastDocId)
        .get();

      if (lastDocSnap.exists) {
        query = query.startAfter(lastDocSnap);
      }
    }

    const snapshot = await query.get();

    const items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Stock[];

    const lastVisible =
      snapshot.docs.length > 0
        ? snapshot.docs[snapshot.docs.length - 1].id
        : null;

    // Count separately (fast, metadata only)
    const totalSnapshot = await adminDb.collection("stocks").count().get();
    const totalCount = totalSnapshot.data().count;

    return {
      items,
      lastDocId: lastVisible,
      totalCount,
    };
  } catch (error) {
    console.error("Pagination error:", error);
    return {
      items: [],
      lastDocId: null,
      totalCount: 0,
    };
  }
}
