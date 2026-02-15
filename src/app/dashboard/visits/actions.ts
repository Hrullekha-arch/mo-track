
'use server';

import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { DealVisit } from '@/lib/types';
import admin from "firebase-admin";

const SIGNED_URL_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const parseStorageObjectFromUrl = (rawUrl: string) => {
    try {
        const parsed = new URL(rawUrl);
        const host = parsed.hostname.toLowerCase();
        const parts = parsed.pathname.split('/').filter(Boolean);

        let bucket = "";
        let objectPath = "";

        if (host === "firebasestorage.googleapis.com") {
            // /v0/b/{bucket}/o/{encodedPath}
            if (parts[0] === "v0" && parts[1] === "b" && parts[3] === "o" && parts.length >= 5) {
                bucket = parts[2] || "";
                objectPath = decodeURIComponent(parts.slice(4).join('/'));
            }
        } else if (host === "storage.googleapis.com") {
            // /download/storage/v1/b/{bucket}/o/{encodedPath}
            if (
                parts[0] === "download" &&
                parts[1] === "storage" &&
                parts[2] === "v1" &&
                parts[3] === "b" &&
                parts[5] === "o" &&
                parts.length >= 7
            ) {
                bucket = parts[4] || "";
                objectPath = decodeURIComponent(parts.slice(6).join('/'));
            } else if (parts.length >= 2) {
                // /{bucket}/{objectPath}
                bucket = parts[0] || "";
                objectPath = decodeURIComponent(parts.slice(1).join('/'));
            }
        } else if (host.endsWith(".storage.googleapis.com")) {
            // https://{bucket}.storage.googleapis.com/{objectPath}
            bucket = host.replace(".storage.googleapis.com", "");
            objectPath = decodeURIComponent(parts.join('/'));
        }

        if (!objectPath) {
            const byQuery = parsed.searchParams.get("name");
            if (byQuery) objectPath = decodeURIComponent(byQuery);
        }

        return {
            bucket: bucket || undefined,
            objectPath: objectPath || undefined,
        };
    } catch {
        return {};
    }
};

export async function getFreshMeasurementPdfUrlAction(url: string): Promise<string> {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (!adminStorage) return raw;

    const parsed = parseStorageObjectFromUrl(raw);
    if (!parsed.objectPath) return raw;

    const fallbackBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    const bucketName = parsed.bucket || fallbackBucket;
    if (!bucketName) return raw;

    try {
        const bucket = adminStorage.bucket(bucketName);
        const file = bucket.file(parsed.objectPath);
        const [freshUrl] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + SIGNED_URL_TTL_MS,
        });
        return freshUrl || raw;
    } catch (error) {
        console.warn("Failed to refresh measurement PDF URL:", error);
        return raw;
    }
}

export async function getFreshStorageReadUrlAction(url: string): Promise<string> {
    return getFreshMeasurementPdfUrlAction(url);
}

export async function getFreshStorageReadUrlsAction(urls: string[]): Promise<Record<string, string>> {
    const cleaned = Array.isArray(urls)
        ? urls
            .map((url) => String(url || "").trim())
            .filter(Boolean)
        : [];

    const uniqueUrls = Array.from(new Set(cleaned));
    if (uniqueUrls.length === 0) return {};

    const refreshed = await Promise.all(
        uniqueUrls.map(async (url) => [url, await getFreshMeasurementPdfUrlAction(url)] as const)
    );

    return Object.fromEntries(refreshed);
}

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
                assignment: admin.firestore.FieldValue.delete(),
                updatedAt: new Date().toISOString(),
            });
        });

        return { success: true, message: 'Visit has been unassigned successfully.' };
    } catch (error: any) {
        console.error('Error in unassignVisitAction:', error);
        return { success: false, message: error.message || 'Failed to unassign visit.' };
    }
}

export async function updateVisitDetailsAction(
    customerId: string,
    dealDocId: string,
    visitId: string,
    updates: {
        dueDate?: string;
        representative?: string;
        remark?: string;
        customerAddress?: string;
    }
): Promise<{ success: boolean; message: string }> {
    if (!visitId || !customerId || !dealDocId) {
        return { success: false, message: 'Missing required IDs to update visit.' };
    }

    const visitRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealDocId).collection('visits').doc(visitId);

    try {
        const payload: Record<string, any> = {};
        if (updates.dueDate) {
            payload.dueDate = updates.dueDate;
            const dateOnly = updates.dueDate.split("T")[0] || updates.dueDate;
            payload["assignment.slot.date"] = dateOnly;
        }
        if (updates.representative) {
            payload.representative = updates.representative;
            try {
                const repSnap = await adminDb.collection('users').doc(updates.representative).get();
                const repName = repSnap.exists ? repSnap.data()?.name : undefined;
                payload.assignedSalesPerson = { id: updates.representative, name: repName };
            } catch (error) {
                console.warn("Failed to resolve representative name:", updates.representative, error);
                payload.assignedSalesPerson = { id: updates.representative };
            }
        }
        if (updates.remark) payload.remark = updates.remark;
        if (updates.customerAddress !== undefined) {
            payload.customerAddress = updates.customerAddress;
            payload["location.address"] = updates.customerAddress;
            payload["customerSnapshot.address"] = updates.customerAddress;
        }
        
        if (Object.keys(payload).length === 0) {
            return { success: true, message: 'No changes to update.' };
        }

        payload.updatedAt = new Date().toISOString();
        await visitRef.update(payload);

        return { success: true, message: 'Visit details updated successfully.' };
    } catch (error: any) {
        console.error('Error updating visit details:', error);
        return { success: false, message: error.message || 'Failed to update visit.' };
    }
}

export async function deleteVisitAction(
    visitId: string,
    customerId: string,
    dealDocId: string
): Promise<{ success: boolean; message: string }> {
    if (!visitId || !customerId || !dealDocId) {
        return { success: false, message: 'Missing required IDs to delete visit.' };
    }

    const visitRef = adminDb
        .collection('customers')
        .doc(customerId)
        .collection('deals')
        .doc(dealDocId)
        .collection('visits')
        .doc(visitId);

    try {
        await adminDb.runTransaction(async (transaction) => {
            const visitSnap = await transaction.get(visitRef);
            if (!visitSnap.exists) {
                throw new Error('Visit document not found.');
            }

            const visitData = visitSnap.data() as DealVisit;
            const { assignedTo, slotDate, slotIds } = visitData;

            if (assignedTo && slotDate) {
                const installerDateRef = adminDb.collection('installers').doc(assignedTo).collection('dates').doc(slotDate);
                const installerDateSnap = await transaction.get(installerDateRef);

                if (installerDateSnap.exists) {
                    const slots = (installerDateSnap.data()?.slots || []).map((slot: any) => {
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

            transaction.delete(visitRef);
        });

        return { success: true, message: 'Visit deleted permanently.' };
    } catch (error: any) {
        console.error('Error deleting visit:', error);
        return { success: false, message: error.message || 'Failed to delete visit.' };
    }
}
