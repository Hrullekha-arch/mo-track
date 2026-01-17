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
  typeOf?: string | null;
  doerName?: string | null;
  rooms: any[];
  itemDetails?: any[];
  createdBy: string;
};

// ==================================================
// ⭐ FULL LOGGER FUNCTION
// ==================================================
function log(...args: any[]) {
    const formattedArgs = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
            try {
                // Safely stringify objects, handling circular references
                return JSON.stringify(arg, (key, value) => {
                    // Basic circular reference check
                    if (typeof value === 'object' && value !== null) {
                        if (seen.has(value)) {
                            return '[Circular]';
                        }
                        seen.add(value);
                    }
                    return value;
                }, 2); // Indent with 2 spaces for readability
            } catch (e) {
                return '[Unserializable Object]';
            }
        }
        return arg;
    });
    const seen = new Set();
    console.log("📘 [MEASUREMENT-MW]", ...formattedArgs);
}


export async function processMeasurementSubmission(payload: MeasurementPayload) {
  log("🔥 PROCESS START");
  log("📦 Incoming Payload:", payload);

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
    typeOf: payload.typeOf || null,
    doerName: payload.doerName || null,
    rooms: payload.rooms,
    itemDetails: payload.itemDetails || [],
    createdBy: payload.createdBy,
    status,
    flags
  };

  log("📝 Final Save Payload:", savePayload);

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

  log("📤 FINAL RESPONSE:", finalResponse);
  log("🔥 PROCESS END");

  return finalResponse;
}