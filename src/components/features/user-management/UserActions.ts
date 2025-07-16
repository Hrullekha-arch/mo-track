
"use server";

import { initializeApp, getApps, App, app } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getAdminApp(): App {
  if (getApps().length > 0) {
    return app();
  }
  return initializeApp();
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
