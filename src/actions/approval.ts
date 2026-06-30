"use server";

import { getOrders } from "./order";

export async function getApprovalQueue() {
  const orders = await getOrders();
  return orders.map((order) => ({
    id: order.id,
    orderNo: order.orderNo,
    customerName: order.customerName,
    customerDemand: order.customerDemand,
    bedDrawing: order.bedDrawing,
    furnitureDrawing: order.furnitureDrawing,
    approvalStatus: order.approvalStatus,
    barcode: order.barcode,
  }));
}

export async function confirmDrawing(orderId: string, smName = "SM") {
  const orders = await getOrders();
  const order = orders.find((item) => item.id === orderId);

  if (!order) {
    return { success: false, message: "Order not found." };
  }

  return {
    success: true,
    message: `Drawing confirmed by ${smName}. Barcode generated successfully.`,
    barcode: `BC-${order.orderNo.replace(/[^A-Z0-9]/gi, "")}`,
  };
}

export async function rejectDrawing(orderId: string, smName = "SM") {
  const orders = await getOrders();
  const order = orders.find((item) => item.id === orderId);

  if (!order) {
    return { success: false, message: "Order not found." };
  }

  return {
    success: true,
    message: `Drawing rejected by ${smName}. Furniture drawing sent back for correction.`,
  };
}
