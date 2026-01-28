

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const isBuildPhase = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

let serviceAccount: any = null;

if (!serviceAccountString && getApps().length === 0) {
  if (!isBuildPhase) {
    throw new Error(
      "The FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. Please create a .env file and add it."
    );
  }
  console.warn("FIREBASE_SERVICE_ACCOUNT_KEY is not set. Admin SDK disabled during build.");
} else if (serviceAccountString) {
  try {
    // The key is often stored with escaped newlines, so we need to parse it carefully
    serviceAccount = JSON.parse(serviceAccountString);
  } catch (e) {
    console.error(
      "Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY. Make sure it's a valid JSON string in your .env file."
    );
    if (!isBuildPhase) {
      throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY format.");
    }
  }
}

let adminApp: App | null = null;

if (getApps().length) {
  adminApp = getApps()[0];
} else if (serviceAccount) {
  adminApp = initializeApp({
    credential: cert(serviceAccount),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

export const adminDb = adminApp ? getFirestore(adminApp) : (null as any);
export const adminAuth = adminApp ? getAuth(adminApp) : (null as any);
export const adminMessaging = adminApp ? getMessaging(adminApp) : (null as any);
export const adminStorage = adminApp ? getStorage(adminApp) : (null as any);
