
"use client";

import { useEffect, useState } from "react";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { requestNotificationPermission } from "@/lib/firebase-messaging";

export const useFcm = () => {
  const { user } = useAuth();
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  useEffect(() => {
    const handlePermission = async () => {
      if (user) {
        const token = await requestNotificationPermission();
        if (token) {
          setFcmToken(token);
          // Save the new token to the user's document in Firestore.
          const userDocRef = doc(db, "users", user.id);
          await updateDoc(userDocRef, {
            fcmTokens: arrayUnion(token)
          });
        }
      }
    };

    handlePermission();

  }, [user]);

  // Optional: Clean up token on logout
  const cleanupToken = async () => {
    if (user && fcmToken) {
      const userDocRef = doc(db, "users", user.id);
      await updateDoc(userDocRef, {
        fcmTokens: arrayRemove(fcmToken)
      });
    }
  };

  return { fcmToken, cleanupToken };
};
