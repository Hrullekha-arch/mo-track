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

const MEASUREMENT_KEYS: (keyof MeasurementValues)[] = [
  "fabric",
  "labourFullMaterialChange",
  "labourHalfMaterialChange",
  "foamFull",
  "foamHalf",
  "lace",
  "fancyDori",
  "fringe",
  "pollyfillKg",
  "pollyfillMtr",
  "vall",
  "others",
  "bolstic",
  "markin",
  "casement",
  "elastic2Inch",
  "elastic3Inch",
  "jute",
  "zip",
  "valcro",
  "hessian",
  "tingleNail",
  "cardBoard",
  "pipingDori",
  "springs",
  "crownNailSilver",
  "crownNailGold",
  "crownNailAntiqueGold",
  "crownNailCopper",
  "button",
  "glueStick",
  "stapplerPin",
  "stichingThread",
];

function asOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function pickMeasurementValues(input: Record<string, any>): MeasurementValues {
  const out: MeasurementValues = {};
  MEASUREMENT_KEYS.forEach((key) => {
    const value = asOptionalString(input?.[key]);
    if (value !== undefined) {
      out[key] = value;
    }
  });
  return out;
}

function normalizeVariant(input: any): FurnitureVariant | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const variantName = asOptionalString(input.variantName);
  if (!variantName) return null;
  return {
    variantName,
    ...pickMeasurementValues(input),
  };
}

function getImportRows(parsed: any): any[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const nested = parsed.records || parsed.data || parsed.items || parsed.furnitureDetails;
    if (Array.isArray(nested)) return nested;
    return [parsed];
  }
  return [];
}

function normalizeImportRow(row: any): {
  docId?: string;
  data: FurnitureDetailPayload & { createdAt: string; updatedAt: string };
} | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;

  const productCategory = asOptionalString(row.productCategory);
  if (!productCategory) return null;

  const now = new Date().toISOString();
  const productImageUrl = asOptionalString(row.productImageUrl);
  const variants = Array.isArray(row.variants)
    ? row.variants.map(normalizeVariant).filter(Boolean) as FurnitureVariant[]
    : [];
  const docId = asOptionalString(row.id);

  const data: FurnitureDetailPayload & { createdAt: string; updatedAt: string } = {
    productCategory,
    ...(productImageUrl ? { productImageUrl } : {}),
    ...pickMeasurementValues(row),
    ...(variants.length ? { variants } : {}),
    createdAt: asOptionalString(row.createdAt) || now,
    updatedAt: now,
  };

  return { docId, data };
}

export async function importFurnitureDetailsJsonAction(
  jsonText: string
): Promise<{ success: boolean; message: string; imported?: number; skipped?: number }> {
  try {
    const source = String(jsonText || "").trim();
    if (!source) {
      return { success: false, message: "JSON input is empty." };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(source);
    } catch {
      return { success: false, message: "Invalid JSON format." };
    }

    const rows = getImportRows(parsed);
    if (!rows.length) {
      return { success: false, message: "No records found in JSON." };
    }

    const collectionRef = adminDb.collection("Furniture details");
    let batch = adminDb.batch();
    let pending = 0;
    let imported = 0;
    let skipped = 0;

    const commitBatch = async () => {
      if (!pending) return;
      await batch.commit();
      batch = adminDb.batch();
      pending = 0;
    };

    for (const row of rows) {
      const normalized = normalizeImportRow(row);
      if (!normalized) {
        skipped += 1;
        continue;
      }

      const ref = normalized.docId
        ? collectionRef.doc(normalized.docId)
        : collectionRef.doc();
      batch.set(ref, normalized.data, { merge: true });
      pending += 1;
      imported += 1;

      if (pending >= 400) {
        await commitBatch();
      }
    }

    await commitBatch();

    if (!imported) {
      return {
        success: false,
        message: "No valid records to import. Ensure productCategory exists in each row.",
        imported,
        skipped,
      };
    }

    return {
      success: true,
      message: `Imported ${imported} record(s).${skipped ? ` Skipped ${skipped}.` : ""}`,
      imported,
      skipped,
    };
  } catch (error: any) {
    console.error("importFurnitureDetailsJsonAction error:", error);
    return { success: false, message: error.message || "Failed to import JSON." };
  }
}

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
