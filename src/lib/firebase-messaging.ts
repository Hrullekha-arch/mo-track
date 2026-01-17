
"use client";

import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getApp } from "firebase/app";
import { toast } from "@/hooks/use-toast";

export const initializeFcm = () => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        const app = getApp();
        const messaging = getMessaging(app);

        // Handle foreground messages
        onMessage(messaging, (payload) => {
            console.log("Message received. ", payload);
            toast({
                title: payload.notification?.title || "New Notification",
                description: payload.notification?.body || "",
            });
        });

        return messaging;
    }
    return null;
};

export const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
        console.log("This browser does not support desktop notification");
        return null;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
        console.log("Notification permission granted.");
        try {
            const messaging = initializeFcm();
            if (messaging) {
                // You must provide this VAPID key in your environment variables
                const currentToken = await getToken(messaging, { vapidKey: process.env.NEXT_PUBLIC_FCM_VAPID_KEY });
                if (currentToken) {
                    return currentToken;
                } else {
                    console.log("No registration token available. Request permission to generate one.");
                    return null;
                }
            }
        } catch (err) {
            console.log("An error occurred while retrieving token. ", err);
            return null;
        }
    } else {
        console.log("Unable to get permission to notify.");
    }
    return null;
};
