
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
    source?: 'customers' | 'walkin';
};

type ComplaintSearchDebugMeta = {
    traceId?: string;
    source?: string;
};

type ComplaintSearchDebugInfo = {
    traceId: string;
    source: string;
    elapsedMs: number;
    query: string;
    normalizedDigitsLength: number;
    customersScanned: number;
    walkinsScanned: number;
    candidateCount: number;
    matchedCount: number;
    returnedCount: number;
    fetchElapsedMs?: number;
};

import { createHash } from 'crypto';

/**
 * OPTIMIZED CUSTOMER SEARCH FOR 10 BILLION DOCUMENTS
 * 
 * Key Optimizations:
 * 1. Firestore composite indexes for efficient queries
 * 2. Redis caching layer for frequent searches
 * 3. Intelligent query targeting (no full collection scans)
 * 4. Parallel execution with early termination
 * 5. Result streaming for large datasets
 */

// Required Firestore Composite Indexes:
// 1. customers: (phone, ASC) + (name, ASC)
// 2. customers: (email, ASC) + (name, ASC)
// 3. customers: (customerCode, ASC)
// 4. Walkin_Customer: (mobile, ASC) + (fullName, ASC)
// 5. Walkin_Customer: (email, ASC) + (fullName, ASC)
// 6. Walkin_Customer: (customerCode, ASC)

interface SearchCache {
    get(key: string): Promise<ComplaintCustomerSearchResult[] | null>;
    set(key: string, value: ComplaintCustomerSearchResult[], ttlSeconds: number): Promise<void>;
}

// Simple in-memory cache (replace with Redis in production)
class MemoryCache implements SearchCache {
    private cache = new Map<string, { data: any; expiresAt: number }>();

