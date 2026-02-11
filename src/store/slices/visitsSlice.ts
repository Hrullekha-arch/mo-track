import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { InstallerTracking, User } from "@/lib/types";
import {
  AdminDailyStats,
  EnrichedDealVisit,
  JobSuggestion,
} from "@/app/dashboard/visits/types";

type VisitsState = {
  allVisits: EnrichedDealVisit[];
  users: User[];
  tracking: InstallerTracking[];
  suggestMap: Record<string, JobSuggestion>;
  dailyStatsMap: Record<string, AdminDailyStats>;
  loading: boolean;
  trackingLoading: boolean;
  initialized: boolean;
};

const initialState: VisitsState = {
  allVisits: [],
  users: [],
  tracking: [],
  suggestMap: {},
  dailyStatsMap: {},
  loading: true,
  trackingLoading: true,
  initialized: false,
};

const visitsSlice = createSlice({
  name: "visits",
  initialState,
  reducers: {
    setAllVisits(state, action: PayloadAction<EnrichedDealVisit[]>) {
      state.allVisits = action.payload;
      state.loading = false;
      state.initialized = true;
    },
    setUsers(state, action: PayloadAction<User[]>) {
      state.users = action.payload;
    },
    setTracking(state, action: PayloadAction<InstallerTracking[]>) {
      state.tracking = action.payload;
      state.trackingLoading = false;
    },
    setSuggestMap(state, action: PayloadAction<Record<string, JobSuggestion>>) {
      state.suggestMap = action.payload;
    },
    setDailyStatsMap(
      state,
      action: PayloadAction<Record<string, AdminDailyStats>>
    ) {
      state.dailyStatsMap = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setTrackingLoading(state, action: PayloadAction<boolean>) {
      state.trackingLoading = action.payload;
    },
  },
});

export const {
  setAllVisits,
  setUsers,
  setTracking,
  setSuggestMap,
  setDailyStatsMap,
  setLoading,
  setTrackingLoading,
} = visitsSlice.actions;

export default visitsSlice.reducer;
