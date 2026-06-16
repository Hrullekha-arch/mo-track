'use server';

import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { createZohoPurchaseOrder } from "@/lib/zoho-books";
import type { PendingPoItem, PoCreationData } from "@/app/dashboard/purchase/pending-po/actions";

type ActionActor = { id: string; name: string };

const asTrimmedString = (value: unknown) => String(value ?? "").trim();

const asValidNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const toIsoDateOnly = (value?: string) => {
  const parsed = new Date(String(value || "").trim());
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
};

const EXCESS_APPROVAL_COLLECTION = "inboundExcessApprovals";
const QTY_EPSILON = 0.0001;

const isManagementRole = (role: unknown) => {
  const normalized = asTrimmedString(role).toLowerCase();
  return ["admin", "md", "management", "managing director"].includes(normalized);
};

export type InboundExcessApproval = {
  id: string;
  inboundId: string;
  poNumber: string;
  dealId?: string;
  orderId?: string;
  smName?: string;
  itemIndex: number;
  itemName: string;
  supplierCollectionCode?: string;
  unit: string;
  purchaseRate?: number;
  expectedQty: number;
  alreadyReceivedQty: number;
  remainingQty: number;
  requestedQty: number;
  excessQty: number;
  vendorName?: string;
  customerName?: string;
  requestedBy: { id: string; name: string };
  requestedAt: string;
  status: "pending" | "approved" | "rejected" | "used";
  reviewedBy?: { id: string; name: string };
  reviewedAt?: string;
  usedAt?: string;
};

export async function requestInboundExcessApprovalAction(
  input: {
    inboundId: string;
    itemIndex: number;
    requestedQty: number;
  },
  actor: ActionActor
): Promise<{ success: boolean; message: string; approvalId?: string }> {
  const inboundId = asTrimmedString(input?.inboundId);
  const itemIndex = Number(input?.itemIndex);
  const requestedQty = asValidNumber(input?.requestedQty);
  if (!actor?.id) return { success: false, message: "Missing user context." };
  if (!inboundId || !Number.isInteger(itemIndex) || itemIndex < 0) {
    return { success: false, message: "Invalid inbound item." };
  }
  if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
    return { success: false, message: "Enter a valid received quantity." };
  }

  try {
    const inboundRef = adminDb
      .collection("inbounds")
      .doc(inboundId) as FirebaseFirestore.DocumentReference;
    const approvalRef = adminDb
      .collection(EXCESS_APPROVAL_COLLECTION)
      .doc(`${inboundId}_${itemIndex}`) as FirebaseFirestore.DocumentReference;
    let approvalId = approvalRef.id;

    await adminDb.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
      const inboundSnap = await transaction.get(inboundRef);
      if (!inboundSnap.exists) throw new Error("Inbound PO not found.");

      const inbound = inboundSnap.data() as any;
      const items = Array.isArray(inbound?.items) ? [...inbound.items] : [];
      const item = items[itemIndex];
      if (!item) throw new Error("Inbound item not found.");

      const expectedQty = asValidNumber(item?.quantity);
      const alreadyReceivedQty = Math.max(0, asValidNumber(item?.receivedQty) || 0);
      const remainingQty = Math.max(0, expectedQty - alreadyReceivedQty);
      if (!Number.isFinite(expectedQty) || expectedQty <= 0) {
        throw new Error("PO quantity is invalid.");
      }
      if (requestedQty <= remainingQty + QTY_EPSILON) {
        throw new Error("This quantity does not exceed the PO remaining quantity.");
      }

      const now = new Date().toISOString();
      const purchaseRateCandidates = [
        item?.purchaseRate,
        item?.zohoRate,
        item?.rate,
        item?.stockDetail?.purchaseRate,
        item?.stockDetail?.costPriceRs,
        item?.stockDetail?.rate,
      ];
      const purchaseRate = purchaseRateCandidates
        .map((value) => Number(value))
        .find((value) => Number.isFinite(value) && value >= 0);
      const approval: Omit<InboundExcessApproval, "id"> = {
        inboundId,
        poNumber: asTrimmedString(inbound?.poNumber || inboundId),
        dealId: asTrimmedString(inbound?.dealId) || undefined,
        orderId:
          asTrimmedString(
            inbound?.orderSnapshot?.orderNo ||
              inbound?.orderSnapshot?.id ||
              inbound?.dealSnapshot?.orderId ||
              inbound?.dealId
          ) || undefined,
        smName:
          asTrimmedString(
            inbound?.assignedSalesman?.name ||
              inbound?.salesman ||
              inbound?.orderSnapshot?.salesPerson
          ) || undefined,
        itemIndex,
        itemName: asTrimmedString(item?.itemName) || `Item ${itemIndex + 1}`,
        supplierCollectionCode:
          asTrimmedString(
            item?.supplierCollectionCode ||
              item?.stockDetail?.supplierCollectionCode ||
              item?.smCode ||
              item?.serialNo
          ) || undefined,
        unit: asTrimmedString(item?.unit) || "Pcs",
        purchaseRate,
        expectedQty,
        alreadyReceivedQty,
        remainingQty,
        requestedQty,
        excessQty: requestedQty - remainingQty,
        vendorName: asTrimmedString(item?.vendorName || inbound?.vendor) || undefined,
        customerName: asTrimmedString(inbound?.customerName) || undefined,
        requestedBy: { id: actor.id, name: actor.name || "User" },
        requestedAt: now,
        status: "pending",
      };

      items[itemIndex] = {
        ...item,
        excessApproval: {
          id: approvalId,
          status: "pending",
          requestedQty,
          excessQty: approval.excessQty,
          requestedAt: now,
          requestedBy: approval.requestedBy,
        },
      };
      transaction.set(approvalRef, approval);
      transaction.update(inboundRef, { items, updatedAt: now });
    });

    return {
      success: true,
      approvalId,
      message: "Excess quantity sent to the Approval Dashboard for MD approval.",
    };
  } catch (error: any) {
    return { success: false, message: error?.message || "Unable to request MD approval." };
  }
}

