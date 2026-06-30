'use server';

import { DealMeasurement, DealProduct, Receipt, Selection } from '@/lib/types';
import { adminDb, admin, sanitizeMeasurementRooms } from './actions-shared';

export async function createSelectionAction(
  customerId: string,
  dealId: string,
  products: DealProduct[],
  creatorName: string,
): Promise<{ success: boolean; message: string; selection?: Selection }> {
  try {
    const selectionsRef = adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('selections');

    let selectionId = '';
    do {
      selectionId = Math.floor(1000 + Math.random() * 9000).toString();
    } while ((await selectionsRef.doc(selectionId).get()).exists);

    const fullProducts = products.map((p) => ({ ...p, id: p.id || `${Date.now()}-${Math.random()}` }));
    const newSelection: Selection = {
      id: selectionId,
      products: fullProducts,
      createdAt: new Date().toISOString(),
      createdBy: creatorName,
      totalMrp: products.reduce((sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.mrp) || 0), 0),
      totalPcs: products.reduce((sum, p) => sum + (Number(p.noOfPcs) || 1), 0),
      totalRooms: new Set(products.map((p) => p.room)).size,
      status: 'draft',
    };

    await selectionsRef.doc(selectionId).set(newSelection);
    return {
      success: true,
      message: 'Selection created successfully!',
      selection: JSON.parse(JSON.stringify(newSelection)),
    };
  } catch (error: any) {
    console.error('Error creating selection:', error);
    return { success: false, message: `Failed to create selection: ${error.message}` };
  }
}

export async function getProductsByIds(_productIds: string[]): Promise<DealProduct[]> {
  console.warn('getProductsByIds is a placeholder and not implemented efficiently.');
  return [];
}

export async function getSelectionsForDeal(customerId: string, dealId: string): Promise<Selection[]> {
  try {
    const snapshot = await adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('selections')
      .orderBy('createdAt', 'desc')
      .get();

    if (snapshot.empty) return [];
    return JSON.parse(JSON.stringify(snapshot.docs.map((doc) => doc.data() as Selection)));
  } catch (error) {
    console.error('Error fetching selections:', error);
    return [];
  }
}

export async function updateSelectionStatusAction(
  customerId: string,
  dealId: string,
  selectionId: string,
  status: 'draft' | 'final',
): Promise<{ success: boolean; message: string }> {
  try {
    await adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('selections')
      .doc(selectionId)
      .update({ status });

    return { success: true, message: `Selection status updated to ${status}.` };
  } catch (error: any) {
    console.error('Error updating selection status:', error);
    return { success: false, message: 'Failed to update selection status.' };
  }
}

export async function getSelectionById(customerId: string, dealId: string, selectionId: string) {
  try {
    const snap = await adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('selections')
      .doc(selectionId)
      .get();

    if (!snap.exists) return null;
    return JSON.parse(JSON.stringify({ id: snap.id, ...snap.data() }));
  } catch (e) {
    console.log('Error fetching selection:', e);
    return null;
  }
}

export async function updateBlindsAction({
  customerId,
  dealId,
  selectionId,
  roomName,
  blinds,
}: {
  customerId: string;
  dealId: string;
  selectionId: string;
  roomName: string;
  blinds: any[];
}) {
  try {
    if (!selectionId) return { success: false, error: 'Selection ID missing' };
    const selectionRef = adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('selections')
      .doc(selectionId);
    const snap = await selectionRef.get();
    if (!snap.exists) return { success: false, error: 'Selection not found' };

    const selectionData = snap.data() || {};
    const existingProducts = selectionData.products || [];
    const updatedExisting = existingProducts.map((prod: any) => {
      const match = blinds.find((b) => b.id === prod.id);
      return match ? { ...prod, ...match, room: roomName, isBlind: true } : prod;
    });
    const formattedNewBlinds = blinds
      .filter((b) => !existingProducts.some((p: any) => p.id === b.id))
      .map((b) => ({
        ...b,
        isBlind: true,
        room: roomName,
        salesDescription: '',
        collectionBrand: b.shadeNo || '',
        quantity: '0',
        remarks: '',
      }));

    await selectionRef.update({ products: [...updatedExisting, ...formattedNewBlinds] });
    return { success: true };
  } catch (err: any) {
    console.log('updateBlindsAction ERROR:', err);
    return { success: false, error: err.message };
  }
}

