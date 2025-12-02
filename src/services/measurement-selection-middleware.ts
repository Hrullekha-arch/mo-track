// measurement-selection-middleware.ts

import {
  getSelectionById,
  saveMeasurementToDeal   // ✅ FIXED: now imported correctly
} from "@/app/dashboard/customers/[customerId]/[dealId]/actions";

import { generateQuotationFromSelection } from "@/components/features/order-management/autoQuotation";

export type MeasurementPayload = {
  dealId: string;
  selectionId?: string;
  rooms: any[];
  itemDetails?: any[];
  createdBy: string;
};

export async function processMeasurementSubmission(payload: MeasurementPayload) {

  console.log("🔥 PROCESS PAYLOAD:", payload.customerId, payload.dealId);

  const hasSelection = !!payload.selectionId;
  const hasItemDetails = payload.itemDetails && payload.itemDetails.length > 0;
  let status = "complete";
  let flags: string[] = [];
  let selectionData = null;

  // ------------ CASE 1: SELECTION FIRST, installer measures -------------
  if (hasSelection && payload.rooms.length > 0) {
    selectionData = await getSelectionById(payload.dealId, payload.selectionId!);

    const selectionRoomCount = selectionData.productIds.length;
    const measurementRoomCount = payload.rooms.length;

    if (measurementRoomCount > selectionRoomCount) {
      status = "item-detail-missing";
      flags.push("extraRooms");
    } else {
      status = "complete";
    }
  }

  // ------------ CASE 2: Missing item details in measurement -------------
  if (hasSelection && !hasItemDetails) {
    status = "item-detail-missing";
    flags.push("missingItemDetails");
  }

  // ------------ CASE 3: Installer measured BEFORE selection ----------
  if (!hasSelection) {
    status = "selection-required";
    flags.push("noSelection");
  }

  // ------------ SAVE MEASUREMENT DATA ----------------------------
const saved = await saveMeasurementToDeal(payload.dealId, {
    ...payload,
    customerId: payload.customerId,   // 🔥 FIX
    status,
    flags,
});


  // ------------ AUTO QUOTATION -----------------------------
  if (status === "complete") {
    await generateQuotationFromSelection(payload.dealId, payload.selectionId);
  }

  return {
    success: true,
    status,
    flags,
    savedMeasurement: saved,
    message: `Measurement processed as: ${status}`,
  };
}
