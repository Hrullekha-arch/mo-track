"use server";

import { adminAuth, adminDb } from "@/lib/firebase-admin";

const STORE_OPTIONS_REF = adminDb.collection("appSettings").doc("storeOptions");

const normalizeStoreName = (value: unknown) =>
  String(value || "").trim().replace(/\s+/g, " ").toUpperCase();

export async function saveStoreOptionsAction(
  storesInput: string[],
  authToken: string
): Promise<{ success: boolean; message: string }> {
  try {
    const token = String(authToken || "").trim();
    if (!token) return { success: false, message: "Admin authentication is required." };

    const decodedToken = await adminAuth.verifyIdToken(token);
    const actorSnapshot = await adminDb.collection("users").doc(decodedToken.uid).get();
    const actorRole = String(actorSnapshot.data()?.role || "").trim().toLowerCase();
    if (actorRole !== "admin") {
      return { success: false, message: "Only admin users can manage store options." };
    }

    const stores = Array.from(
      new Set((Array.isArray(storesInput) ? storesInput : []).map(normalizeStoreName).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right));

    if (!stores.length) {
      return { success: false, message: "At least one store option is required." };
    }

    await STORE_OPTIONS_REF.set(
      {
        stores,
        updatedAt: new Date().toISOString(),
        updatedBy: {
          id: decodedToken.uid,
          name: String(actorSnapshot.data()?.name || "Admin").trim(),
        },
      },
      { merge: true }
    );

    return { success: true, message: "Store options updated." };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || "Unable to update store options.",
    };
  }
}
