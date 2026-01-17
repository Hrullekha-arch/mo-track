
'use server';

import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { User } from '@/lib/types';

interface WalkinCustomerData {
    firstName: string;
    familyName: string;
    mobile: string;
    email?: string;
    lookingFor?: string;
}

export async function addWalkinCustomer(data: WalkinCustomerData): Promise<{ success: boolean, message: string }> {
    try {
        const walkinRef = adminDb.collection('Walkin_Customer');

        const mobileQuery = await walkinRef.where('mobile', '==', data.mobile).limit(1).get();
        if (!mobileQuery.empty) {
            return { success: false, message: "A record with this mobile number already exists." };
        }

        const newCustomerDoc = await walkinRef.add({
            ...data,
            createdAt: new Date().toISOString(),
            status: 'Pending', // Initial status
        });

        const usersRef = adminDb.collection('users');
        const crmQuery = usersRef.where('role', '==', 'employee').where('designation', '==', 'CRM');
        const crmSnapshot = await crmQuery.get();

        if (!crmSnapshot.empty) {
            const tokens: string[] = [];
            const crmUserIds: string[] = [];
            crmSnapshot.forEach(doc => {
                const user = doc.data() as User;
                crmUserIds.push(doc.id);
                if (user.fcmTokens && Array.isArray(user.fcmTokens)) {
                    tokens.push(...user.fcmTokens);
                }
            });

            // 1. Send FCM Push Notifications
            if (tokens.length > 0) {
                const uniqueTokens = [...new Set(tokens)];
                const fcmMessage = {
                    notification: {
                        title: 'New Walk-in Customer',
                        body: `${data.firstName} ${data.familyName} has arrived. Please attend to them.`
                    },
                    tokens: uniqueTokens,
                };
                // CORRECTED: Added 'await' to ensure the async operation completes.
                await adminMessaging.sendEachForMulticast(fcmMessage);
                console.log('Push notifications sent to CRM users.');
            }

            // 2. Create in-app notification documents
            const notificationMessage = `${data.firstName} ${data.familyName} has arrived and is waiting to be attended to.`;
            const notificationPayload = {
                type: 'new_walkin',
                message: notificationMessage,
                link: '/dashboard/walk-in',
                read: false,
                createdAt: new Date().toISOString()
            };

            const batch = adminDb.batch();
            crmUserIds.forEach(userId => {
                const notificationRef = adminDb.collection('users').doc(userId).collection('notifications').doc();
                batch.set(notificationRef, notificationPayload);
            });
            await batch.commit();
            console.log('In-app notifications created for CRM users.');
        }

        return { success: true, message: "Customer data saved and notifications sent." };

    } catch (error: any) {
        console.error("Error adding walk-in customer:", error);
        return { success: false, message: "An unexpected server error occurred." };
    }
}
