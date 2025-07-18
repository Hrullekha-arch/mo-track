
export type UserRole = 'admin' | 'employee' | 'installer' | 'salesman';

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

export interface Order {
  id: string; // This can also be the tracking code
  crmOrderNo: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  salesPerson: string;
  orderType: OrderType;
  milestones: Milestone[];
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
}

export interface SalesmanCrmAssignment {
  id: string; // Salesman Name
  crmUserId: string;
}
