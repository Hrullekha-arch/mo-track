
"use server";

import { initializeApp, getApps, app } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Initialize Firebase Admin SDK if not already initialized
const adminApp = !getApps().length ? initializeApp() : app();

export async function createUser(email: string, password: string): Promise<{ uid?: string, error?: string }> {
  try {
    const userRecord = await getAuth(adminApp).createUser({
      email: email,
      password: password,
    });
    return { uid: userRecord.uid };
  } catch (error: any) {
    console.error("Error creating user in Firebase Auth:", error);
    return { error: error.message };
  }
}