export async function updateSofasAction({
  customerId,
  dealId,
  selectionId,
  roomName,
  sofas,
}: {
  customerId: string;
  dealId: string;
  selectionId: string;
  roomName: string;
  sofas: any[];
}) {
  try {
    const selectionRef = adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('selections')
      .doc(selectionId);
    const snap = await selectionRef.get();
    if (!snap.exists) return { success: false, error: 'Selection not found' };

    const updatedProducts = [...(snap.data()?.products || [])];
    sofas.forEach((sofa) => {
      const existingIndex = updatedProducts.findIndex((p) => p.id === sofa.id);
      const sofaData = {
        id: sofa.id,
        isSofa: true,
        room: roomName,
        itemName: sofa.itemName,
        noOfSeat: sofa.noOfSeat,
        fabricQty: sofa.fabricQty,
        stitchingRate: sofa.stitchingRate,
        foam: sofa.foam || null,
        casement: sofa.casement || null,
        marking: sofa.marking || null,
        quantity: '0',
        noOfPcs: '1',
        collectionBrand: '',
        mrp: '0',
        remarks: '',
        salesDescription: '',
        verticalRepeat: '',
        horizontalRepeat: '',
      };
      if (existingIndex !== -1) updatedProducts[existingIndex] = { ...updatedProducts[existingIndex], ...sofaData };
      else updatedProducts.push(sofaData);
    });

    await selectionRef.update({ products: updatedProducts });
    return { success: true };
  } catch (err: any) {
    console.log('ERROR in updateSofasAction:', err);
    return { success: false, error: err.message };
  }
}

export async function updateItemsAction({
  customerId,
  dealId,
  selectionId,
  roomName,
  items,
}: {
  customerId: string;
  dealId: string;
  selectionId: string;
  roomName: string;
  items: any[];
}) {
  try {
    const selectionRef = adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('selections')
      .doc(selectionId);
    const snap = await selectionRef.get();
    if (!snap.exists) return { success: false, error: 'Selection not found' };

    const updatedProducts = Array.isArray(snap.data()?.products) ? [...snap.data()!.products] : [];
    items.forEach((item) => {
      let id = item.id;
      if (!id) id = adminDb.collection('_').doc().id;
      const index = updatedProducts.findIndex((p) => p.id === id);
      const itemData = {
        id,
        room: roomName,
        itemType: item.itemType || '',
        itemName: item.itemName || '',
        noOfPannel: item.noOfPannel || '',
        height: item.height || '',
        width: item.width || '',
        remark: item.remark || '',
        casement: item.casement || null,
        marking: item.marking || null,
        niwar: item.niwar || null,
        isBlind: false,
        isSofa: false,
        quantity: '0',
        noOfPcs: '1',
        collectionBrand: '',
        mrp: '0',
        remarks: '',
        salesDescription: '',
        verticalRepeat: '',
        horizontalRepeat: '',
      };
      if (index !== -1) updatedProducts[index] = { ...updatedProducts[index], ...itemData };
      else updatedProducts.push(itemData);
    });

    await selectionRef.update({ products: updatedProducts });
    return { success: true };
  } catch (err: any) {
    console.log('ERROR in updateItemsAction:', err);
    return { success: false, error: err.message };
  }
}

