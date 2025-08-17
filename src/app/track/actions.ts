
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Order, User } from '@/lib/types';

export async function getPublicOrderDetails(trackingCode: string): Promise<{ order: Order | null; installer: User | null; error?: string }> {
    if (!trackingCode) {
        return { order: null, installer: null, error: "Tracking code is required." };
    }

    try {
        const orderRef = adminDb.collection("orders").doc(trackingCode.toUpperCase());
        const docSnap = await orderRef.get();

        if (!docSnap.exists) {
            return { order: null, installer: null };
        }

        const orderData = { id: docSnap.id, ...docSnap.data() } as Order;
        let installerData: User | null = null;

        if (orderData.assignedTo) {
            const installerRef = adminDb.collection("users").doc(orderData.assignedTo);
            const installerSnap = await installerRef.get();
            if (installerSnap.exists()) {
                installerData = { id: installerSnap.id, ...installerSnap.data() } as User;
            }
        }
        
        // Return JSON-serializable data
        return { 
            order: JSON.parse(JSON.stringify(orderData)), 
            installer: installerData ? JSON.parse(JSON.stringify(installerData)) : null 
        };

    } catch (error) {
        console.error("Error fetching public order details:", error);
        return { order: null, installer: null, error: "An unexpected error occurred." };
    }
}
