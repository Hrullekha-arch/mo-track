'use server';

import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { User, OwnerRef } from '@/lib/types';
import { computeAssignment } from '@/lib/handover';

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

        const usersRef = adminDb.collection('users');
        const crmQuery = usersRef.where('role', '==', 'employee').where('designation', '==', 'CRM');
        const crmSnapshot = await crmQuery.get();

        const crmAvailabilities: OwnerRef[] = [];
        if (!crmSnapshot.empty) {
            const tokens: string[] = [];
            const crmUserIds: string[] = [];
            crmSnapshot.forEach(doc => {
                const user = doc.data() as User;
                crmUserIds.push(doc.id);
                crmAvailabilities.push({ type: 'CRM', id: doc.id });
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

        // Determine initial assignment (default to first available CRM; fallback to unassigned CRM)
        const primaryOwner: OwnerRef = crmAvailabilities.length > 0
            ? crmAvailabilities[0]
            : { type: 'CRM', id: 'unassigned' };

        const assignment = computeAssignment({
            primaryOwner,
            availability: crmAvailabilities.map((owner) => ({
                owner,
                status: 'AVAILABLE',
              })),
            handovers: [],
            teamPool: crmAvailabilities.slice(1).map((owner) => ({
                owner,
                status: 'AVAILABLE',
              })),
        });

        const newCustomerDoc = await walkinRef.add({
            ...data,
            createdAt: new Date().toISOString(),
            status: 'Pending', // Initial status
            originalOwnerType: assignment.originalOwner.type,
            originalOwnerId: assignment.originalOwner.id,
            assignedOwnerType: assignment.assignedOwner.type,
            assignedOwnerId: assignment.assignedOwner.id,
            assignmentReason: assignment.assignmentReason,
            handoverRequestId: assignment.handoverRequestId ?? null,
            assignedAt: assignment.assignedAt,
        });

        return { success: true, message: "Customer data saved and notifications sent." };

    } catch (error: any) {
        console.error("Error adding walk-in customer:", error);
        return { success: false, message: "An unexpected server error occurred." };
    }
}

export async function attendToWalkin(
    customerId: string,
    crmUser: { id: string; name: string }
): Promise<{ success: boolean; message: string }> {
    try {
        const customerRef = adminDb.collection('Walkin_Customer').doc(customerId);
        const docSnap = await customerRef.get();

        if (!docSnap.exists) {
            return { success: false, message: "Customer not found." };
        }

        await customerRef.update({
            status: 'Attended',
            attendedBy: crmUser,
        });

        return { success: true, message: "Status updated to Attended." };
    } catch (error: any) {
        console.error("Error attending to walk-in:", error);
        return { success: false, message: "An unexpected server error occurred." };
    }
}

export async function handoverToSalesman(
    customerId: string,
    salesman: { id: string; name: string }
): Promise<{ success: boolean; message: string }> {
    try {
        const customerRef = adminDb.collection('Walkin_Customer').doc(customerId);
        const customerSnap = await customerRef.get();

        if (!customerSnap.exists) {
            return { success: false, message: "Customer not found." };
        }
        const customerData = customerSnap.data();

        await customerRef.update({
            status: 'Handed Over',
            salesmanId: salesman.id,
            salesmanName: salesman.name,
            assignedOwnerType: 'SALESMAN',
            assignedOwnerId: salesman.id,
            assignmentReason: 'ADMIN_OVERRIDE',
            handoverRequestId: null,
            assignedAt: new Date().toISOString(),
        });

        // Get salesman's user data to find FCM tokens
        const salesmanDoc = await adminDb.collection('users').doc(salesman.id).get();
        if (salesmanDoc.exists) {
            const salesmanData = salesmanDoc.data() as User;
            const notificationMessage = `A new lead, ${customerData?.firstName} ${customerData?.familyName}, has been assigned to you.`;

            // 1. Create in-app notification
            const notificationPayload = {
                type: 'lead_assigned',
                message: notificationMessage,
                link: '/dashboard',
                read: false,
                createdAt: new Date().toISOString()
            };
            await adminDb.collection('users').doc(salesman.id).collection('notifications').add(notificationPayload);

            // 2. Send FCM push notification
            if (salesmanData.fcmTokens && salesmanData.fcmTokens.length > 0) {
                const fcmMessage = {
                    notification: {
                        title: 'New Lead Assigned',
                        body: notificationMessage
                    },
                    tokens: salesmanData.fcmTokens,
                };
                await adminMessaging.sendEachForMulticast(fcmMessage);
            }
        }

        return { success: true, message: `Handed over to ${salesman.name}.` };
    } catch (error: any) {
        console.error("Error handing over to salesman:", error);
        return { success: false, message: "An unexpected server error occurred." };
    }
}