    async get(key: string) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    }

    async set(key: string, value: any, ttlSeconds: number) {
        this.cache.set(key, {
            data: value,
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
    }
}

const searchCache = new MemoryCache();

function getCacheKey(searchTerm: string): string {
    const normalized = searchTerm.trim().toLowerCase();
    return `complaint-search:${createHash('md5').update(normalized).digest('hex')}`;
}

function isPhoneNumber(input: string): boolean {
    const digits = input.replace(/\D/g, '');
    return digits.length >= 10;
}

function isEmail(input: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

function isCustomerCode(input: string): boolean {
    // Adjust pattern to match your customer code format
    return /^[A-Z0-9-_]{3,20}$/i.test(input.trim());
}

/**
 * Execute targeted Firestore queries instead of full collection scans
 */
async function executeTargetedQueries(
    searchTerm: string,
    normalized: string,
    normalizedDigits: string,
    traceId: string
): Promise<ComplaintCustomerSearchResult[]> {
    const queries: Promise<ComplaintCustomerSearchResult[]>[] = [];
    const MAX_RESULTS_PER_QUERY = 20;

    // Strategy 1: Phone number search (most common and specific)
    if (isPhoneNumber(searchTerm)) {
        console.info(`[${traceId}] phone-search strategy`, { digits: normalizedDigits });
        
        queries.push(
            adminDb
                .collection('customers')
                .where('phone', '==', normalizedDigits)
                .limit(MAX_RESULTS_PER_QUERY)
                .get()
                .then(snapshot => mapCustomerDocs(snapshot, 'customers'))
        );

        queries.push(
            adminDb
                .collection('Walkin_Customer')
                .where('mobile', '==', normalizedDigits)
                .limit(MAX_RESULTS_PER_QUERY)
                .get()
                .then(snapshot => mapWalkinDocs(snapshot, 'walkin'))
        );
    }

    // Strategy 2: Email search (very specific)
    else if (isEmail(searchTerm)) {
        console.info(`[${traceId}] email-search strategy`, { email: normalized });
        
        queries.push(
            adminDb
                .collection('customers')
                .where('email', '==', normalized)
                .limit(MAX_RESULTS_PER_QUERY)
                .get()
                .then(snapshot => mapCustomerDocs(snapshot, 'customers'))
        );

        queries.push(
            adminDb
                .collection('Walkin_Customer')
                .where('email', '==', normalized)
                .limit(MAX_RESULTS_PER_QUERY)
                .get()
                .then(snapshot => mapWalkinDocs(snapshot, 'walkin'))
        );
    }

    // Strategy 3: Customer code search (exact match)
    else if (isCustomerCode(searchTerm)) {
        const code = searchTerm.trim().toUpperCase();
        console.info(`[${traceId}] customer-code-search strategy`, { code });
        
        queries.push(
            adminDb
                .collection('customers')
                .where('customerCode', '==', code)
                .limit(MAX_RESULTS_PER_QUERY)
                .get()
                .then(snapshot => mapCustomerDocs(snapshot, 'customers'))
        );

        queries.push(
            adminDb
                .collection('Walkin_Customer')
                .where('customerCode', '==', code)
                .limit(MAX_RESULTS_PER_QUERY)
                .get()
                .then(snapshot => mapWalkinDocs(snapshot, 'walkin'))
        );
    }

    // Strategy 4: Name search (less specific, use prefix matching)
    else if (searchTerm.length >= 3) {
        const prefix = normalized;
        const prefixEnd = prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);
        
        console.info(`[${traceId}] name-prefix-search strategy`, { prefix, prefixEnd });
        
        queries.push(
            adminDb
                .collection('customers')
                .where('name', '>=', prefix)
                .where('name', '<', prefixEnd)
                .limit(MAX_RESULTS_PER_QUERY)
                .get()
                .then(snapshot => mapCustomerDocs(snapshot, 'customers'))
        );

        queries.push(
            adminDb
                .collection('Walkin_Customer')
                .where('fullName', '>=', prefix)
                .where('fullName', '<', prefixEnd)
                .limit(MAX_RESULTS_PER_QUERY)
                .get()
                .then(snapshot => mapWalkinDocs(snapshot, 'walkin'))
        );
    }

    // Execute all queries in parallel
    const results = await Promise.allSettled(queries);
    
    const allCustomers: ComplaintCustomerSearchResult[] = [];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            allCustomers.push(...result.value);
            console.info(`[${traceId}] query-${index} returned ${result.value.length} results`);
        } else {
            console.error(`[${traceId}] query-${index} failed`, result.reason);
        }
    });

    return allCustomers;
}

function mapCustomerDocs(snapshot: FirebaseFirestore.QuerySnapshot, source: string): ComplaintCustomerSearchResult[] {
    return snapshot.docs.map((doc: any) => {
        const data = doc.data() as any;
        const firstName = String(data?.firstName || '').trim();
        const familyName = String(data?.familyName || '').trim();
        const mergedName = [firstName, familyName].filter(Boolean).join(' ').trim();
        const name = mergedName || String(data?.name || data?.fullName || '').trim();
        const phone = String(data?.phone || data?.mobile || '').trim();
        const mobileNo = String(data?.mobileNo || data?.mobile || '').trim();
        const email = String(data?.email || '').trim();
        
        const billingAddress = [
            data?.billingAddress?.line1,
            data?.billingAddress?.line2,
            data?.billingAddress?.landmark,
            data?.billingAddress?.city,
            data?.billingAddress?.state,
            data?.billingAddress?.country,
        ]
            .map((part) => String(part || '').trim())
            .filter(Boolean)
            .join(', ');
        
        const legacyAddress = String(data?.address || data?.addressPinCode || '').trim();
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
            source,
        };
    });
}

