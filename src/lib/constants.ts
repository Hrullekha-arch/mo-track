import { type Milestone, type OrderType } from './types';

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
  }));
}
