import { type Milestone, type OrderType, type PurchaseStep } from './types';
import { ThumbsUp, Truck, FileCheck, Send } from 'lucide-react';


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

export const PO_PROCESS_CONFIG: PurchaseStep[] = [
    { id: 1, step: "PO Confirmation", details: "Confirm the Purchase Order with the vendor", time: "30 min", role: "PC", icon: ThumbsUp, expectedDuration: { minutes: 30 } },
    { id: 2, step: "Material Delivery Follow up", details: "Follow up on the delivery status", time: "T-2 Days", role: "PC", icon: Truck, expectedDuration: { days: -2 } }, // Special handling
    { id: 3, step: "Receiving and Handover", details: "Receive materials and hand over to Accounts", time: "Delivery Time", role: "PC/Accounts", icon: FileCheck, expectedDuration: {} }, // Special handling
    { id: 4, step: "Data Entry", details: "Enter received materials into the system", time: "1 hr", role: "Accounts", icon: FileCheck, expectedDuration: { hours: 1 } },
    { id: 5, step: "Sent to Location", details: "Dispatch materials to the required location", time: "Milestone based", role: "PC", icon: Send, expectedDuration: { hours: 2 } }, // Assuming 2 hours
];
