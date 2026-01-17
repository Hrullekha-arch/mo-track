
"use client";

import { useFcm } from "@/hooks/useFcm";

// This component's only job is to initialize the FCM hook.
export const FcmProvider = () => {
  useFcm();
  return null;
};
