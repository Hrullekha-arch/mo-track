

import { ComboboxOption } from "@/components/ui/combobox";

export type UserRole = 'admin' | 'employee' | 'installer' | 'salesman' | 'Accounts' | 'Hr';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  designation?: 'CRM' | 'Allocators' | 'PC';
  salesmanCode?: string;
}

export type OrderType = 'delivery' | 'stitching' | 'stitching+installation';

export interface Milestone {
  id: number;
  name: string;
  completed: boolean;
  completedBy?: string | null; // User name
  completedAt?: string | null; // ISO Date string
  location?: {
    latitude: number;
    longitude: number;
  } | null;
}

export interface PmsStatus {
    stepId: number;
    status: 'completed';
    completedAt: string; // ISO Date string
    completedBy: string; // User name
}

export interface O2DStatus {
    stepId: number;
    status: 'completed' | 'skipped' | 'pending';
    completedAt: string; // ISO Date string for when the status was set
    completedBy: string; // User name
    remarks?: string;
    selection?: string;
}

export interface O2DStep {
    id: number;
    step: string;
    details: string;
    time: string;
    role: string;
    icon: React.ElementType;
    expectedDuration: {
        days?: number;
        hours?: number;
        minutes?: number;
    }
}

export interface InboundMilestone {
    stepId: number;
    status: 'completed' | 'pending';
    completedAt: string;
    completedBy: string;
}

export interface FabricDetail {
    fabricName: string;
    quantity: string;
    poNumber?: string;
    vendorName?: string;
    expectedDeliveryDate?: string;
    inboundMilestones?: InboundMilestone[];
    hasPanels?: boolean;
    type?: string;
    panels?: string;
}

export interface VasDetail {
    vasName: string;
    rate: string;
    quantity: string;
    room?: string;
    taxableAmt?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
}

export interface Order {
  id: string; // This can also be the tracking code
  crmOrderNo: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  salesPerson: string;
  orderType: OrderType;
  storeName?: string;
  milestones: Milestone[];
  o2dMilestones?: O2DStatus[];
  pmsMilestones?: PmsStatus[];
  remarks?: string;
  assignedTo?: string; // Installer User ID
  handledByCrm?: string; // CRM User ID
  createdAt: string; // ISO Date string
  createdBy?: {
    id: string;
    name: string;
  },
  isAcknowledged: boolean;

  // Installer feedback
  feedbackRating?: number;
  feedbackRemarks?: string;
  bypassedOtp?: boolean;

  // Customer feedback
  customerFeedbackRating?: number;
  customerFeedbackRemarks?: string;

  otp?: string;
  completedAt?: string; // ISO Date string
  fabricDetails?: FabricDetail[];
  furnitureDetails?: never; // Deprecated
  status?: 'Pending Approval' | 'Approved';
  
  // Reference back to the deal
  customerId?: string;
  dealId?: string;
  dealOrderDocId?: string;
}

export interface SalesmanCrmAssignment {
  id: string; // Salesman Name
  crmUserId: string;
}

// Purchase Process Types
export interface PurchaseRequest {
  id: string;
  dealId: string;
  customerName: string;
  promiseDeliveryDate: string; // ISO Date string
  salesman: string;
  email?: string;
  type: 'fabric'; // Always fabric now
  workType?: 'stitching' | 'production' | 'delivery';
  
  fabricDetails: FabricDetail[];
  furnitureDetails?: never; // Deprecated
  vasDetails?: VasDetail[];
  
  createdAt: string; // ISO Date string
  createdBy: {
    id: string;
    name: string;
  };
  milestones: PurchaseStatus[];
  vendorType: 'existing' | 'new' | 'undecided';
  status: 'Pending Approval' | 'Approved' | 'PO Generated' | 'Completed' | 'Cancelled';
  remarks?: string;

  // PO Tracking
  poMilestones?: PurchaseStatus[];
  poDeliveryDate?: string | null; // Date promised by vendor

  // New PO creation fields
  vendor?: string;
  courier?: string;
  mode?: string;

  // Completion fields
  completedAt?: string;
  completedBy?: string;
}

export interface PurchaseStatus {
  stepId: number;
  status: 'completed' | 'skipped' | 'pending';
  completedAt: string; // ISO Date string
  completedBy: string; // User name
  remarks?: string;
  poNumber?: string;
  vendorName?: string;
  quantity?: string;
  itemName?: string;
}

export interface PurchaseStep {
    id: number;
    step: string;
    details: string;
    time: string;
    role: string;
    icon: React.ElementType;
    expectedDuration: {
        days?: number;
        hours?: number;
        minutes?: number;
    }
}

