'use server';

import { adminDb } from '@/lib/firebase-admin';

export async function setFullKittingTime(orderId: string, kittingTime: string) {
  try {
    const orderRef = adminDb.collection('orders').doc(orderId);
    await orderRef.update({
      fullKittingTime: kittingTime,
      fullKittingTimeReupdated: true,
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error setting kitting time:", error);
    return { success: false, message: error.message };
  }
}
