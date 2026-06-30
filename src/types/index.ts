export type DrawingStatus = "pending" | "approved" | "rejected";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type BomStatus = "locked" | "released";
export type WorkshopStatus = "waiting" | "in-progress" | "completed";

export interface Measurement {
  width: number;
  length: number;
  height: number;
  headboard: number;
  storageType: string;
  remarks?: string;
}

export interface DrawingInfo {
  drawingNo: string;
  status: DrawingStatus;
}

export interface ProductionOrderRecord {
  id: string;
  orderNo: string;
  customerName: string;
  phone: string;
  customerDemand: string;
  bedType: string;
  roomName: string;
  formStatus: "filled";
  measurement: Measurement;
  bedDrawing: DrawingInfo;
  furnitureDrawing: DrawingInfo;
  approvalStatus: ApprovalStatus;
  barcode: string | null;
  allItemsAvailable: boolean;
  bomStatus: BomStatus;
  workshopStatus: WorkshopStatus;
  createdAt: string;
}

export interface BomCheckpoint {
  id: string;
  orderId: string;
  code: string;
  material: string;
  requiredQty: string;
  available: boolean;
  location: string;
}

export interface PersonResource {
  id: string;
  name: string;
  role: string;
  helperType?: string;
  mobile?: string;
  active: boolean;
}

export interface MachineResource {
  id: string;
  code: string;
  name: string;
  category: string;
  process: string;
  active: boolean;
}

export interface RoutingStep {
  id: string;
  productType: string;
  stepNo: number;
  stageName: string;
  checkpoint: string;
  estimatedHours: number;
}

export interface WorkshopLogStartInput {
  orderId: string;
  personId: string;
  helperName?: string;
  machineId?: string;
  note?: string;
}

export interface WorkshopLogEndInput {
  orderId: string;
  personId: string;
  machineId?: string;
  durationHours: number;
  labourRate: number;
  machineRate?: number;
  note?: string;
}