export async function saveMeasurementToDeal({
  customerId,
  dealId,
  visitId,
  selectionId,
  typeOf,
  doerName,
  rooms,
  itemDetails = [],
  createdBy,
  pdfUrl,
  status,
  flags,
}: {
  customerId?: string;
  dealId?: string;
  visitId?: string;
  selectionId?: string | null;
  typeOf?: string | null;
  doerName?: string | null;
  rooms: any[];
  itemDetails?: any[];
  createdBy?: string;
  pdfUrl?: string | null;
  status?: string;
  flags?: string[];
}) {
  try {
    const safeCreatedBy = (createdBy && createdBy.trim()) || (doerName && doerName.trim()) || 'System';
    const safeStatus = status || 'completed';
    const safeFlags = Array.isArray(flags) ? flags : [];
    let dealRef: FirebaseFirestore.DocumentReference | null = null;
    let visitRef: FirebaseFirestore.DocumentReference | null = null;

    if (customerId && dealId) {
      dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
      if (visitId) visitRef = dealRef.collection('visits').doc(visitId);
    }

    if (!dealRef) {
      if (!visitId) throw new Error('visitId missing (cannot resolve deal)');
      const cg = await adminDb
        .collectionGroup('visits')
        .where(admin.firestore.FieldPath.documentId(), '==', visitId)
        .limit(1)
        .get();
      if (!cg.empty) {
        visitRef = cg.docs[0].ref;
        dealRef = visitRef.parent.parent || null;
      }
      if (!dealRef) {
        const direct = await adminDb.collection('visits').doc(visitId).get();
        if (direct.exists) {
          visitRef = direct.ref;
          const v = direct.data() || {};
          if (v.customerId && v.dealId) {
            dealRef = adminDb.collection('customers').doc(v.customerId).collection('deals').doc(v.dealId);
          }
        }
      }
      if (!dealRef) throw new Error('Could not resolve dealRef from visitId. Visit not found in Firestore.');
    }

    const measurementRef = dealRef.collection('measurements').doc();
    const saveData: Record<string, any> = {
      id: measurementRef.id,
      createdAt: new Date().toISOString(),
      createdBy: safeCreatedBy,
      selectionId: selectionId ?? null,
      typeOf: typeOf ?? null,
      doerName: doerName ?? null,
      rooms: sanitizeMeasurementRooms(rooms || []),
      itemDetails: Array.isArray(itemDetails) ? itemDetails.filter(Boolean) : [],
      status: safeStatus,
      flags: safeFlags,
    };
    if (pdfUrl) saveData.pdfUrl = pdfUrl;

    const batch = adminDb.batch();
    batch.set(measurementRef, saveData, { merge: true });
    if (visitRef) {
      batch.set(
        visitRef,
        {
          status: 'completed',
          visitEndTime: new Date().toISOString(),
          measurementId: measurementRef.id,
          measurementSavedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...(pdfUrl ? { measurementPdfUrl: pdfUrl } : {}),
        },
        { merge: true },
      );
    }
    batch.set(
      dealRef,
      {
        latestMeasurementId: measurementRef.id,
        latestMeasurementAt: new Date().toISOString(),
      },
      { merge: true },
    );
    await batch.commit();

    return {
      success: true,
      measurementId: measurementRef.id,
      dealPath: dealRef.path,
      visitPath: visitRef?.path || null,
    };
  } catch (err: any) {
    console.error('saveMeasurementToDeal ERROR:', err);
    return { success: false, error: err.message || 'Failed to save measurement' };
  }
}

export async function inventoryLookupAction({ bcnList }: { bcnList: string[] }) {
  try {
    const results: Record<string, any> = {};
    for (const raw of bcnList) {
      const bcn = String(raw || '').trim();
      if (!bcn || bcn === 'N/A' || bcn === '-' || bcn === 'null' || bcn === 'undefined') {
        results[bcn] = { mrp: 0 };
        continue;
      }
      try {
        const snap = await adminDb.collection('stocks').doc(bcn).get();
        results[bcn] = snap.exists ? snap.data() : { mrp: 0 };
      } catch {
        results[bcn] = { mrp: 0 };
      }
    }
    return results;
  } catch {
    return {};
  }
}

export async function getMeasurementById(
  customerId: string,
  dealId: string,
  measurementId: string,
): Promise<DealMeasurement | null> {
  try {
    const snap = await adminDb
      .collection('customers')
      .doc(String(customerId))
      .collection('deals')
      .doc(String(dealId))
      .collection('measurements')
      .doc(String(measurementId))
      .get();
    if (!snap.exists) return null;
    return JSON.parse(JSON.stringify({ id: snap.id, ...snap.data() } as DealMeasurement));
  } catch (e) {
    console.log('error fetching measurement', e);
    return null;
  }
}

export async function addReceiptAction(
  customerId: string,
  dealId: string,
  receiptData: Omit<Receipt, 'id'>,
): Promise<{ success: boolean; message: string }> {
  try {
    const receiptRef = adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('receipts')
      .doc();
    await receiptRef.set({ ...receiptData, id: receiptRef.id });
    return { success: true, message: 'Receipt added successfully.' };
  } catch (error: any) {
    console.error('Error adding receipt:', error);
    return { success: false, message: `Failed to add receipt: ${error.message}` };
  }
}

export async function getReceiptsForDeal(customerId: string, dealId: string): Promise<Receipt[]> {
  try {
    const snapshot = await adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('receipts')
      .orderBy('date', 'desc')
      .get();
    if (snapshot.empty) return [];
    return JSON.parse(JSON.stringify(snapshot.docs.map((doc) => doc.data() as Receipt)));
  } catch (error) {
    console.error('Error fetching receipts:', error);
    return [];
  }
}