export interface Stock {
  id: string; // Document ID
  itemName: string; // from Distributor Collection Name
  bcn?: string;
  serialNo?: string;
  hsnCode?: string;
  rlPrice?: number;
  clPrice?: number;
  mrp?: number;
  category?: string;
  vendorName?: string;
  quantity: number; // You may want a default or handle this from import
  unit: string;
  type: 'fabric' | 'furniture' | string; // Making it flexible
  lastUpdatedAt: string; // ISO Date
}

export interface StockTransaction {
  id: string;
  stockId: string;
  bcn: string;
  type: 'addition' | 'deduction';
  quantityChange: number;
  poNumber?: string;
  orderId?: string;
  lengths?: number[];
  createdAt: string; // ISO string
  createdBy: string;
}

export interface Customer {
    id: string;
    name: string;
    mobileNo: string;
    email?: string;
    architect?: string;
    salesSupport?: string;
    landmark?: string;
    city?: string;
    state?: string;
    addressPinCode?: string;
    gstin?: string;
    panNo?: string;
    referenceName?: string;
    sourceOfCustomer?: string;
    pinCode?: string;
    createdAt: string;
    createdBy: string;
}

export interface DealProduct {
    id?: string;
    productCategory?: string;
    collectionBrand: string;
    serialNo?: string;
    salesDescription?: string;
    quantity: string;
    remarks?: string;
    room?: string;
    noOfPcs?: string;
    info1?: string;
    info2?: string;
    stitchingType?: "in" | "out";
    file?: any;
}

export interface DeliveryInstallationItem {
    id: string;
    noOfPcs?: string;
}

export interface DealVisit {
    id: string;
    dealId: string; // The 4-digit numeric deal ID
    representative: string;
    typeOfVisit: string;
    dueDate: string; // ISO string
    createdAt: string; // ISO string
    createdBy: string;
    assignedTo?: string; // Installer User ID
    // Measurement fields
    measurements?: string[];
    blinds?: string[];
    curtain?: string[];
    otherCurtain?: string;
    // Delivery/Installation fields
    deliveryInstallations?: DeliveryInstallationItem[];
    subDeliveryInstallations?: DeliveryInstallationItem[];
    otherDelivery?: string;
}


export interface DealMeasurement {
    id: string;
    room: string;
    measurementReference: string;
    noOfUnits: string;
    measurement: string;
    fileUrl?: string; // URL to the uploaded file in storage
    createdAt: string; // ISO string
    createdBy: string;
}

export interface AdvanceDetail {
    id: string;
    name: string;
    pcs: string;
    imageUrl?: string;
}

export interface Dimension {
    id: string;
    length?: string;
    width?: string;
    type?: string[];
    advanceDetails?: AdvanceDetail[];
}

export interface CpdItem {
  itemName: string;
  type: string;
  qty: string;
  rate?: string;
  dis?: string;
  gst?: string;
  amount?: string;
  hasDimension?: boolean;
  dimensions?: Dimension[];
}

export interface CpdRoom {
  room: string;
  items: CpdItem[];
}

export interface Cpd {
  id: string; // firestore doc id
  cpdId: string; // 4 digit id
  representative?: string;
  customerName?: string;
  telNo?: string;
  date?: string;
  rooms: CpdRoom[];
  createdAt: string;
  createdBy: string;
}

export interface Deal {
    id: string; // Firestore document ID
    dealId: string; // 4-digit numeric ID
    dealName: string;
    dealAmount: number;
    representativeId: string;
    description: string;
    createdAt: string; // ISO string
    products?: DealProduct[];
    visits?: DealVisit[];
    measurements?: DealMeasurement[];
    advanceForMeasurement?: 'Yes' | 'No' | 'Old';
}

export interface QuotationItem {
  id?: string;
  collectionBrand: string;
  serialNo?: string;
  salesDescription: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  amount?: number;
  room?: string;
  remark?: string;
}

export interface Quotation {
    id: string;
    quotationNo: string;
    store: string;
    date: string | Date;
    validTillDate?: string | Date;
    customerName: string;
    dealName: string;
    cpdId?: string;
    items: QuotationItem[];
    totalAmount: number;
    status: 'Pending Approval' | 'Approved' | 'Converted to Order';
    orderNo?: string;
    createdAt: string;
    createdBy?: string; // user id
    company?: string;
    discountPercent?: number;
    applyTax?: boolean;
    billingName?: string;
    vasDetails?: VasDetail[];
}

export interface DealOrder {
    id: string;
    orderNo: string;
    orderDate: string; // ISO string
    createdBy: string;
    remark?: string;
    items: QuotationItem[];
    status: 'Pending Approval' | 'Approved';
}

export { type ComboboxOption };
