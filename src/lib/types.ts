

import { ComboboxOption } from "@/components/ui/combobox";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";

export type UserRole = 'admin' | 'employee' | 'installer' | 'salesman' | 'Accounts' | 'Hr';

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
  id: string; // Document ID of the length, e.g. "Length1"
  bcn: string; // The BCN, which is the parent document's ID
  itemName: string;
  serialNo?: string;
  hsnCode?: string;
  rlPrice?: number;
  clPrice?: number;
  mrp?: number;
  tax?: number;
  category?: string;
  vendorName?: string;
  quantity: number; // Original length of this roll/piece
  availableQty: number; // Available length = quantity - reservedQty
  reservedQty: number; // Reserved for orders but not yet cut
  cutQty: number; // Physically cut from this roll
  unit: string;
  type: string;
  lastUpdatedAt: string; // ISO Date
  rack?: string;
  status?: "available" | "on-hold";
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
  type: 'addition' | 'deduction';
  quantityChange: number;
  poNumber?: string;
  orderId?: string;
  lengths?: number[];
  lastLength?: number;
  createdAt: string; // ISO string
  createdBy: string;
  status?: 'pending for cutting' | 'cut';
  parentTransactionId?: string;
  salesman?: string;
  cutHistory?: StockTransaction[];
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
    savedAddresses?: Array<{ address: string; landmark?: string }>;
}

export interface DealProduct {
    id?: string;
    productType?: string;
    productCategory?: string;
    collectionBrand: string;
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
    dueDate?: string; // ISO string, now optional on creation
    createdAt: string; // ISO string
    createdBy: string;
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
  discountPercent?: number;
  amount?: number;
  room?: string;
  remark?: string;
  gstPercent?: number;
  hsnCode?: string;
  taxableAmt?: number;
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
    orderNo: string;
    orderDate: string; // ISO string
    createdBy: string;
    remark?: string;
    items: QuotationItem[];
    status: 'Pending Approval' | 'Approved';
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
    orderId: string;
    tallyBillNo?: string;
    tallyVoucherNo?: string;
    isVas?: boolean;
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
    discountPercent: number;
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
    hsnCode: string;
    gst: number;
    cgst: number;
    sgst: number;
    igst: number;
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
