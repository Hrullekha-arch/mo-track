import { adminDb } from "@/lib/firebase-admin";

type SequenceKey = "dealId" | "quotationNo";

const COUNTERS_COLLECTION = "systemCounters";

const START_VALUES: Record<SequenceKey, number> = {
  dealId: 10000,
  quotationNo: 50000,
};

export async function getNextSequenceValue(key: SequenceKey): Promise<string> {
  const startFrom = START_VALUES[key];
  const counterRef = adminDb.collection(COUNTERS_COLLECTION).doc(key);

  const nextValue = await adminDb.runTransaction(async (transaction: any) => {
    const snap = await transaction.get(counterRef);
    const fallbackCurrent = startFrom - 1;
    const rawCurrent = snap.exists ? Number(snap.data()?.current) : Number.NaN;
    const safeCurrent = Number.isFinite(rawCurrent)
      ? Math.floor(rawCurrent)
      : fallbackCurrent;
    const normalizedCurrent =
      safeCurrent < fallbackCurrent ? fallbackCurrent : safeCurrent;
    const next = normalizedCurrent + 1;

    transaction.set(
      counterRef,
      {
        key,
        startFrom,
        current: next,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return next;
  });

  return String(nextValue);
}
