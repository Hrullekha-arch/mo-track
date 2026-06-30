export type ProductionFlowOrder = {
  id: string;
  orderNo: string;
  customerName: string;
  phone: string;
  customerDemand: string;
  bedType: string;
  roomName: string;
  formStatus: "filled";
  measurement: {
    width: number;
    length: number;
    height: number;
    headboard: number;
    storageType: string;
  };
  bedDrawing: {
    drawingNo: string;
    status: "pending" | "approved" | "rejected";
  };
  furnitureDrawing: {
    drawingNo: string;
    status: "pending" | "approved" | "rejected";
  };
  approvalStatus: "pending" | "approved" | "rejected";
  barcode: string | null;
  allItemsAvailable: boolean;
  bomStatus: "locked" | "released";
  workshopStatus: "waiting" | "in-progress";
  createdAt: string;
};

export type BomMaterialLine = {
  id: string;
  orderId: string;
  code: string;
  material: string;
  requiredQty: string;
  available: boolean;
  location: string;
};

export const productionOrders: ProductionFlowOrder[] = [
  {
    id: "ord-1001",
    orderNo: "SO-1001",
    customerName: "Ritika Sharma",
    phone: "9504892075",
    customerDemand: "Hydraulic storage bed in walnut tone with side drawer and stitched headboard.",
    bedType: "King Bed",
    roomName: "Master Bedroom",
    formStatus: "filled",
    measurement: {
      width: 78,
      length: 72,
      height: 42,
      headboard: 48,
      storageType: "Hydraulic",
    },
    bedDrawing: {
      drawingNo: "BED-2401",
      status: "approved",
    },
    furnitureDrawing: {
      drawingNo: "FUR-2401",
      status: "approved",
    },
    approvalStatus: "approved",
    barcode: "BC-SO1001",
    allItemsAvailable: true,
    bomStatus: "released",
    workshopStatus: "in-progress",
    createdAt: "2026-05-17 09:30",
  },
  {
    id: "ord-1002",
    orderNo: "SO-1002",
    customerName: "Vikram Anand",
    phone: "9876543210",
    customerDemand: "Queen bed with two side tables, soft close storage, and fluted panel finish.",
    bedType: "Queen Bed",
    roomName: "Guest Bedroom",
    formStatus: "filled",
    measurement: {
      width: 84,
      length: 66,
      height: 44,
      headboard: 50,
      storageType: "Box Storage",
    },
    bedDrawing: {
      drawingNo: "BED-2402",
      status: "approved",
    },
    furnitureDrawing: {
      drawingNo: "FUR-2402",
      status: "pending",
    },
    approvalStatus: "pending",
    barcode: null,
    allItemsAvailable: false,
    bomStatus: "locked",
    workshopStatus: "waiting",
    createdAt: "2026-05-17 11:10",
  },
  {
    id: "ord-1003",
    orderNo: "SO-1003",
    customerName: "Nisha Arora",
    phone: "9123456780",
    customerDemand: "Kids bed with safety rail, toy storage base, and rounded edges.",
    bedType: "Kids Bed",
    roomName: "Kids Room",
    formStatus: "filled",
    measurement: {
      width: 72,
      length: 42,
      height: 38,
      headboard: 36,
      storageType: "Drawer Storage",
    },
    bedDrawing: {
      drawingNo: "BED-2403",
      status: "approved",
    },
    furnitureDrawing: {
      drawingNo: "FUR-2403",
      status: "rejected",
    },
    approvalStatus: "rejected",
    barcode: null,
    allItemsAvailable: false,
    bomStatus: "locked",
    workshopStatus: "waiting",
    createdAt: "2026-05-17 12:25",
  },
];

export const bomMaterialLines: BomMaterialLine[] = [
  {
    id: "bom-1",
    orderId: "ord-1001",
    code: "RM-101",
    material: "Seasoned Oak Wood",
    requiredQty: "2.5 cft",
    available: true,
    location: "Rack A1",
  },
  {
    id: "bom-2",
    orderId: "ord-1001",
    code: "RM-205",
    material: "Premium Upholstery Fabric",
    requiredQty: "5 meter",
    available: true,
    location: "Fabric Bay 3",
  },
  {
    id: "bom-3",
    orderId: "ord-1002",
    code: "RM-318",
    material: "Foam Sheet 40D",
    requiredQty: "2 sheet",
    available: false,
    location: "Waiting Purchase",
  },
  {
    id: "bom-4",
    orderId: "ord-1002",
    code: "RM-411",
    material: "Walnut Polish",
    requiredQty: "1 liter",
    available: true,
    location: "Finish Store",
  },
];

export function getProductionOrder(id: string) {
  return productionOrders.find((order) => order.id === id);
}

export function getOrderBomLines(id: string) {
  return bomMaterialLines.filter((line) => line.orderId === id);
}

export const productionOverview = {
  totalOrders: productionOrders.length,
  pendingApprovals: productionOrders.filter((order) => order.approvalStatus === "pending").length,
  bomReleased: productionOrders.filter((order) => order.bomStatus === "released").length,
  workshopReady: productionOrders.filter((order) => order.barcode).length,
};
