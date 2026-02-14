

import { ComboboxOption } from "@/components/ui/combobox";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";

export type UserRole = 'admin' | 'employee' | 'installer' | 'salesman' | 'Accounts' | 'Hr' | 'Purchase';

export interface PmsProduct {
  id: string;
  name: string;
  category: string;
}

export interface PmsRoutingStep {
  id: string;
  productId: string;
  stepNo: number;
  process: string;
  cycleMinutes: number;
  ops: number;
}

export interface PmsMachine {
  id: string;
  name: string;
  process: string;
  shiftMinutes: number;
  active: boolean;
}

export interface PmsPerson {
  id: string;
  name: string;
  role?: string;
}

export interface PmsSkill {
  id: string;
  machineId: string;
  personId: string;
  process: string;
  category: string;
  allowed: boolean;
}

export interface PmsDowntime {
  id: string;
  machineId: string;
  from: string;
  to: string;
  reason?: string;
}

export type PmsJobStatus = "WAITING" | "PLANNED" | "IN_PROGRESS" | "DONE";

export interface PmsJob {
  id: string;
  orderId: string;
  productId: string;
  stepNo: number;
  process: string;
  requiredMinutes: number;
  status: PmsJobStatus;
  priority?: number;
  plannedStart?: string;
  plannedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  actualMinutes?: number;
  varianceMinutes?: number;
}

export interface PmsPlan {
  id: string;
  jobId: string;
  machineId: string;
  personId: string;
  plannedStart: string;
  plannedEnd: string;
  locked?: boolean;
}

export type PmsWorkLogType = "START" | "PAUSE" | "COMPLETE";

export interface PmsWorkLog {
  id: string;
  jobId: string;
  type: PmsWorkLogType;
  at: string;
  reason?: string;
  machineId?: string;
  personId?: string;
}

export interface User {
  id: string; // Document ID, same as Firebase Auth UID
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  designation?: 'CRM' | 'Allocators' | 'PC';
  salesmanCode?: string;
  permissions?: string[]; // Array of allowed module keys
  store?: string;
  fcmTokens?: string[]; // For push notifications
}

