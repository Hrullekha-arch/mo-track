'use server';

import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { User, OwnerRef } from '@/lib/types';
import { computeAssignment } from '@/lib/handover';
import { getNextSequenceValue } from '@/lib/id-sequence';

interface WalkinCustomerData {
    firstName: string;
    familyName: string;
    mobile: string;
    email?: string;
    lookingFor?: string[];
    customerType?: string;
    store?: string;
}

type WalkinCreator = {
    id: string;
    name: string;
    email: string;
};

const formatWalkinId = (sequenceValue: string) => {
    const numeric = Number(sequenceValue);
    if (Number.isFinite(numeric) && numeric > 0) {
        return `WALKIN-${String(Math.floor(numeric)).padStart(3, '0')}`;
    }
    const normalized = String(sequenceValue || '').trim();
    return normalized ? `WALKIN-${normalized}` : `WALKIN-${Date.now()}`;
};

const normalizeMobile = (value: unknown) => String(value || '').replace(/\D/g, '');

export async function addWalkinCustomer(
    data: WalkinCustomerData,
    creator?: WalkinCreator
): Promise<{ success: boolean, message: string }> {
    try {
        const walkinRef = adminDb.collection('Walkin_Customer');
        const createdAtIso = new Date().toISOString();
        const walkinId = formatWalkinId(await getNextSequenceValue('walkinId'));
        const autoAttend = Boolean(creator?.id && creator?.name);
        const attendedBy = autoAttend && creator
            ? {
                id: creator.id,
                name: creator.name,
            }
            : null;
        let creatorStore = '';
        if (creator?.id) {
            const creatorSnap = await adminDb.collection('users').doc(creator.id).get();
            const creatorData = creatorSnap.data() as any;
            creatorStore = String(
                creatorData?.store ||
                creatorData?.storeName ||
                creatorData?.branch ||
                ''
            ).trim();
        }
        const resolvedStore = String(data?.store || creatorStore || '').trim();
        const rawMobile = String(data?.mobile || '').trim();
        const mobileNormalized = normalizeMobile(rawMobile);
        const mobileLast10 = mobileNormalized.length >= 10
            ? mobileNormalized.slice(-10)
            : mobileNormalized;

        const [mobileExactQuery, mobileNormalizedQuery, mobileLast10Query] = await Promise.all([
            walkinRef.where('mobile', '==', rawMobile).limit(1).get(),
            mobileNormalized
                ? walkinRef.where('mobileNormalized', '==', mobileNormalized).limit(1).get()
                : Promise.resolve(null as any),
            mobileLast10
                ? walkinRef.where('mobileLast10', '==', mobileLast10).limit(1).get()
                : Promise.resolve(null as any),
        ]);

        const existingDoc =
            mobileExactQuery?.docs?.[0] ||
            mobileNormalizedQuery?.docs?.[0] ||
            mobileLast10Query?.docs?.[0] ||
            null;

        const isReturningCustomer = Boolean(existingDoc);
        const resolvedCustomerType = isReturningCustomer
            ? 'Returning-Customer'
            : String(data?.customerType || '').trim() || 'Walk-in';

        const usersRef = adminDb.collection('users');
        const crmQuery = usersRef.where('role', '==', 'employee').where('designation', '==', 'CRM');
        const crmSnapshot = await crmQuery.get();
        const shouldNotifyAllCrm = !creator;

        const crmAvailabilities: OwnerRef[] = [];
        if (!crmSnapshot.empty) {
            const tokens: string[] = [];
            const crmUserIds: string[] = [];
            crmSnapshot.forEach((doc: any) => {
                const user = doc.data() as User;
                crmUserIds.push(doc.id);
                crmAvailabilities.push({ type: 'CRM', id: doc.id });
                if (user.fcmTokens && Array.isArray(user.fcmTokens)) {
                    tokens.push(...user.fcmTokens);
                }
            });

            // 1. Send FCM Push Notifications
            if (shouldNotifyAllCrm && tokens.length > 0) {
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
            if (shouldNotifyAllCrm) {
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
        }

        // Determine initial assignment (default to first available CRM; fallback to unassigned CRM)
        const creatorOwner: OwnerRef | null = creator?.id ? { type: 'CRM', id: creator.id } : null;
        const primaryOwner: OwnerRef = creatorOwner ?? (crmAvailabilities.length > 0
            ? crmAvailabilities[0]
            : { type: 'CRM', id: 'unassigned' });

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

        let assignedOwnerStore = '';
        if (assignment?.assignedOwner?.id && assignment.assignedOwner.id !== 'unassigned') {
            const assignedOwnerSnap = await adminDb.collection('users').doc(assignment.assignedOwner.id).get();
            const assignedOwnerData = assignedOwnerSnap.data() as any;
            assignedOwnerStore = String(
                assignedOwnerData?.store ||
                assignedOwnerData?.storeName ||
                assignedOwnerData?.branch ||
                ''
            ).trim();
        }

        await walkinRef.add({
            ...data,
            mobile: rawMobile,
            mobileNormalized: mobileNormalized || null,
            mobileLast10: mobileLast10 || null,
            customerType: resolvedCustomerType,
            isReturningCustomer,
            returningFromWalkinId: existingDoc?.id || null,
            walkinId,
            store: resolvedStore || null,
            storeName: resolvedStore || null,
            createdByStore: creatorStore || null,
            assignedStoreName: assignedOwnerStore || resolvedStore || null,
            createdAt: createdAtIso,
            status: autoAttend ? 'Attended' : 'Pending',
            attendedBy,
            createdBy: creator
                ? {
                    id: creator.id,
                    name: creator.name,
                    email: creator.email,
                    store: creatorStore || null,
                }
                : null,
            createdById: creator?.id || null,
            createdByName: creator?.name || null,
            createdByEmail: creator?.email || null,
            originalOwnerType: assignment.originalOwner.type,
            originalOwnerId: assignment.originalOwner.id,
            assignedOwnerType: assignment.assignedOwner.type,
            assignedOwnerId: assignment.assignedOwner.id,
            assignmentReason: assignment.assignmentReason,
            handoverRequestId: assignment.handoverRequestId ?? null,
            assignedAt: assignment.assignedAt,
        });

        return {
            success: true,
            message: autoAttend
                ? isReturningCustomer
                    ? "Customer data saved, marked as returning customer, and auto-attended by CRM."
                    : "Customer data saved and auto-attended by CRM."
                : isReturningCustomer
                    ? "Customer data saved, marked as returning customer, and notifications sent."
                    : "Customer data saved and notifications sent.",
        };

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

        const customerData = docSnap.data() || {};
        const creatorId = customerData.createdById || customerData.createdBy?.id || null;
        if (creatorId && creatorId !== crmUser.id) {
            return { success: false, message: "You can only attend walk-ins created by you." };
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
    salesman: { id: string; name: string },
    crmUser: { id: string; name: string; role?: string | null }
): Promise<{ success: boolean; message: string }> {
    try {
        const customerRef = adminDb.collection('Walkin_Customer').doc(customerId);
        const customerSnap = await customerRef.get();

        if (!customerSnap.exists) {
            return { success: false, message: "Customer not found." };
        }
        const customerData = customerSnap.data();
        const creatorId = customerData?.createdById || customerData?.createdBy?.id || null;
        const isAdminActor = String(crmUser?.role || '').trim().toLowerCase() === 'admin';
        if (!isAdminActor && creatorId && creatorId !== crmUser.id) {
            return { success: false, message: "You can only hand over walk-ins created by you." };
        }

        const salesmanDoc = await adminDb.collection('users').doc(salesman.id).get();
        const salesmanData = salesmanDoc.exists ? (salesmanDoc.data() as User) : null;
        const salesmanStore = String(
            (salesmanData as any)?.store ||
            (salesmanData as any)?.storeName ||
            (salesmanData as any)?.branch ||
            ''
        ).trim();
        const existingStore = String(customerData?.store || customerData?.storeName || '').trim();
        const nextStore = salesmanStore || existingStore;

        await customerRef.update({
            status: 'Handed Over',
            salesmanId: salesman.id,
            salesmanName: salesman.name,
            salesmanStore: salesmanStore || null,
            store: nextStore || null,
            storeName: nextStore || null,
            assignedStoreName: nextStore || null,
            assignedOwnerType: 'SALESMAN',
            assignedOwnerId: salesman.id,
            assignmentReason: 'ADMIN_OVERRIDE',
            handoverRequestId: null,
            assignedAt: new Date().toISOString(),
        });

        // Get salesman's user data to find FCM tokens
        if (salesmanData) {
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
