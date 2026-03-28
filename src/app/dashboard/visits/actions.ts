
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

export type ComplaintCustomerSearchResult = {
    id: string;
    name: string;
    phone?: string;
    mobileNo?: string;
    email?: string;
    address?: string;
    billingAddress?: string;
    pincode?: string;
    customerCode?: string;
};

export async function searchCustomersForComplaintAction(searchTerm: string): Promise<{
    success: boolean;
    message: string;
    customers: ComplaintCustomerSearchResult[];
}> {
    try {
        const raw = String(searchTerm || '').trim();
        if (!raw) {
            return { success: true, message: 'Search term is required.', customers: [] };
        }

        const normalized = raw.toLowerCase();
        const normalizedDigits = raw.replace(/\D/g, '');

        const snapshot = await adminDb
            .collection('customers')
            .orderBy('createdAt', 'desc')
            .limit(400)
            .get();

        const rows: ComplaintCustomerSearchResult[] = snapshot.docs.map((doc: any) => {
            const data = doc.data() as any;
            const phone = String(data?.phone || data?.mobile || '').trim();
            const mobileNo = String(data?.mobileNo || data?.mobile || '').trim();
            const email = String(data?.email || '').trim();
            const name = String(data?.name || '').trim();
            const billingAddress = [
                data?.billingAddress?.line1,
                data?.billingAddress?.line2,
                data?.billingAddress?.landmark,
                data?.billingAddress?.city,
                data?.billingAddress?.state,
            ]
                .map((part) => String(part || '').trim())
                .filter(Boolean)
                .join(', ');
            const legacyAddress = String(data?.addressPinCode || '').trim();
            const pincode = String(data?.billingAddress?.pincode || data?.pinCode || '').trim();
            const customerCode = String(data?.customerCode || data?.customerId || '').trim();

            return {
                id: doc.id,
                name,
                phone: phone || undefined,
                mobileNo: mobileNo || undefined,
                email: email || undefined,
                billingAddress: billingAddress || undefined,
                address: (billingAddress || legacyAddress) || undefined,
                pincode: pincode || undefined,
                customerCode: customerCode || undefined,
            };
        });

        const filtered = rows.filter((row) => {
            const rowPhoneDigits = String(row.phone || '').replace(/\D/g, '');
            const rowMobileDigits = String(row.mobileNo || '').replace(/\D/g, '');
            const textHaystack = [
                row.name || '',
                row.email || '',
                row.phone || '',
                row.mobileNo || '',
                row.customerCode || '',
            ]
                .join(' ')
                .toLowerCase();

            if (normalizedDigits) {
                if (rowPhoneDigits.includes(normalizedDigits)) return true;
                if (rowMobileDigits.includes(normalizedDigits)) return true;
            }

            return textHaystack.includes(normalized);
        });

        return {
            success: true,
            message: filtered.length ? 'Customers found.' : 'Customer not found.',
            customers: filtered.slice(0, 20),
        };
    } catch (error: any) {
        console.error('Error searching customers for complaint:', error);
        return {
            success: false,
            message: error?.message || 'Failed to search customers.',
            customers: [],
        };
    }
}

