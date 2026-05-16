import { DealVisit, Customer } from "@/lib/types";

export interface InstallerTracking {
  id: string;
  installerId?: string;
  status?: string;
  location?: { latitude: number; longitude: number };
  lastPingAt?: string;
  updatedAt?: string;
  speedKmh?: number;
  currentVisitId?: string;
  batteryLevel?: number | null;
  networkType?: string | null;
  gpsAccuracy?: number | null;
  appState?: string | null;
  accuracyM?: number | null;
  deviceModel?: string | null;
}

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

export type VisitCompletionMode = "Porter" | "Other";

export interface PendingVisitCompletion {
  visit: EnrichedDealVisit;
  mode: VisitCompletionMode;
  remark: string;
}

export type InstallerMapMarkerStatus = "DRIVING" | "IDLE" | "OFFLINE";

export type InstallerMapMarker = {
  id: string;
  name: string;
  status: InstallerMapMarkerStatus;
  latitude: number;
  longitude: number;
  speedKmh?: number | null;
  batteryLevel?: number | null;
  networkType?: string | null;
  gpsAccuracy?: number | null;
  appState?: string | null;
  lastPingAt?: string | null;
  currentTask?: string;
};

export const WEEKDAY_ORDER = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type WeekdayKey = (typeof WEEKDAY_ORDER)[number];