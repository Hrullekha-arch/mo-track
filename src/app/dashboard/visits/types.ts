import { Customer, DealVisit } from "@/lib/types";

export interface EnrichedDealVisit extends DealVisit {
  customerName: string;
  dealName: string;
  dealDocId: string;
  customerId: string;
  customerAddress?: string;
  customer?: Customer | null;
}

export type JobSuggestion = {
  installerId: string;
  recommendedVisitId: string | null;
  recommendedDealId?: string | null;
  recommendedCustomerName?: string | null;
  distanceKm?: number | null;
  etaMin?: number | null;
  avgDelayMin?: number | null;
  finalEtaMin?: number | null;
  computedAt?: string;
  reason?: string;
  customerId?: string | null;
  dealDocId?: string | null;
  coordsSource?: "geo" | "legacy";
};

export type AdminDailyStats = {
  installerId: string;
  dateKey: string;
  completedToday: number;
  totalWorkMin: number;
  avgWorkMin: number;
  delayCount: number;
  updatedAt?: string;
};