export async function createComplaintCompanyVisitAction(input: {
    customer: ComplaintCustomerSearchResult;
    complaintType: string;
    visitDate: string;
    customerAddress: string;
    workNote: string;
    photoUrls: string[];
    createdBy?: { id?: string; name?: string; email?: string };
}): Promise<{ success: boolean; message: string; id?: string }> {
    try {
        const customer = input?.customer;
        const complaintType = String(input?.complaintType || '').trim();
        const visitDate = String(input?.visitDate || '').trim();
        const customerAddress = String(input?.customerAddress || '').trim();
        const workNote = String(input?.workNote || '').trim();
        const photoUrls = Array.isArray(input?.photoUrls)
            ? input.photoUrls.map((url) => String(url || '').trim()).filter(Boolean)
            : [];

        if (!customer?.id || !customer?.name) {
            return { success: false, message: 'Valid customer is required.' };
        }
        if (!complaintType) {
            return { success: false, message: 'Complaint type is required.' };
        }
        if (!visitDate) {
            return { success: false, message: 'Visit date is required.' };
        }
        if (!customerAddress) {
            return { success: false, message: 'Customer address is required.' };
        }
        if (!workNote) {
            return { success: false, message: 'Work note is required.' };
        }
        if (!photoUrls.length) {
            return { success: false, message: 'At least one photo is required.' };
        }
        if (photoUrls.length > 5) {
            return { success: false, message: 'Maximum 5 photos are allowed.' };
        }

        const customerSnapshotRef = adminDb.collection('customers').doc(customer.id);
        const customerSnapshot = await customerSnapshotRef.get();
        const customerData = customerSnapshot.exists ? (customerSnapshot.data() as any) : null;

        const resolvedPhone = String(
            customerData?.phone ||
            customerData?.mobileNo ||
            customerData?.mobile ||
            customer.phone ||
            customer.mobileNo ||
            ''
        ).trim();
        const resolvedEmail = String(customerData?.email || customer.email || '').trim();
        const resolvedCustomerCode = String(
            customerData?.customerCode || customerData?.customerId || customer.customerCode || ''
        ).trim();
        const resolvedAddressFromCustomer = [
            customerData?.billingAddress?.line1,
            customerData?.billingAddress?.line2,
            customerData?.billingAddress?.landmark,
            customerData?.billingAddress?.city,
            customerData?.billingAddress?.state,
            customerData?.billingAddress?.country,
            customerData?.billingAddress?.pincode || customerData?.pinCode,
        ]
            .map((part) => String(part || '').trim())
            .filter(Boolean)
            .join(', ');
        const resolvedAddress = customerAddress || resolvedAddressFromCustomer || customer.address || '';
        const visitDateOnly = visitDate.includes('T') ? visitDate.split('T')[0] : visitDate;

        const nowIso = new Date().toISOString();
        const docRef = adminDb.collection('companyVisits').doc();

        await docRef.set({
            createdAt: nowIso,
            updatedAt: nowIso,
            category: 'complaint_visit',
            purpose: 'customer_complaint',
            status: 'Pending Approval',
            trackerStatus: 'planned',
            approvalStatus: 'Pending Approval',
            complaintStatus: 'Pending Approval',
            pendingApproval: true,
            complaintType,
            complaintSubType: complaintType,
            visitDate: visitDateOnly,
            workNote,
            remark: workNote,
            customerAddress: resolvedAddress,
            from: resolvedAddress,
            to: resolvedAddress,
            startTime: '',
            endTime: '',
            workMode: 'customer_home',
            assignedToId: '',
            assignedToName: 'Unassigned',
            assignedRole: 'employee',
            installerAssignedId: '',
            installerAssignedName: '',
            photos: photoUrls,
            photoUrls,
            customerId: customer.id,
            customerName: customer.name,
            customerPhone: resolvedPhone,
            customerEmail: resolvedEmail,
            customerCode: resolvedCustomerCode,
            customerSnapshot: {
                id: customer.id,
                name: customer.name,
                phone: resolvedPhone,
                email: resolvedEmail,
                address: resolvedAddress,
                pincode: String(customerData?.billingAddress?.pincode || customerData?.pinCode || customer.pincode || ''),
                customerCode: resolvedCustomerCode,
                billingAddress: customerData?.billingAddress || null,
                raw: customerData || null,
            },
            createdBy: {
                id: String(input?.createdBy?.id || '').trim() || 'system',
                name: String(input?.createdBy?.name || '').trim() || 'System',
                email: String(input?.createdBy?.email || '').trim() || '',
            },
            source: 'all_visits_register_complaint',
        });

        return { success: true, message: 'Complaint registered successfully.', id: docRef.id };
    } catch (error: any) {
        console.error('Error creating complaint company visit:', error);
        return { success: false, message: error?.message || 'Failed to register complaint.' };
    }
}