export async function reviewInboundExcessApprovalAction(
  approvalIdInput: string,
  decision: "approved" | "rejected",
  actor: ActionActor
): Promise<{ success: boolean; message: string }> {
  const approvalId = asTrimmedString(approvalIdInput);
  if (!approvalId || !actor?.id) {
    return { success: false, message: "Missing approval or user context." };
  }

  try {
    const actorSnap = await adminDb.collection("users").doc(actor.id).get();
    if (
      !isManagementRole(actorSnap.data()?.role) &&
      !isManagementRole(actorSnap.data()?.designation)
    ) {
      return { success: false, message: "Only MD or admin can review excess receipts." };
    }

    const approvalRef = adminDb
      .collection(EXCESS_APPROVAL_COLLECTION)
      .doc(approvalId) as FirebaseFirestore.DocumentReference;
    await adminDb.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
      const approvalSnap = await transaction.get(approvalRef);
      if (!approvalSnap.exists) throw new Error("Approval request not found.");
      const approval = approvalSnap.data() as InboundExcessApproval;
      if (approval.status !== "pending") {
        throw new Error(`This request is already ${approval.status}.`);
      }

      const inboundRef = adminDb
        .collection("inbounds")
        .doc(approval.inboundId) as FirebaseFirestore.DocumentReference;
      const inboundSnap = await transaction.get(inboundRef);
      if (!inboundSnap.exists) throw new Error("Inbound PO no longer exists.");
      const inbound = inboundSnap.data() as any;
      const items = Array.isArray(inbound?.items) ? [...inbound.items] : [];
      const item = items[approval.itemIndex];
      if (!item) throw new Error("Inbound item no longer exists.");

      const now = new Date().toISOString();
      const reviewedBy = { id: actor.id, name: actor.name || "Management" };
      items[approval.itemIndex] = {
        ...item,
        excessApproval: {
          ...(item.excessApproval || {}),
          id: approvalId,
          status: decision,
          requestedQty: approval.requestedQty,
          excessQty: approval.excessQty,
          reviewedAt: now,
          reviewedBy,
        },
      };
      transaction.update(inboundRef, { items, updatedAt: now });
      transaction.update(approvalRef, {
        status: decision,
        reviewedAt: now,
        reviewedBy,
      });
    });

    return {
      success: true,
      message:
        decision === "approved"
          ? "Excess receipt approved. The inbound team can now receive it."
          : "Excess receipt rejected.",
    };
  } catch (error: any) {
    return { success: false, message: error?.message || "Unable to review approval." };
  }
}