export interface Walkin_Customer {
    id: string;
    firstName: string;
    familyName: string;
    mobile: string;
    email?: string;
    lookingFor?: string;
    createdAt: string; // ISO Date
    status?: 'Pending' | 'Attended' | 'Handed Over' | 'Deal Created' | 'Closed';
    action?: 'Create Deal' | 'Close';
    remarks?: string;
    attendedBy?: {
        id: string;
        name: string;
    };
    salesmanId?: string;
    salesmanName?: string;
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

export interface O2DProcess {
    id: string; // Document ID, should be the same as the Deal's document ID
    dealId: string; // The 4-digit numeric deal ID
    dealName: string;
    customerId: string;
    customerName: string;
    salesPerson: string;
    milestones: O2DStatus[];
    createdAt: string; // ISO Date string of deal creation
    isAcknowledged: boolean; // Becomes true when the final O2D step is complete
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
    tallyPoNumber?: string;
    vendorName?: string;
    expectedDeliveryDate?: string;
    hasPanels?: boolean;
    type?: string;
    panels?: string;
    status?: 'pending for po' | 'po generated' | 'in stock' | 'allocated';
    rate?: number; // Added from quotation
    discountPercent?: number; // Added discount from quotation
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
    gstPercent?: number;
    hsnCode?: string;
    taxableAmt?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
}

export type OrderWorkflowStatus =
  | "CREATED"
  | "ALLOCATING"
  | "ALLOCATED"
  | "IN_PRODUCTION"
  | "READY"
  | "DISPATCHED"
  | "COMPLETED"
  | "CANCELLED";

export type OrderWorkflowMilestoneStatus = "PENDING" | "DONE" | "SKIPPED";

export interface OrderWorkflowMilestone {
  key: string;
  label: string;
  status: OrderWorkflowMilestoneStatus;
  at?: string;
  by?: { id?: string; name?: string };
  note?: string;
}

export interface OrderWorkflow {
  status: OrderWorkflowStatus;
  milestones: OrderWorkflowMilestone[];
}

export interface OrderAllocationLength {
  stockItemId?: string;
  lengthId?: string;
  warehouseId?: string;
  rack?: string;
  allocatedQty?: number;
  unit?: string;
  reservedAt?: string;
  reservedBy?: { id?: string; name?: string };
}

export interface OrderAllocationLot {
  warehouseId?: string;
  allocatedQty?: number;
  unit?: string;
  reservedAt?: string;
  reservedBy?: { id?: string; name?: string };
}

export interface OrderAllocation {
  status?: "PENDING" | "PARTIAL" | "ALLOCATED" | "FAILED";
  lengths?: OrderAllocationLength[];
  lots?: OrderAllocationLot[];
  note?: string;
}

export interface OrderItem {
  roomName?: string;
  type?: string;
  category?: string;
  itemId?: string;
  bcn?: string;
  description?: string;
  unit?: string;
  rate?: number;
  exclusiveRate?: number;
  discountPercent?: number;
  discountAmount?: number;
  qty?: number;
  gst?: number;
  gstMode?: "EXCL" | "INCL";
  hsn?: string;
  group?: string;
  taxableAmount?: number;
  gstAmount?: number;
  totalAmount?: number;
  allocation?: OrderAllocation;
}

export interface OrderSectionSummary {
  subTotal?: number;
  gstTotal?: number;
  grandTotal?: number;
}

export interface OrderSection {
  items: OrderItem[];
  summary?: OrderSectionSummary;
}

export interface OrderInvoicing {
  status?: "NOT_INVOICED" | "PARTIALLY_INVOICED" | "INVOICED";
  invoices?: Array<{
    invoiceId?: string;
    invoiceNo?: string;
    invoiceType?: "GOODS" | "VAS";
    createdAt?: string;
    amount?: number;
  }>;
  canCreateGoodsInvoice?: boolean;
  canCreateVasInvoice?: boolean;
}

export interface OrderUpdate {
  updatedAt: string;
  updatedBy?: { id?: string; name?: string };
  action?: string;
  message?: string;
}

export interface Order {
  id: string; // This can also be the tracking code
  orderId?: string;
  orderNo?: string;
  quotationId?: string;
  quotationNo?: string;
  customerSnapshot?: {
    name?: string;
    phone?: string;
    gstin?: string;
    billingAddress?: CustomerAddress;
    shippingAddress?: CustomerAddress;
  };
  dealSnapshot?: {
    dealCode?: string;
    title?: string;
  };
  quotationSnapshotMeta?: {
    createdAt?: string;
    validTill?: string;
    statusAtConversion?: string;
  };
  sections?: {
    NORMAL?: OrderSection;
    VAS?: OrderSection;
  };
  overallSummary?: {
    goodsTotal?: number;
    vasTotal?: number;
    grandTotal?: number;
  };
  workflow?: OrderWorkflow;
  invoicing?: OrderInvoicing;
  updates?: OrderUpdate[];
  crmOrderNo: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  salesPerson: string;
  orderType: OrderType;
  storeName?: string;
  milestones: Milestone[];
  o2dMilestones?: O2DStatus[]; // Legacy, will be phased out
  pmsMilestones?: PmsStatus[];
  fabricDetails?: FabricDetail[];
  furnitureDetails?: FurnitureDetail[];
  vasDetails?: VasDetail[];
  totalAmount?: number;
  status?: 'Pending Approval' | 'Approved' | 'BalanceFollowUp';
  isAcknowledged: boolean;

  // For mobile view
  remarks?: string;
  assignedTo?: string; // Installer User ID
  handledByCrm?: string; // CRM User ID
  createdAt: string; // ISO Date string
  createdBy?: {
    id: string;
    name: string;
  };

  // Installer feedback
  feedbackRating?: number;
  feedbackRemarks?: string;
  bypassedOtp?: boolean;

  // Customer feedback
  customerFeedbackRating?: number;
  customerFeedbackRemarks?: string;

  otp?: string;
  completedAt?: string; // ISO Date string
  
  // Reference back to the deal
  customerId?: string;
  dealId?: string;
  dealOrderDocId?: string;
  representativeId?: string;

  // Payment fields
  balanceFollowUp?: boolean;
  paymentConfirmed?: boolean;

  // Full kitting time
  fullKittingTime?: string;
  fullKittingTimeReupdated?: boolean;
  approvedAt?: string;
  items?: any[];
}

export interface SalesmanCrmAssignment {
  id: string; // Salesman Name
  crmUserId: string;
}

// Purchase Process Types
export interface PurchaseRequest {
  id: string;
  dealId: string;
  quotationNo?: string;
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
  tallyPoNumber?: string;

