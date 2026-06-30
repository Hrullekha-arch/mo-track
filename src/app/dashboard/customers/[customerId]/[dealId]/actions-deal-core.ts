'use server';

import { Deal, DealProduct, DealProductsDoc } from '@/lib/types';
import {
  adminDb,
  adminStorage,
  buildDealProductItem,
  normalizeBase64,
  sanitizeFileName,
  stripUndefined,
  uploadBufferToStorage,
} from './actions-shared';

export async function uploadFileToStorageAction(
  fileName: string,
  mimeType: string,
  base64Data: string,
  folder: string = 'measurements',
): Promise<string> {
  if (!adminStorage) {
    throw new Error(
      'Firebase Admin Storage is not initialized. Ensure FIREBASE_SERVICE_ACCOUNT_KEY and FIREBASE_STORAGE_BUCKET are set.',
    );
  }

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error(
      'FIREBASE_STORAGE_BUCKET env missing. Example: studio-3799785967-d0d9d.firebasestorage.app',
    );
  }

  const bucket = adminStorage.bucket(bucketName);
  const safeName = sanitizeFileName(fileName);
  const filePath = `${folder}/${Date.now()}_${safeName}`;
  const cleanBase64 = normalizeBase64(base64Data);
  if (!cleanBase64) throw new Error('Empty file payload.');
  const buffer = Buffer.from(cleanBase64, 'base64');
  return uploadBufferToStorage(bucket, filePath, buffer, mimeType);
}

export async function getDealById(customerId: string, dealId: string): Promise<Deal | null> {
  try {
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const docSnap = await dealRef.get();

    if (!docSnap.exists) return null;
    const dealData = { id: docSnap.id, ...docSnap.data() } as Deal;
    return JSON.parse(JSON.stringify(dealData));
  } catch (error) {
    console.error(`Error fetching deal ${dealId} for customer ${customerId}:`, error);
    return null;
  }
}

export async function getDealProducts(dealId: string): Promise<DealProductsDoc | null> {
  try {
    const docRef = adminDb.collection('dealProducts').doc(String(dealId));
    const snap = await docRef.get();
    if (!snap.exists) return null;
    const payload = { dealProductId: snap.id, ...snap.data() } as DealProductsDoc;
    return JSON.parse(JSON.stringify(payload));
  } catch (error) {
    console.error(`Error fetching dealProducts for deal ${dealId}:`, error);
    return null;
  }
}

export async function updateDealProducts(
  customerId: string,
  dealId: string,
  products: DealProduct[],
  actor?: { id?: string; name?: string },
): Promise<{ success: boolean; message: string }> {
  try {
    const dealProductsRef = adminDb.collection('dealProducts').doc(String(dealId));
    const existingSnap = await dealProductsRef.get();
    const existing = existingSnap.exists ? (existingSnap.data() as DealProductsDoc) : null;

    const safeProducts = Array.isArray(products) ? products.filter(Boolean) : [];
    const now = new Date().toISOString();
    const createdAt = existing?.createdAt || now;
    const createdBy = existing?.createdBy || actor?.name || actor?.id || 'System';
    const status = existing?.status || 'DRAFT';

    const normalItems = safeProducts
      .filter((product) => String(product.productType || '').toUpperCase() !== 'VAS')
      .map(buildDealProductItem);

    const vasItems = safeProducts
      .filter((product) => String(product.productType || '').toUpperCase() === 'VAS')
      .map(buildDealProductItem);

    const updates: NonNullable<DealProductsDoc['updates']> = Array.isArray(existing?.updates)
      ? [...existing.updates]
      : [];

    updates.push({
      updatedAt: now,
      action: 'UPDATED',
      message: `Products updated (${safeProducts.length}).`,
      ...(actor ? { updatedBy: { id: actor.id, name: actor.name } } : {}),
    });

    const payload: DealProductsDoc = stripUndefined({
      dealProductId: String(dealId),
      dealId: String(dealId),
      customerId: String(customerId),
      sections: {
        NORMAL: { items: normalItems },
        VAS: { items: vasItems },
      },
      status,
      updates,
      createdAt,
      updatedAt: now,
      createdBy,
    }) as DealProductsDoc;

    await dealProductsRef.set(payload, { merge: true });
    return { success: true, message: 'Products updated successfully.' };
  } catch (error) {
    console.error(`Error updating dealProducts for deal ${dealId}:`, error);
    return {
      success: false,
      message: `Failed to update products: ${(error as Error)?.message || 'Unknown error'}`,
    };
  }
}