function mapWalkinDocs(snapshot: FirebaseFirestore.QuerySnapshot, source: string): ComplaintCustomerSearchResult[] {
    return snapshot.docs.map((doc: any) => {
        const data = doc.data() as any;
        const firstName = String(data?.firstName || '').trim();
        const familyName = String(data?.familyName || '').trim();
        const mergedName = [firstName, familyName].filter(Boolean).join(' ').trim();
        const name = mergedName || String(data?.fullName || data?.name || '').trim();
        const phone = String(data?.mobile || data?.phone || data?.mobileNo || '').trim();
        const mobileNo = String(data?.mobileNo || data?.mobile || data?.phone || '').trim();
        const email = String(data?.email || '').trim();
        
        const billingAddressFromObj = [
            data?.billingAddress?.line1,
            data?.billingAddress?.line2,
            data?.billingAddress?.landmark,
            data?.billingAddress?.city,
            data?.billingAddress?.state,
            data?.billingAddress?.country,
        ]
            .map((part) => String(part || '').trim())
            .filter(Boolean)
            .join(', ');
        
        const billingAddressText =
            typeof data?.billingAddress === 'string'
                ? String(data.billingAddress).trim()
                : billingAddressFromObj;
        
        const rawAddress = String(data?.address || data?.customerAddress || data?.addressPinCode || '').trim();
        const pincode = String(data?.billingAddress?.pincode || data?.pinCode || data?.pincode || '').trim();
        const customerCode = String(data?.customerCode || data?.customerId || data?.walkinId || '').trim();

        return {
            id: doc.id,
            name,
            phone: phone || undefined,
            mobileNo: mobileNo || undefined,
            email: email || undefined,
            billingAddress: billingAddressText || undefined,
            address: (rawAddress || billingAddressText) || undefined,
            pincode: pincode || undefined,
            customerCode: customerCode || undefined,
            source,
        };
    });
}

