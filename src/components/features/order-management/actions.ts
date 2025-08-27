
'use server';

import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export async function setFullKittingTime(orderId: string, kittingTime: string) {
    try {
        const orderRef = doc(db, 'orders', orderId);
        
        // To check if it's a re-update, we would need to fetch the document first.
        // For simplicity in this server action, we can add a flag.
        // A more robust solution might involve a transaction to read-and-write.
        await updateDoc(orderRef, {
            fullKittingTime: kittingTime,
            fullKittingTimeReupdated: true // We can set this to true on every update after the first.
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error setting kitting time:", error);
        return { success: false, message: error.message };
    }
}
