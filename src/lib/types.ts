




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
}

export interface FurnitureDetail {
    furnitureName: string;
    quantity: string;
    poNumber?: string;
    vendorName?: string;
    expectedDeliveryDate?: string;
    inboundMilestones?: InboundMilestone[];
}


export interface Order {
  id: string; // This can also be the tracking code
  crmOrderNo: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  salesPerson: string;
  orderType: OrderType;
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

  // These come from the purchase request, but might be useful to have here
  // for generating the barcode sticker without another DB read.
  fabricDetails?: FabricDetail[];
  furnitureDetails?: FurnitureDetail[];

  // Installer feedback
  feedbackRating?: number;
  feedbackRemarks?: string;
  bypassedOtp?: boolean;

  // Customer feedback
  customerFeedbackRating?: number;
  customerFeedbackRemarks?: string;

  otp?: string;
  completedAt?: string; // ISO Date string
}

export interface SalesmanCrmAssignment {
  id: string; // Salesman Name
  crmUserId: string;
}

// Purchase Process Types
export interface PurchaseRequest {
  id: string;
  type: 'fabric' | 'furniture';
  email: string;
  dealId: string;
  customerName: string;
  promiseDeliveryDate: string; // ISO Date string
  salesman: string;
  workType: string;
  
  fabricDetails?: FabricDetail[];
  furnitureDetails?: FurnitureDetail[];
  
  createdAt: string; // ISO Date string
  createdBy: {
    id: string;
    name: string;
  };
  milestones: PurchaseStatus[];
  vendorType: 'existing' | 'new' | 'undecided';
  status: 'pending' | 'completed' | 'cancelled';
  remarks?: string;

  // PO Tracking
  poMilestones?: PurchaseStatus[];
  poDeliveryDate?: string | null; // Date promised by vendor
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
