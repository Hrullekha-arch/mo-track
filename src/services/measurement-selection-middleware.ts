// measurement-selection-middleware.ts

import {
  getSelectionById,
  saveMeasurementToDeal
} from "@/app/dashboard/customers/[customerId]/[dealId]/actions";

export type MeasurementPayload = {
  customerId: string;
  dealId: string;
  visitId?: string;
  selectionId?: string;
  rooms: any[];
  itemDetails?: any[];
  createdBy: string;
};

// ==================================================
// ⭐ FULL LOGGER FUNCTION
// ==================================================
function log(...args: any[]) {
  console.log("📘 [MEASUREMENT-MW]", ...args);
}

export async function processMeasurementSubmission(payload: MeasurementPayload) {
  log("🔥 PROCESS START");
  log("📦 Incoming Payload:", JSON.stringify(payload, null, 2));

  const hasSelection = !!payload.selectionId;
  const hasItemDetails = payload.itemDetails?.length > 0;
  let status = "complete";
  let flags: string[] = [];
  let selectionData = null;

  // ==================================================
  // ⭐ CASE 1 — Validate selection
  // ==================================================
  if (hasSelection && payload.selectionId) {
    log("🔍 Checking selection:", payload.selectionId);

    try {
      selectionData = await getSelectionById(
        payload.customerId,
        payload.dealId,
        payload.selectionId
      );

      log("📄 Selection Data:", selectionData);

      if (!selectionData) {
        log("❌ Selection NOT found!");
        status = "selection-required";
        flags.push("selectionNotFound");
      }
    } catch (err: any) {
      log("❌ ERROR fetching selection:", err.message);
      status = "selection-required";
      flags.push("selectionFetchError");
    }
  } else {
    log("⚠ No selectionId provided by client.");
  }

  // ==================================================
  // ⭐ CASE 2 — No selection → installer measured first
  // ==================================================
  if (!hasSelection) {
    log("🛑 Installer measured BEFORE selection.");
    status = "selection-required";
    flags.push("noSelection");
  }

  // ==================================================
  // ⭐ CASE 3 — Missing item details
  // ==================================================
  if (hasSelection && !hasItemDetails) {
    log("⚠ Missing item details for a selection.");
    status = "item-detail-missing";
    flags.push("missingItemDetails");
  }

  // ==================================================
  // ⭐ SAVE MEASUREMENT DATA
  // ==================================================
  log("💾 Saving measurement to DB...");

  const savePayload = {
    customerId: payload.customerId,
    dealId: payload.dealId,
    visitId: payload.visitId,
    selectionId: payload.selectionId || null,
    rooms: payload.rooms,
    itemDetails: payload.itemDetails || [],
    createdBy: payload.createdBy,
    status,
    flags
  };

  log("📝 Final Save Payload:", JSON.stringify(savePayload, null, 2));

  const saved = await saveMeasurementToDeal(savePayload);

  log("✅ Save Response:", saved);

  // ==================================================
  // ⭐ FINAL RETURN
  // ==================================================
  const finalResponse = {
    success: true,
    status,
    flags,
    savedMeasurement: saved,
    message: `Measurement processed as: ${status}`
  };

  log("📤 FINAL RESPONSE:", JSON.stringify(finalResponse, null, 2));
  log("🔥 PROCESS END");

  return finalResponse;
}