  // Completion fields
  completedAt?: string;
  completedBy?: string;
}


export interface InboundItem {
    itemName: string;
    quantity: string;
    receivedQty?: string;
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
    tallyPoNumber?: string;
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
  id: string; // Document ID (BCN for master, or lengthId for length)

  // Master identity
  itemId?: string;
  productId?: string;
  bcn: string;
  bcnDigits?: string;
  name?: string;
  itemName?: string; // legacy display name

  // Classification
  category?: string;
  categoryGroup?: string;
  isService?: boolean;
  type?: string; // legacy

  // Tax/price
  costPriceRs?: number;
  rrpWithGstRs?: number;
  hsnOrSac?: string;
  gstPercent?: number;
  hsnCode?: string; // legacy
  mrp?: number; // legacy
  tax?: number; // legacy
  rlPrice?: number;
  clPrice?: number;

  // Vendor
  supplierCompanyName?: string;
  supplierCollectionName?: string;
  supplierCollectionCode?: string;
  vendorName?: string; // legacy

  // Unit/spec
  unit?: string;
  verticalRepeatCms?: number | string;
  horizontalRepeatCms?: number | string;

  // Status + totals
  isActive?: boolean;
  totalQty?: number;
  availableQty?: number;
  reservedQty?: number;
  damagedQty?: number;
  cutQty?: number;
  closingstock?: number; // legacy total
  quantity?: number; // legacy total or length quantity
  nextLengthNo?: number;

  // Length (sub-doc)
  lengthId?: string;
  lengthNo?: number;
  batchNo?: string;
  warehouseId?: string;
  originalLength?: number;
  availableLength?: number;
  rack?: string;
  status?: "AVAILABLE" | "RESERVED" | "CUT" | "CONSUMED" | "DAMAGED" | "available" | "on-hold";
  reservation?: {
    orderId?: string;
    orderNo?: string;
    reservedQty?: number;
    reservedAt?: string;
    reservedBy?: string;
  };
  cutHistory?: Array<{
    cutAt?: string;
    cutBy?: string;
    qty?: number;
    remainingQty?: number;
  }>;

  // System
  createdAt?: string;
  updatedAt?: string;
  lastUpdatedAt?: string;
  receivedAt?: string;
  lastUpdatedAtLength?: string;

  // Misc legacy fields
  serialNo?: string;
  poNumber?: string;
  salesman?: string;
}

export interface StockReservation {
    id: string; // reserveId
    orderId: string;
    reservedQty: number;
    reservedBy: string;
    timestamp: string; // ISO String
}

export interface CutRequest {
    id: string; // requestId
    orderId: string;
    cutLength: number;
    timestamp: string; // ISO String
    status: 'pending' | 'done' | 'rejected';
}

export interface CutHistory {
    id: string; // cutId
    orderId: string;
    cutLength: number;
    beforeCut: number;
    afterCut: number;
    barcodeScanned: string;
    newBarcode: string;
    cutBy: string;
    timestamp: string; // ISO String
}


export interface StockTransaction {
  id: string;
  stockId: string; // BCN
  lengthId?: string; // The specific length/roll document ID
  bcn: string;
  type: 'addition' | 'deduction' | 'reservation' | 'release';
  quantityChange: number;
  poNumber?: string;
  batchNo?: string;
  warehouseId?: string;
  rack?: string;
  orderId?: string;
  customerName?: string;
  notes?: string;
  lengths?: number[];
  lastLength?: number;
  createdAt: string; // ISO string
  createdBy: string;
  status?: 'pending for cutting' | 'cut';
  parentTransactionId?: string;
  salesman?: string;
  unit?: string;
  cutHistory?: StockTransaction[];
}

export interface CustomerAddress {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
}

export interface CustomerStats {
    totalVisits: number;
    totalQuotations: number;
    approvedQuotations: number;
    totalOrders: number;
    completedOrders: number;
    totalInvoicedAmount: number;
    totalPaidAmount: number;
    totalPendingAmount: number;
    lastVisitDate?: string | null;
    lastOrderDate?: string | null;
    lastInvoiceDate?: string | null;
}

export interface CustomerRecent {
    visits: Array<{ visitId?: string; visitNo?: string; date?: string; status?: string }>;
    quotations: Array<{ quotationId?: string; quotationNo?: string; amount?: number; status?: string }>;
    orders: Array<{ orderId?: string; orderNo?: string; amount?: number; status?: string }>;
}

export interface Customer {
    id: string;
    customerId: string;
    customerCode?: string;
    name: string;
    phone: string;
    email?: string;
    gstin?: string;
    isGstRegistered?: boolean;
    billingAddress?: CustomerAddress;
    shippingAddress?: CustomerAddress;
    customerType?: string;
    tags?: string[];
    assignedSalesPerson?: { id?: string; name?: string };
    stats?: CustomerStats;
    recent?: CustomerRecent;
    status?: string;
    createdAt: string;
    lastUpdatedAt?: string;

