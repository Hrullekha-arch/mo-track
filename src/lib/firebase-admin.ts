
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';

if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new Error('The FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. Please create a .env file and add it.');
}

const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

let serviceAccount;
try {
  // The key is often stored with escaped newlines, so we need to parse it carefully
  serviceAccount = JSON.parse(serviceAccountString);
} catch (e) {
  console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY. Make sure it's a valid JSON string in your .env file.");
  throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY format.");
}


let adminApp: App;

if (!getApps().length) {
  adminApp = initializeApp({
    credential: cert(serviceAccount),
  });
} else {
  adminApp = getApps()[0];
}

export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
export const adminMessaging = getMessaging(adminApp);
