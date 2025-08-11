

import { ComboboxOption } from "@/components/ui/combobox";
import { Timestamp } from "firebase/firestore";

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
    hasPanels?: boolean;
    type?: string;
    panels?: string;
}

export interface FurnitureDetail {
    furnitureName: string;
    quantity: string;
    poNumber?: string;
    vendorName?: string;
    expectedDeliveryDate?: string;
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
  };
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
  furnitureDetails?: FurnitureDetail[];
  vasDetails?: VasDetail[];
  status?: 'Pending Approval' | 'Approved';
  
  // Reference back to the deal
  customerId?: string;
  dealId?: string;
  dealOrderDocId?: string;
  totalAmount?: number;
  representativeId?: string;
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
  type: 'fabric' | 'furniture'; 
  workType?: 'stitching' | 'production' | 'delivery';
  
  fabricDetails?: FabricDetail[];
  furnitureDetails?: FurnitureDetail[];
  
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


export interface InboundItem {
    itemName: string;
    quantity: string;
    unit: 'Mtr' | 'Pcs';
    poNumber?: string;
    inboundMilestones: InboundMilestone[];
}

export interface InboundRequest {
    id: string; // Corresponds to the PurchaseRequest ID (dealId)
    purchaseRequestId: string;
    dealId: string;
    customerName: string;
    vendor: string;
    createdAt: string;
    status: 'Active' | 'Completed';
    completedAt?: string;
    completedBy?: string;
    items: InboundItem[];
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
  rack?: string;
}

export interface StockTransaction {
  id: string;
  stockId: string;
  bcn: string;
  type: 'addition' | 'deduction';
  quantityChange: number; // if addition, total length. If deduction, length cut.
  poNumber?: string;
  orderId?: string;
  lengths?: number[]; // if addition, original lengths. if deduction, length(s) cut.
  originalLength?: number;
  createdAt: string; // ISO string
  createdBy: string;
  status?: 'pending for cutting' | 'cut';
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
    representativeId?: string; // Salesman User ID
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

export interface InvoiceBatchItem {
    itemName: string;
    bcn: string;
    quantityAllocated: number;
    rate: number;
    originalLength?: number;
}

export interface InvoiceBatch {
    id: string;
    orderId: string;
    customerName: string;
    customerPhone: string;
    createdAt: Timestamp;
    status: 'pending' | 'invoiced';
    items: InvoiceBatchItem[];
    tallyBillNo?: string | null;
    invoiceId?: string;
}

export interface Invoice {
    id: string; // Firestore document ID
    invoiceNo: string; // e.g. MOTRACK-INV-1234
    orderId: string;
    tallyBillNo?: string;
    customer: {
        name: string;
        phone: string;
        address: string;
    };
    salesPerson: string;
    items: InvoiceBatchItem[];
    totals: {
        subTotal: number;
        totalDiscount: number;
        taxableValue: number;
        cgst: number;
        sgst: number;
        igst: number;
        roundOff: number;
        grandTotal: number;
    };
    createdAt: string; // ISO Date string
    createdBy: string; // User name
}

export interface CuttingTaskItem {
    itemName: string;
    bcn: string;
    quantityAllocated: number;
    rate: number;
    status: 'pending' | 'cut';
    originalLength?: number;
}

export interface CuttingTask {
  id: string; // Firestore doc id, can be same as invoiceId
  invoiceId: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  salesPerson: string;
  items: CuttingTaskItem[];
  createdAt: string; // ISO Date string
  status: 'Pending' | 'In Progress' | 'Completed';
}

export { type ComboboxOption };