    // Legacy fields (to be removed after migration)
    mobileNo?: string;
    salesSupport?: string;
    addressPinCode?: string;
    landmark?: string;
    city?: string;
    state?: string;
    panNo?: string;
    referenceName?: string;
    sourceOfCustomer?: string;
    pinCode?: string;
    createdBy?: string;
    savedAddresses?: Array<{ address: string; landmark?: string }>;
}

export interface DealProduct {
    id?: string;
    productType?: string;
    productCategory?: string;
    collectionBrand: string;
    bcn?: string;
    serialNo?: string;
    itemName?: string;
    salesDescription?: string;
    quantity: string;
    mrp?: string;
    remarks?: string;
    room?: string;
    noOfPcs?: string;
    info1?: string;
    info2?: string;
    stitchingType?: "in" | "out";
    file?: any;
    rate?: number; // Added from another request, seems useful
    productSource?: string;
    subCategory?: string;
    VasType?: string;
    verticalRepeat?: string;
    horizontalRepeat?: string;
    unit?: string;
    gstPercent?: number;
    hsnOrSac?: string;
    hsnCode?: string;
    supplierCompanyName?: string;
    supplierCollectionName?: string;
    supplierCollectionCode?: string;
    category?: string;
    categoryGroup?: string;
    productId?: string;
    group?: string;
}

export interface DealProductItem {
    roomName?: string;
    type?: string;
    category?: string;
    bcn?: string;
    description?: string;
    unit?: string;
    rate?: number;
    qty?: number;
    gst?: number;
    hsn?: string;
    group?: string;
    itemName?: string;
    meta?: Record<string, any>;
}

export interface DealProductSection {
    items: DealProductItem[];
}

export interface DealProductsDoc {
    dealProductId: string;
    dealId: string;
    customerId: string;
    sections: {
        NORMAL?: DealProductSection;
        VAS?: DealProductSection;
    };
    status?: "DRAFT" | "FINALIZED" | "CONVERTED" | string;
    updates?: Array<{
        updatedAt: string;
        updatedBy?: { id?: string; name?: string };
        action?: string;
        message?: string;
    }>;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
}

export interface DeliveryInstallationItem {
    id: string;
    noOfPcs?: string;
}

export interface VisitAssignee {
    id?: string;
    name?: string;
    role?: string;
}

export interface VisitAssignmentSlot {
    date?: string;     // YYYY-MM-DD
    timeFrom?: string; // HH:mm
    timeTo?: string;   // HH:mm
}

export interface VisitAssignment {
    assignedTo?: VisitAssignee;
    assignedAt?: string;
    slot?: VisitAssignmentSlot;
}

export interface VisitLocation {
    address?: string;
    latitude?: number;
    longitude?: number;
}

export interface VisitUpdateLog {
    updatedAt: string;
    updatedBy?: {
        id?: string;
        name?: string;
    };
    action?: string;
    message?: string;
}

export interface VisitCustomerSnapshot {
    id?: string;
    name?: string;
    phone?: string;
    address?: string;
    customerType?: string;
}

export interface VisitDealSnapshot {
    dealCode?: string;
    title?: string;
}

export interface DealVisit {
    id: string;
    visitId?: string;
    visitNo?: string;
    customerId?: string;
    dealId: string; // The 4-digit numeric deal ID (or deal doc ID legacy)
    customerSnapshot?: VisitCustomerSnapshot;
    dealSnapshot?: VisitDealSnapshot;
    assignedSalesPerson?: VisitAssignee;
    visitType?: string;
    purpose?: string;
    assignment?: VisitAssignment;
    location?: VisitLocation;
    status?: string;
    cancelReason?: string;
    measurementId?: string;
    nextVisitId?: string;
    updates?: VisitUpdateLog[];
    createdAt: string; // ISO string
    updatedAt?: string;
    createdBy: string;

