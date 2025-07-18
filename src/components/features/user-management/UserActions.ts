
"use server";

import { initializeApp, getApps, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { credential } from "firebase-admin";

const firebaseAdminConfig = {
    credential: credential.applicationDefault(),
    databaseURL: "https://mo-panel.firebaseio.com"
};

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }
  return initializeApp(firebaseAdminConfig);
}

export async function createUser(email: string, password: string): Promise<{ uid?: string, error?: string }> {
  try {
    const adminApp = getAdminApp();
    const userRecord = await getAuth(adminApp).createUser({
      email: email,
      password: password,
    });
    return { uid: userRecord.uid };
  } catch (error: any) {
    console.error("Error creating user in Firebase Auth:", error);
    return { error: error.message || 'An unknown error occurred during user creation.' };
  }
}
