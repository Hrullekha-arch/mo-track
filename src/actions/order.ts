"use server";

import type { ProductionOrderRecord } from "@/types";

const MOCK_ORDERS: ProductionOrderRecord[] = [
  {
    id: "mdf-1001",
    orderNo: "MO-1001",
    customerName: "Ritika Sharma",
    phone: "9504892075",
    customerDemand: "Hydraulic storage bed with side drawer, warm walnut finish, and stitched headboard.",
    bedType: "King Bed",
    roomName: "Master Bedroom",
    formStatus: "filled",
    measurement: { width: 78, length: 72, height: 42, headboard: 48, storageType: "Hydraulic" },
    bedDrawing: { drawingNo: "BED-3001", status: "approved" },
    furnitureDrawing: { drawingNo: "FUR-3001", status: "approved" },
    approvalStatus: "approved",
    barcode: "BC-MO1001",
    allItemsAvailable: true,
    bomStatus: "released",
    workshopStatus: "in-progress",
    createdAt: "2026-05-17 09:20",
  },
  {
    id: "mdf-1002",
    orderNo: "MO-1002",
    customerName: "Vikram Anand",
    phone: "9876543210",
    customerDemand: "Queen bed with fluted panel finish, side table pair, and box storage.",
    bedType: "Queen Bed",
    roomName: "Guest Bedroom",
    formStatus: "filled",
    measurement: { width: 84, length: 66, height: 44, headboard: 50, storageType: "Box Storage" },
    bedDrawing: { drawingNo: "BED-3002", status: "approved" },
    furnitureDrawing: { drawingNo: "FUR-3002", status: "pending" },
    approvalStatus: "pending",
    barcode: null,
    allItemsAvailable: false,
    bomStatus: "locked",
    workshopStatus: "waiting",
    createdAt: "2026-05-17 11:15",
  },
  {
    id: "mdf-1003",
    orderNo: "MO-1003",
    customerName: "Nisha Arora",
    phone: "9123456780",
    customerDemand: "Kids bed with rounded edges, rail protection, and toy drawer base.",
    bedType: "Kids Bed",
    roomName: "Kids Room",
    formStatus: "filled",
    measurement: { width: 72, length: 42, height: 38, headboard: 36, storageType: "Drawer Storage" },
    bedDrawing: { drawingNo: "BED-3003", status: "approved" },
    furnitureDrawing: { drawingNo: "FUR-3003", status: "rejected" },
    approvalStatus: "rejected",
    barcode: null,
    allItemsAvailable: false,
    bomStatus: "locked",
    workshopStatus: "waiting",
    createdAt: "2026-05-17 12:40",
  },
];

export async function getOrderOverview() {
  return {
    totalOrders: MOCK_ORDERS.length,
    pendingApprovals: MOCK_ORDERS.filter((order) => order.approvalStatus === "pending").length,
    bomReleased: MOCK_ORDERS.filter((order) => order.bomStatus === "released").length,
    workshopLive: MOCK_ORDERS.filter((order) => order.workshopStatus === "in-progress").length,
  };
}

export async function getOrders() {
  return MOCK_ORDERS;
}

export async function getOrderById(id: string) {
  return MOCK_ORDERS.find((order) => order.id === id) ?? null;
}

export async function submitOrderDraft(payload: Partial<ProductionOrderRecord>) {
  return {
    success: true,
    message: "Order registered. Bed measurement captured and drawing queue can start now.",
    payload,
  };
}