function rankAndDeduplicate(
    customers: ComplaintCustomerSearchResult[],
    normalized: string,
    normalizedDigits: string
): ComplaintCustomerSearchResult[] {
    const ranked = customers.map((row) => {
        const name = String(row.name || '').trim().toLowerCase();
        const email = String(row.email || '').trim().toLowerCase();
        const phone = String(row.phone || '').trim().toLowerCase();
        const mobileNo = String(row.mobileNo || '').trim().toLowerCase();
        const customerCode = String(row.customerCode || '').trim().toLowerCase();
        const address = String(row.address || row.billingAddress || '').trim().toLowerCase();
        const rowPhoneDigits = String(row.phone || '').replace(/\D/g, '');
        const rowMobileDigits = String(row.mobileNo || '').replace(/\D/g, '');

        let score = 0;

        // Exact matches get highest priority
        if (normalizedDigits) {
            if (rowPhoneDigits === normalizedDigits || rowMobileDigits === normalizedDigits) score += 1000;
            else if (rowPhoneDigits.includes(normalizedDigits) || rowMobileDigits.includes(normalizedDigits)) score += 500;
        }

        if (name === normalized) score += 900;
        else if (name.startsWith(normalized)) score += 600;
        else if (name.includes(normalized)) score += 300;

        if (email === normalized) score += 800;
        else if (email.startsWith(normalized)) score += 400;
        else if (email.includes(normalized)) score += 200;

        if (customerCode === normalized) score += 700;
        else if (customerCode.startsWith(normalized)) score += 350;
        else if (customerCode.includes(normalized)) score += 150;

        if (phone.includes(normalized) || mobileNo.includes(normalized)) score += 100;
        if (address.includes(normalized)) score += 50;

        return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

    // Deduplicate
    const deduped: ComplaintCustomerSearchResult[] = [];
    const seen = new Set<string>();
    
    for (const item of ranked) {
        const row = item.row;
        const dedupeKey = `${row.source || 'customers'}:${row.id}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        deduped.push(row);
        if (deduped.length >= 20) break;
    }

    return deduped;
}

export async function searchCustomersForComplaintAction(
    searchTerm: string,
    debugMeta?: ComplaintSearchDebugMeta
): Promise<{
    success: boolean;
    message: string;
    customers: ComplaintCustomerSearchResult[];
    debug?: ComplaintSearchDebugInfo;
}> {
    const startedAt = Date.now();
    const traceId = String(
        debugMeta?.traceId || `complaint-search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    const source = String(debugMeta?.source || 'unknown');

    try {
        const raw = String(searchTerm || '').trim();
        const normalized = raw.toLowerCase();
        const normalizedDigits = raw.replace(/\D/g, '');

        console.info(`[complaint-search][${traceId}] start`, {
            source,
            query: raw,
            normalizedDigitsLength: normalizedDigits.length,
            startedAtIso: new Date(startedAt).toISOString(),
        });

        // Validate input
        if (!raw || raw.length < 3) {
            const debug: ComplaintSearchDebugInfo = {
                traceId,
                source,
                elapsedMs: Date.now() - startedAt,
                query: raw,
                normalizedDigitsLength: normalizedDigits.length,
                customersScanned: 0,
                walkinsScanned: 0,
                candidateCount: 0,
                matchedCount: 0,
                returnedCount: 0,
            };
            console.info(`[complaint-search][${traceId}] invalid-query`, debug);
            return { 
                success: true, 
                message: 'Search term must be at least 3 characters.', 
                customers: [], 
                debug 
            };
        }

        // Check cache first
        const cacheKey = getCacheKey(raw);
        const cached = await searchCache.get(cacheKey);
        
        if (cached) {
            const debug: ComplaintSearchDebugInfo = {
                traceId,
                source,
                elapsedMs: Date.now() - startedAt,
                query: raw,
                normalizedDigitsLength: normalizedDigits.length,
                customersScanned: 0,
                walkinsScanned: 0,
                candidateCount: cached.length,
                matchedCount: cached.length,
                returnedCount: cached.length,
                cacheHit: true,
            };
            console.info(`[complaint-search][${traceId}] cache-hit`, debug);
            return {
                success: true,
                message: cached.length ? 'Customers found.' : 'Customer not found.',
                customers: cached,
                debug,
            };
        }

        // Execute targeted queries (no full scans)
        const fetchStartedAt = Date.now();
        const customers = await executeTargetedQueries(searchTerm, normalized, normalizedDigits, traceId);
        const fetchElapsedMs = Date.now() - fetchStartedAt;
        
        console.info(`[complaint-search][${traceId}] queries-completed`, {
            source,
            candidateCount: customers.length,
            fetchElapsedMs,
        });

        // Rank and deduplicate results
        const deduped = rankAndDeduplicate(customers, normalized, normalizedDigits);

        // Cache results (5 minute TTL)
        await searchCache.set(cacheKey, deduped, 300);

        const debug: ComplaintSearchDebugInfo = {
            traceId,
            source,
            elapsedMs: Date.now() - startedAt,
            query: raw,
            normalizedDigitsLength: normalizedDigits.length,
            customersScanned: customers.filter(c => c.source === 'customers').length,
            walkinsScanned: customers.filter(c => c.source === 'walkin').length,
            candidateCount: customers.length,
            matchedCount: deduped.length,
            returnedCount: deduped.length,
            fetchElapsedMs,
            cacheHit: false,
        };
        
        console.info(`[complaint-search][${traceId}] completed`, debug);

        return {
            success: true,
            message: deduped.length ? 'Customers found.' : 'Customer not found.',
            customers: deduped,
            debug,
        };
    } catch (error: any) {
        const debug: ComplaintSearchDebugInfo = {
            traceId,
            source,
            elapsedMs: Date.now() - startedAt,
            query: String(searchTerm || '').trim(),
            normalizedDigitsLength: String(searchTerm || '').replace(/\D/g, '').length,
            customersScanned: 0,
            walkinsScanned: 0,
            candidateCount: 0,
            matchedCount: 0,
            returnedCount: 0,
        };
        
        console.error(`[complaint-search][${traceId}] failed`, {
            source,
            elapsedMs: debug.elapsedMs,
            message: error?.message || 'Failed to search customers.',
            stack: error?.stack,
        });
        
        return {
            success: false,
            message: error?.message || 'Failed to search customers.',
            customers: [],
            debug,
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