    // Legacy fields (kept for backward compatibility)
    representative: string;
    typeOfVisit: string;
    dueDate?: string; // ISO string, now optional on creation
    assignedTo?: string; // Installer User ID
    selectionId?: string; // Link to a pre-made selection
    // Measurement fields
    measurements?: string[];
    blinds?: string[];
    curtain?: string[];
    otherCurtain?: string;
    // Delivery/Installation fields
    deliveryInstallations?: DeliveryInstallationItem[];
    subDeliveryInstallations?: DeliveryInstallationItem[];
    otherDelivery?: string;
    status?: 'requested' | 'approved' | 'completed' | 'CWC';
    visitStatus?: 'Out for Delivery' | 'Working';
    visitStartTime?: string;
    visitEndTime?: string;
    measurementPdfUrl?: string;
    orderId?: string;
    customerAddress?: string; // Added for customer confirmation
    customerLandmark?: string; // Added for customer confirmation
    slotDate?: string;     // "YYYY-MM-DD"
    slotId?: string;       // "S1" | "S2" ...
    slotIds?: string[];    // Multiple slots for combined time
    slotLabel?: string;    // "10:00 - 11:00"
    slotStart?: string;    // "10:00"
    slotEnd?: string; 
    geofenceLat?: number;
    geofenceLng?: number;
    geofenceRadiusM?: number; // meters
}

export interface MeasurementEntry {
    id: string;
    roomName?: string;
    itemName?: string;
    noOfSheet?: string;
    fabricQty1?: string;
    stitchingRate?: string;
    foam?: { foamSize?: string; qty?: string; density?: string };
    casement?: { qty?: string };
    marking?: { qty?: string };
    niwar?: { qty?: string };
    height?: string;
    heightUnit?: string;
    width?: string;
    widthUnit?: string;
    noOfPannel?: string;
    remark?: string;
    pictures?: File[];
    pictureUrls?: string[];
    recordAudio?: File;
    audioUrl?: string;
    status?: 'complete' | 'item-needed'; // Status for this entry
    bcn?: string; // The BCN/item name added by salesman later
}


export interface DealMeasurement {
    id: string;
    selectionId?: string; // Link to a selection if applicable
    // Common fields
    typeOf: string;
    doerName: string;
    entries: MeasurementEntry[];
    createdAt: string; // ISO string
    createdBy: string;
    pdfUrl: string;
    rooms: any[];
    status?: string;
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

export interface StitchDimension {
    id: string;
    vas?: string;
    lengths?: string;
    width?: string;
    operation?: string;
    noOfPanels?: string;
    remark?: string;
}

export interface CpdItem {
  itemName: string;
  type: string;
  qty: string;
  rate?: string;
  dis?: string;
  amount?: string;
  fabricType?: 'Main' | 'Sheer' | 'Lining' | 'Sofa';
  hasDimension?: boolean;
  dimensions?: Dimension[];
  hasStitchDimension?: boolean;
  stitchDimensions?: StitchDimension[];
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

export interface DealCustomerSnapshot {
    id: string;
    name: string;
    phone: string;
    customerType?: string;
}

export interface DealDates {
    createdAt?: string;
    firstVisitDate?: string;
    measurementDate?: string;
    quotationDate?: string;
    orderDate?: string;
    closedDate?: string;
}

export interface DealRecent {
    visits: Array<{ visitId?: string; visitNo?: string; status?: string; date?: string }>;
    quotations: Array<{ quotationId?: string; quotationNo?: string; amount?: number; status?: string }>;
    orders: Array<{ orderId?: string; orderNo?: string; amount?: number; status?: string }>;
}

export interface Deal {
    id: string; // Firestore document ID
    dealId: string; // 4-digit numeric ID (same as doc id)
    dealCode?: string;
    customer?: DealCustomerSnapshot;
    title?: string;
    description?: string;
    dealType?: string;
    dealSource?: string;
    assignedSalesPerson?: { id?: string; name?: string };
    handleByCmr?: { id?: string; name?: string };
    expectedValue?: number;
    actualQuotationValue?: number;
    actualOrderValue?: number;
    status?: string;
    lostReason?: string;
    dates?: DealDates;
    recent?: DealRecent;
    lastUpdatedAt?: string;

