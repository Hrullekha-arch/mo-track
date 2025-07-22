import { type Milestone, type OrderType, type PurchaseStep, O2DStep } from './types';
import { ThumbsUp, Truck, FileCheck, Send, User, Users, Banknote, ClipboardCheck, Box, ArrowRightCircle, UserCheck, PackageSearch, MessageSquare, Briefcase, FileText, BadgePercent, Timer, ShoppingCart } from 'lucide-react';


export const MILESTONES_CONFIG: Record<number, { name: string }> = {
  1: { name: 'Order Received' },
  2: { name: 'Fabric Allocated' },
  3: { name: 'Sent to Stitching' },
  4: { name: 'Stitching Done' },
  5: { name: 'Ready for Delivery' },
  6: { name: 'Installation Scheduled' },
  7: { name: 'Out for Delivery/Installation' },
  8: { name: 'Installation Done' },
};

export const ORDER_TYPE_MILESTONES: Record<OrderType, number[]> = {
  'delivery': [1, 2, 5, 7, 8],
  'stitching': [1, 2, 3, 4, 5, 7, 8],
  'stitching+installation': [1, 2, 3, 4, 5, 6, 7, 8],
};

export function getMilestonesForOrder(orderType: OrderType): Milestone[] {
  const milestoneIds = ORDER_TYPE_MILESTONES[orderType];
  return milestoneIds.map(id => ({
    id,
    name: MILESTONES_CONFIG[id].name,
    completed: false,
    completedBy: null,
    completedAt: null,
    location: null,
  }));
}

export const O2D_PROCESS_CONFIG: O2DStep[] = [
    { id: 1, step: "Receive Advance ₹1000", details: "For measurement/Fabric order", time: "30 min", role: "Salesman", icon: User, expectedDuration: { minutes: 30 } },
    { id: 2, step: "Material Selection", details: "For Delivery/Production", time: "7 Days", role: "Salesman", icon: User, expectedDuration: { days: 7 } },
    { id: 3, step: "Measurement", details: "Coordinate to CRM", time: "1 Day", role: "CRM", icon: Users, expectedDuration: { days: 1 } },
    { id: 4, step: "Final Material Selection", details: "For Delivery/Production", time: "7 Days", role: "CRM / Salesman", icon: Users, expectedDuration: { days: 7 } },
    { id: 5, step: "Quotation Making", details: "Final quotation for the customer", time: "1 Day", role: "Salesman", icon: User, expectedDuration: { days: 1 } },
    { id: 6, step: "Quotation Re-Check", details: "Verification of the quotation", time: "1 Hour", role: "Accounts", icon: Banknote, expectedDuration: { hours: 1 } },
    { id: 7, step: "Advance Receiving Confirmation", details: "Before Material Ordering", time: "2 Hours", role: "Accounts", icon: Banknote, expectedDuration: { hours: 2 } },
    { id: 8, step: "PO Item List Tally", details: "Tally with Customer Quotation/Estimate", time: "1 Hour", role: "Salesman", icon: ClipboardCheck, expectedDuration: { hours: 1 } },
    { id: 9, step: "Purchase Material Receiving", details: "Time linked to another page", time: "Variable", role: "Purchase Dept.", icon: Box, expectedDuration: { days: 3 } }, // Assuming 3 days for variable
    { id: 10, step: "Move to Order Dashboard", details: "Order moves to the main tracking workflow", time: "Instant", role: "System", icon: ArrowRightCircle, expectedDuration: { minutes: 5 } }
];


export const PO_PROCESS_CONFIG: PurchaseStep[] = [
    { id: 1, step: "PO Confirmation", details: "Confirm the Purchase Order with the vendor", time: "30 min", role: "PC", icon: ThumbsUp, expectedDuration: { minutes: 30 } },
    { id: 2, step: "Material Delivery Follow up", details: "Follow up on the delivery status", time: "T-2 Days", role: "PC", icon: Truck, expectedDuration: { days: -2 } }, // Special handling
    { id: 3, step: "Receiving and Handover", details: "Receive materials and hand over to Accounts", time: "Delivery Time", role: "PC/Accounts", icon: FileCheck, expectedDuration: {} }, // Special handling
    { id: 4, step: "Data Entry", details: "Enter received materials into the system", time: "1 hr", role: "Accounts", icon: FileCheck, expectedDuration: { hours: 1 } },
    { id: 5, step: "Sent to Location", details: "Dispatch materials to the required location", time: "Milestone based", role: "PC", icon: Send, expectedDuration: { hours: 2 } }, // Assuming 2 hours
];