export async function markInboundExcessApprovalUsedAction(
  approvalIdInput: string,
  actor: ActionActor
): Promise<void> {
  const approvalId = asTrimmedString(approvalIdInput);
  if (!approvalId) return;
  await adminDb.collection(EXCESS_APPROVAL_COLLECTION).doc(approvalId).set(
    {
      status: "used",
      usedAt: new Date().toISOString(),
      usedBy: { id: actor.id, name: actor.name || "User" },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

const isSameInboundItem = (
  inboundItem: any,
  selectedItem: PendingPoItem
) => {
  const inboundName = asTrimmedString(inboundItem?.itemName).toLowerCase();
  const selectedName = asTrimmedString(selectedItem.collectionBrand || selectedItem.itemName).toLowerCase();
  if (!inboundName || !selectedName || inboundName !== selectedName) return false;

  const inboundCollectionCode = asTrimmedString(
    inboundItem?.supplierCollectionCode ||
      inboundItem?.stockDetail?.supplierCollectionCode
  ).toLowerCase();
  const selectedCollectionCode = asTrimmedString(selectedItem.supplierCollectionCode).toLowerCase();

  if (!selectedCollectionCode) return true;
  return inboundCollectionCode === selectedCollectionCode;
};

export async function recreateInboundZohoPurchaseOrderAction(
  poData: PoCreationData,
  creator: ActionActor
): Promise<{ success: boolean; message: string }> {
  if (!creator?.id) {
    return { success: false, message: "Missing creator context." };
  }

  const items = Array.isArray(poData?.items) ? poData.items : [];
  if (!items.length) {
    return { success: false, message: "No inbound rows selected for Zoho PO regeneration." };
  }

  const inboundDocIds = [...new Set(items.map((item) => asTrimmedString(item.inboundDocId)).filter(Boolean))];
  if (inboundDocIds.length !== 1) {
    return { success: false, message: "Please select rows from a single inbound PO only." };
  }

  const selectedWithExistingZohoPo = items.find((item) => asTrimmedString(item.currentZohoPoNumber));
  if (selectedWithExistingZohoPo) {
    return { success: false, message: "Selected rows already have a Zoho PO number." };
  }

  const cleanZohoVendorId = asTrimmedString(poData.zohoVendorId);
  if (!cleanZohoVendorId) {
    return { success: false, message: "Select a Zoho vendor before creating PO." };
  }

  const cleanCandidateZohoPoNumber = asTrimmedString(poData.zohoPoNumber);
  const requestedZohoPoNumber = cleanCandidateZohoPoNumber || inboundDocIds[0];
  const nowIso = new Date().toISOString();
  const poDate = nowIso.slice(0, 10);
  const deliveryDate = toIsoDateOnly(poData.promiseDeliveryDate);
  const referenceNumber = asTrimmedString(poData.tallyPoNumber) || undefined;

  const zohoLineItemsMap = new Map(
    Array.isArray(poData.zohoLineItems)
      ? poData.zohoLineItems.map((line) => [asTrimmedString(line.sourceItemId), line])
      : []
  );
  const missingZohoItems = items.filter((item) => {
    const line = zohoLineItemsMap.get(asTrimmedString(item.id));
    return !line || !asTrimmedString(line.zohoItemId);
  });
  if (missingZohoItems.length > 0) {
    return {
      success: false,
      message: "Select Zoho item for every selected inbound row before creating PO.",
    };
  }

  try {
    const zohoPo = await createZohoPurchaseOrder({
      vendorId: cleanZohoVendorId,
      purchaseOrderNumber: requestedZohoPoNumber,
      date: poDate,
      deliveryDate,
      referenceNumber,
      notes: `Regenerated from Inbound (${items.length} item${items.length > 1 ? "s" : ""}).`,
      lineItems: items.map((item) => {
        const mapped = zohoLineItemsMap.get(asTrimmedString(item.id))!;
        const qty = asValidNumber(item.neededQty);
        const numericRate =
          mapped.rate === undefined || mapped.rate === null ? undefined : asValidNumber(mapped.rate);
        return {
          itemId: asTrimmedString(mapped.zohoItemId),
          quantity: Number.isFinite(qty) && qty > 0 ? qty : 0,
          rate: numericRate !== undefined && Number.isFinite(numericRate) ? numericRate : undefined,
          taxId: asTrimmedString(mapped.taxId) || undefined,
          taxExemptionId: asTrimmedString(mapped.taxExemptionId) || undefined,
          reverseChargeTaxId: asTrimmedString(mapped.reverseChargeTaxId) || undefined,
          reverseChargeVatId: asTrimmedString(mapped.reverseChargeVatId) || undefined,
          description: [item.collectionBrand, item.itemName].filter(Boolean).join(" - "),
        };
      }),
    });

    const inboundDocId = inboundDocIds[0];
    const inboundRef = adminDb.collection("inbounds").doc(inboundDocId) as FirebaseFirestore.DocumentReference;
    const selectedIndices = new Set(
      items
        .map((item) => (typeof item.inboundItemIndex === "number" ? item.inboundItemIndex : null))
        .filter((index): index is number => index !== null && index >= 0)
    );

    await adminDb.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
      const inboundSnap = await transaction.get(inboundRef);
      if (!inboundSnap.exists) {
        throw new Error("Inbound document not found.");
      }

      const inboundData = inboundSnap.data() as any;
      const inboundItems = Array.isArray(inboundData?.items) ? inboundData.items : [];

      const nextItems = inboundItems.map((inboundItem: any, index: number) => {
        const selectedByIndex = selectedIndices.has(index);
        const selectedByMatch =
          selectedIndices.size === 0 &&
          items.some((selectedItem) => isSameInboundItem(inboundItem, selectedItem));
        const shouldUpdate = selectedByIndex || selectedByMatch;
        if (!shouldUpdate) return inboundItem;

        return {
          ...inboundItem,
          zohoVendorId: cleanZohoVendorId,
          zohoPurchaseOrderId: zohoPo.id,
          zohoPurchaseOrderNumber: zohoPo.number,
          zohoRequestedPurchaseOrderNumber: requestedZohoPoNumber,
          zohoPoSyncedAt: nowIso,
          zohoPoSyncedBy: creator.name || "System",
        };
      });

      transaction.set(
        inboundRef,
        {
          zohoVendorId: cleanZohoVendorId,
          zohoPurchaseOrderId: zohoPo.id,
          zohoPurchaseOrderNumber: zohoPo.number,
          zohoRequestedPurchaseOrderNumber: requestedZohoPoNumber,
          zohoPoSyncedAt: nowIso,
          zohoPoSyncedBy: creator.name || "System",
          zohoSyncStatus: "synced",
          zohoSyncError: null,
          zohoSyncedAt: nowIso,
          zohoId: zohoPo.id,
          zohoNumber: zohoPo.number,
          updatedAt: nowIso,
          items: nextItems,
        },
        { merge: true }
      );

      const purchaseRequestIds = [
        ...new Set(
          [
            inboundData?.purchaseRequestId,
            ...(Array.isArray(inboundData?.purchaseRequestIds)
              ? inboundData.purchaseRequestIds
              : []),
          ]
            .map(asTrimmedString)
            .filter(Boolean)
        ),
      ];
      purchaseRequestIds.forEach((requestId) => {
        transaction.set(
          adminDb.collection("purchaseRequests").doc(requestId),
          {
            zohoVendorId: cleanZohoVendorId,
            zohoPurchaseOrderId: zohoPo.id,
            zohoPurchaseOrderNumber: zohoPo.number,
            zohoSyncStatus: "synced",
            zohoSyncError: null,
            zohoSyncedAt: nowIso,
            zohoId: zohoPo.id,
            zohoNumber: zohoPo.number,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      });
    });

    return {
      success: true,
      message: `Zoho PO ${zohoPo.number} created and linked to inbound ${inboundDocIds[0]}.`,
    };
  } catch (error: any) {
    console.error("Error regenerating Zoho PO from inbound:", error);
    return {
      success: false,
      message: error?.message || "Failed to regenerate Zoho PO from inbound rows.",
    };
  }
}
