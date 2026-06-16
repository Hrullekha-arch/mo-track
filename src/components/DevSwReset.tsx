"use client";

import { useEffect } from "react";

const RELOAD_MARKER = "mot_dev_sw_reset_reloaded";

export function DevSwReset() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const reset = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const cacheKeys = "caches" in window ? await caches.keys() : [];
      const hadController = Boolean(navigator.serviceWorker.controller);
      const hadStoredWorkerData = registrations.length > 0 || cacheKeys.length > 0;

      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ("caches" in window) {
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }

      if ((hadController || hadStoredWorkerData) && !sessionStorage.getItem(RELOAD_MARKER)) {
        sessionStorage.setItem(RELOAD_MARKER, "1");
        window.location.reload();
        return;
      }

      if (!hadController && !hadStoredWorkerData) {
        sessionStorage.removeItem(RELOAD_MARKER);
      }
    };

    reset().catch(() => {});
  }, []);
  return null;
}
