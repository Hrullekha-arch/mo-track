'use server';

import { adminDb } from '@/lib/firebase-admin';
import { DealVisit } from '@/lib/types';
import admin from "firebase-admin";

export async function unassignVisitAction(visitId: string, customerId: string, dealDocId: string) {
    if (!visitId || !customerId || !dealDocId) {
        return { success: false, message: 'Missing required IDs to unassign visit.' };
    }

    const visitRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealDocId).collection('visits').doc(visitId);

    try {
        await adminDb.runTransaction(async (transaction) => {
            const visitSnap = await transaction.get(visitRef);
            if (!visitSnap.exists) {
                throw new Error('Visit document not found.');
            }

            const visitData = visitSnap.data() as DealVisit;
            const { assignedTo, slotDate, slotIds } = visitData;

            // If the visit is assigned, clear the slot in the installer's schedule
            if (assignedTo && slotDate) {
                const installerDateRef = adminDb.collection('installers').doc(assignedTo).collection('dates').doc(slotDate);
                const installerDateSnap = await transaction.get(installerDateRef);

                if (installerDateSnap.exists) {
                    const slots = (installerDateSnap.data()?.slots || []).map((slot: any) => {
                        // Check against single slotId or multiple slotIds
                        const visitSlotIds = slotIds || (visitData.slotId ? [visitData.slotId] : []);
                        if (visitSlotIds.includes(slot.slotId || slot.id)) {
                             return {
                                ...slot,
                                status: 'free',
                                visitId: null,
                                customerId: null,
                                customerName: null,
                                dealId: null,
                                dealDocId: null,
                                dealName: null
                            };
                        }
                        return slot;
                    });
                    transaction.update(installerDateRef, { slots });
                }
            }

            // Clear assignment fields on the visit document
            transaction.update(visitRef, {
                assignedTo: admin.firestore.FieldValue.delete(),
                slotDate: admin.firestore.FieldValue.delete(),
                slotId: admin.firestore.FieldValue.delete(),
                slotIds: admin.firestore.FieldValue.delete(),
                slotLabel: admin.firestore.FieldValue.delete(),
                slotStart: admin.firestore.FieldValue.delete(),
                slotEnd: admin.firestore.FieldValue.delete(),
                assignedAt: admin.firestore.FieldValue.delete(),
            });
        });

        return { success: true, message: 'Visit has been unassigned successfully.' };
    } catch (error: any) {
        console.error('Error in unassignVisitAction:', error);
        return { success: false, message: error.message || 'Failed to unassign visit.' };
    }
}