    // Legacy fields (to be removed after migration)
    dealName?: string;
    dealAmount?: number;
    representativeId?: string;
    createdAt?: string; // ISO string
    customerId?: string;
    products?: DealProduct[];
    visits?: DealVisit[];
    measurements?: DealMeasurement[];
    advanceForMeasurement?: 'Yes' | 'No' | 'Old';
    isAcknowledged?: boolean; // True if the O2D process is complete.
    latestSelectionId?: string;
}

export interface QuotationItem {
  id?: string;
  collectionBrand: string;
  serialNo?: string;
  salesDescription: string;
  quantity: number;
  rate: number;
  exclusiveRate?: number;
  discountPercent?: number;
  amount?: number;
  room?: string;
  remark?: string;
  gstPercent?: number;
  gstMode?: "EXCL" | "INCL";
  hsnCode?: string;
  taxableAmt?: number;
  gstAmount?: number;
  totalAmount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
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
    status: 'Pending Approval' | 'Approved' | 'Converted to Order' | 'Closed';
    orderNo?: string;
    createdAt: string;
    createdBy?: string; // user id
    company?: string;
    discountPercent?: number;
    applyTax?: boolean;
    billingName?: string;
    vasDetails?: VasDetail[];
    representativeId?: string; // Salesman User ID
    approvedAt?: string;
}

export interface DealOrder {
    id: string;
    orderId?: string;
    orderNo: string;
    orderDate?: string; // ISO string
    createdBy?: string;
    remark?: string;
    status?: string;
    overallSummary?: {
        goodsTotal?: number;
        vasTotal?: number;
        grandTotal?: number;
    };
    items?: QuotationItem[];
}

export interface Selection {
    id: string; // 4-digit ID
    createdAt: string;
    createdBy: string;
    totalMrp: number;
    totalPcs: number;
    totalRooms: number;
    products: any[];
    status?: 'draft' | 'final';
}

export interface InvoiceBatchItem {
    itemName: string;
    bcn: string;
    quantityAllocated: number;
    rate: number;
    discountPercent?: number; // Added field
    originalLength?: number;
    stockAddedId?: string;
    stockSoldId?: string;
}

export interface InvoiceLineItem {
    name?: string;
    itemName?: string;
    bcn?: string;
    hsn?: string;
    quantity?: number;
    quantityAllocated?: number;
    rate?: number;
    exclusiveRate?: number;
    discountPercent?: number;
    discountAmount?: number;
    taxableAmount?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    total?: number;
    uom?: string;
}

export interface InvoiceBatch {
    id: string;
    orderId: string;
    customerName: string;
    customerPhone: string;
    customerAddress?: string;
    salesPerson?: string;
    createdAt: string | AdminTimestamp;
    status: 'pendingInvoice' | 'invoiced';
    items: InvoiceBatchItem[];
    tallyBillNo?: string | null;
    tallyVoucherNo?: string;
    invoiceId?: string;
    isCombined?: boolean;
    isVas?: boolean;
    combinedFromBatches?: string[];
}

export interface Invoice {
    id: string; // Firestore document ID
    invoiceNo: string; // e.g. MOTRACK-INV-1234
    invoiceId?: string;
    invoiceType?: "NORMAL" | "VAS" | "MIXED";
    invoiceDate?: string;
    orderId: string;
    orderNo?: string;
    customerId?: string;
    tallyBillNo?: string;
    tallyVoucherNo?: string;
    isVas?: boolean;
    status?: "ISSUED" | "CANCELLED" | "VOID";
    isLocked?: boolean;
    sellerSnapshot?: {
      companyName?: string;
      address?: string;
      gstin?: string;
    };
    customerSnapshot?: {
      name?: string;
      phone?: string;
      address?: string;
      gstin?: string;
    };
    sections?: {
      NORMAL?: {
        items: Array<{
          roomName?: string;
          type?: string;
          bcn?: string;
          description?: string;
          unit?: string;
          rate?: number;
          qty?: number;
          gst?: number;
          hsn?: string;
          group?: string;
          taxableAmount?: number;
          gstAmount?: number;
          totalAmount?: number;
          allocationRef?: {
            lengthId?: string;
            stockItemId?: string;
          };
        }>;
        summary?: {
          subTotal?: number;
          gstTotal?: number;
          grandTotal?: number;
        };
      };
      VAS?: {
        items: Array<{
          roomName?: string;
          type?: "VAS" | string;
          description?: string;
          unit?: string;
          rate?: number;
          qty?: number;
          gst?: number;
          hsn?: string;
          group?: string;
          taxableAmount?: number;
          gstAmount?: number;
          totalAmount?: number;
        }>;
        summary?: {
          subTotal?: number;
          gstTotal?: number;
          grandTotal?: number;
        };
      };
    };
    overallSummary?: {
      goodsTotal?: number;
      vasTotal?: number;
      grandTotal?: number;
    };
    taxSummary?: {
      NORMAL?: { cgst?: number; sgst?: number; igst?: number };
      VAS?: { cgst?: number; sgst?: number; igst?: number };
    };
    payment?: Record<string, any>;
    customer: {
        name: string;
        phone: string;
        address: string;
    };
    salesPerson: string;
    items: InvoiceLineItem[];
    totals: {
        subTotal: number;
        discount?: number;
        totalDiscount?: number;
        taxableValue: number;
        cgst: number;
        sgst: number;
        igst: number;
        roundOff: number;
        grandTotal: number;
        totalGst?: number;
    };
    gstPercentages?: {
        cgst: number;
        sgst: number;
        igst: number;
        total: number;
    };
    createdAt: string; // ISO Date string
    createdBy: string; // User name
    tallySalesXml?: string; // To store the generated XML
}

export interface PrintableInvoicePayload {
  meta: {
    invoiceNo?: string;
    orderNo: string;
    quotationNo?: string;
    invoiceDate: string; // ISO string
    isVas: boolean;
    salesPerson?: string;
    architect?: string;
  };
  customer: {
    name: string;
    phone: string;
    address: string;
    gstin?: string;
  };
  seller: {
    companyName: string;
    address: string;
    gstin: string;
  };
  items: Array<{
    name: string;
    bcn: string;
    hsn: string;
    quantity: number;
    uom: string;
    rate: number;
    exclusiveRate?: number;
    discountPercent: number;
    discountAmount?: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }>;
  totals: {
    subTotal: number;
    discount: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    roundOff: number;
    grandTotal: number;
    totalGst: number;
  };
  gstBreakdown: Array<{
    rate: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
  }>
}

export interface CuttingTaskItem {
    itemName: string;
    bcn: string;
    quantityAllocated: number;
    rate: number;
    status: 'pending' | 'cut';
    originalLength?: number;
    stockAddedId?: string;
    stockSoldId?: string;
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

export interface TaxDetail {
    id: string; // Firestore document ID
    hsnOrSac: string;
    gstPercent: number;
}

export interface Receipt {
    id: string;
    amount: number;
    date: string; // ISO string
    mode: 'Cash' | 'Card' | 'UPI' | 'Cheque';
    referenceNo?: string;
    remarks?: string;
    createdBy: string;
    createdAt: string;
}

export interface ApprovedStockItem {
    id: string;
    orderId: string;
    crmOrderNo: string;
    dealId?: string;
    customerName: string;
    salesPerson: string;
    fabricName: string;
    quantity: string;
    status: 'Pending Stock Verification' | 'In Stock' | 'PR Created';
    createdAt: string;
    createdBy: {
        id: string;
        name: string;
    };
    itemDetail: FabricDetail;
}

// Owner types for handover logic
export type OwnerType = "CRM" | "SALESMAN" | "ALLOCATOR" | "ACCOUNT";

export type OwnerRef = {
  id: string;
  type: OwnerType;
};

export type HandoverStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "ACTIVE" | "EXPIRED";
export type HandoverScopeType = "ALL_WORK" | "CHILD_OWNERS";
export type OwnerAvailabilityStatus = "AVAILABLE" | "AWAY" | "ON_LEAVE" | "BUSY";
export type AssignmentReason = "NORMAL" | "HANDOVER" | "EMERGENCY" | "ESCALATION";

export type OwnerAvailability = {
  owner: OwnerRef;
  status: OwnerAvailabilityStatus;
  backupOwnerId?: string;
};

export type AssignmentEnvelope = {
  originalOwner: OwnerRef;
  assignedOwner: OwnerRef;
  assignmentReason: AssignmentReason;
  handoverRequestId: string | null;
  assignedAt: string;
};

export type HandoverRequest = {
  id: string;
  fromOwner: OwnerRef;
  toOwner: OwnerRef;
  scopeType: HandoverScopeType;
  childOwnerType?: OwnerType;
  childOwnerIds?: string[];
  startAt: string;
  endAt: string | null;
  status: HandoverStatus;
  note: string;
  createdAt: string;
  acceptedAt?: string | null;
  acceptedBy?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
};

export { type ComboboxOption };
