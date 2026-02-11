import { configureStore } from "@reduxjs/toolkit";
import visitsReducer from "@/store/slices/visitsSlice";

export const store = configureStore({
  reducer: {
    visits: visitsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
