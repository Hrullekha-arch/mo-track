
'use server';

import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { User } from '@/lib/types';
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
    console.log("form Data:", data);
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
            originStoreName: resolvedStore || null,
            assignedStoreName: resolvedStore || null,
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
        });

        const usersRef = adminDb.collection('users');
        const crmQuery = usersRef.where('role', '==', 'employee').where('designation', '==', 'CRM');
        const crmSnapshot = await crmQuery.get();
        const shouldNotifyAllCrm = !creator;

        if (!crmSnapshot.empty && shouldNotifyAllCrm) {
            const tokens: string[] = [];
            const crmUserIds: string[] = [];
            crmSnapshot.forEach((doc: any) => {
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
