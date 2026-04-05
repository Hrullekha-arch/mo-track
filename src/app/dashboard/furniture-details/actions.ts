"use server";

import { adminDb, adminStorage } from "@/lib/firebase-admin";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function normalizeBase64(data: string): string {
  // Strip data URL prefix if present
  const match = data.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : data;
}

async function uploadBufferToStorage(
  bucket: any,
  filePath: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const file = bucket.file(filePath);
  await file.save(buffer, { contentType: mimeType, resumable: false });
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return url;
}

export async function uploadFurnitureImageAction(
  fileName: string,
  mimeType: string,
  base64Data: string
): Promise<string> {
  if (!adminStorage) throw new Error("Firebase Admin Storage not initialized.");
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new Error("FIREBASE_STORAGE_BUCKET env missing.");
  const bucket = adminStorage.bucket(bucketName);
  const safeName = sanitizeFileName(fileName);
  const filePath = `furniture-details/${Date.now()}_${safeName}`;
  const cleanBase64 = normalizeBase64(base64Data);
  if (!cleanBase64) throw new Error("Empty file payload.");
  const buffer = Buffer.from(cleanBase64, "base64");
  return uploadBufferToStorage(bucket, filePath, buffer, mimeType);
}

export type MeasurementValues = {
  fabric?: string;
  labourFullMaterialChange?: string;
  labourHalfMaterialChange?: string;
  foamFull?: string;
  foamHalf?: string;
  lace?: string;
  fancyDori?: string;
  fringe?: string;
  pollyfillKg?: string;
  pollyfillMtr?: string;
  vall?: string;
  others?: string;
  bolstic?: string;
  markin?: string;
  casement?: string;
  elastic2Inch?: string;
  elastic3Inch?: string;
  jute?: string;
  zip?: string;
  valcro?: string;
  hessian?: string;
  tingleNail?: string;
  cardBoard?: string;
  pipingDori?: string;
  springs?: string;
  crownNailSilver?: string;
  crownNailGold?: string;
  crownNailAntiqueGold?: string;
  crownNailCopper?: string;
  button?: string;
  glueStick?: string;
  stapplerPin?: string;
  stichingThread?: string;
};

export type FurnitureVariant = MeasurementValues & {
  variantName: string;
};

export type FurnitureDetailPayload = MeasurementValues & {
  productCategory: string;
  productImageUrl?: string;
  variants?: FurnitureVariant[];
};

export type FurnitureDetail = FurnitureDetailPayload & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export async function saveFurnitureDetailAction(
  payload: FurnitureDetailPayload
): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    const now = new Date().toISOString();
    const ref = adminDb.collection("Furniture details").doc();
    await ref.set({ ...payload, createdAt: now, updatedAt: now });
    return { success: true, message: "Saved successfully.", id: ref.id };
  } catch (error: any) {
    console.error("saveFurnitureDetailAction error:", error);
    return { success: false, message: error.message || "Failed to save." };
  }
}

export async function updateFurnitureDetailAction(
  id: string,
  payload: Partial<FurnitureDetailPayload>
): Promise<{ success: boolean; message: string }> {
  try {
    const now = new Date().toISOString();
    await adminDb.collection("Furniture details").doc(id).update({ ...payload, updatedAt: now });
    return { success: true, message: "Updated successfully." };
  } catch (error: any) {
    console.error("updateFurnitureDetailAction error:", error);
    return { success: false, message: error.message || "Failed to update." };
  }
}

export async function deleteFurnitureDetailAction(
  id: string
): Promise<{ success: boolean; message: string }> {
  try {
    await adminDb.collection("Furniture details").doc(id).delete();
    return { success: true, message: "Deleted successfully." };
  } catch (error: any) {
    console.error("deleteFurnitureDetailAction error:", error);
    return { success: false, message: error.message || "Failed to delete." };
  }
}

export async function getFurnitureDetailsAction(): Promise<FurnitureDetail[]> {
  try {
    const snap = await adminDb
      .collection("Furniture details")
      .orderBy("createdAt", "desc")
      .get();
    return JSON.parse(
      JSON.stringify(
        snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
      )
    );
  } catch (error: any) {
    console.error("getFurnitureDetailsAction error:", error);
    return [];
  }
}
