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
    completedBy: null,
    completedAt: null,
    location: null,
  }));
}

export const salesmen = [
    "AAS (SAHOO)", "ASD (SAROJ DAS)", "ASB (ABHISHEK SINGH)", "AK (ABHISHEK CARPET)",
    "AM (MINTOO)", "BPS (PAWAN SHARMA)", "BTK (TAPESHWAR)", "CAY (ASHISH)",
    "CP (PRADEEP)", "DS (DAYAL)", "DK (DEEPAK SINHA)", "KD (DEVENDER)", "MU (MURARI)",
    "NK (NAND KISHOR)", "NKD (NEERAJ)", "RA (RAJEEV AGGARWAL)", "RSB (RAJENDRA BISHT)",
    "RK (RAJKUMAR)", "SD (SWETA)", "UMDP (UMESH)", "RB (Bhatiya)", "ANVR (Anvar)", "VD (Vishal Dubey)",
    "IS (Isha Mam)", "SHANTANU", "SONI (DEEPAK SONI)"
].sort();
