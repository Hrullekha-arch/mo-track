
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { InvoiceBatch, InvoiceBatchItem } from '@/lib/types';
import admin from "firebase-admin";

export async function combineInvoiceBatchesAction(
  batchesToCombine: InvoiceBatch[]
): Promise<{ success: boolean; message: string }> {
  console.log('🔗 [combineInvoiceBatchesAction] ========================================');
  console.log('🔗 [combineInvoiceBatchesAction] SERVER ACTION STARTED');
  console.log('🔗 [combineInvoiceBatchesAction] Batches received:', batchesToCombine.length);
  console.log('🔗 [combineInvoiceBatchesAction] Batch IDs:', batchesToCombine.map(b => b.id));
  console.log('🔗 [combineInvoiceBatchesAction] Full batch data:', JSON.stringify(batchesToCombine, null, 2));

  // Validation: Minimum 2 batches required
  if (batchesToCombine.length < 2) {
    console.error('❌ [combineInvoiceBatchesAction] Insufficient batches:', batchesToCombine.length);
    return { success: false, message: 'At least two batches are required to combine.' };
  }

  const firstBatch = batchesToCombine[0];
  const orderId = firstBatch.orderId;
  
  console.log('📋 [combineInvoiceBatchesAction] Primary batch:', {
    id: firstBatch.id,
    orderId: firstBatch.orderId,
    customerName: firstBatch.customerName,
    customerPhone: firstBatch.customerPhone,
    status: firstBatch.status,
    isVas: firstBatch.isVas,
    itemsCount: firstBatch.items?.length
  });

  // Validation: All batches must belong to same order
  console.log('🔍 [combineInvoiceBatchesAction] Validating order consistency...');
  const differentOrderBatch = batchesToCombine.find((b) => b.orderId !== orderId);
  if (differentOrderBatch) {
    console.error('❌ [combineInvoiceBatchesAction] Order mismatch detected');
    console.error('❌ [combineInvoiceBatchesAction] Expected orderId:', orderId);
    console.error('❌ [combineInvoiceBatchesAction] Found batch with orderId:', differentOrderBatch.orderId);
    return { success: false, message: 'All selected batches must belong to the same order.' };
  }
  console.log('✅ [combineInvoiceBatchesAction] All batches belong to order:', orderId);

  // Validation: All batches must be pending invoice
  console.log('🔍 [combineInvoiceBatchesAction] Validating batch status...');
  const nonPendingBatch = batchesToCombine.find((b) => b.status !== 'pendingInvoice');
  if (nonPendingBatch) {
    console.error('❌ [combineInvoiceBatchesAction] Invalid status detected');
    console.error('❌ [combineInvoiceBatchesAction] Batch ID:', nonPendingBatch.id);
    console.error('❌ [combineInvoiceBatchesAction] Status:', nonPendingBatch.status);
    return { success: false, message: 'Only batches pending invoice generation can be combined.' };
  }
  console.log('✅ [combineInvoiceBatchesAction] All batches have pendingInvoice status');

  // Validation: Check VAS consistency
  console.log('🔍 [combineInvoiceBatchesAction] Validating VAS consistency...');
  const isVasInvoice = firstBatch.isVas === true;
  const vasInconsistent = batchesToCombine.some((b) => (b.isVas === true) !== isVasInvoice);
  if (vasInconsistent) {
    console.error('❌ [combineInvoiceBatchesAction] VAS type inconsistency detected');
    console.error('❌ [combineInvoiceBatchesAction] First batch isVas:', isVasInvoice);
    console.error('❌ [combineInvoiceBatchesAction] Batch VAS types:', batchesToCombine.map(b => ({
      id: b.id,
      isVas: b.isVas
    })));
    return { success: false, message: 'Cannot combine VAS and non-VAS invoices together.' };
  }
  console.log('✅ [combineInvoiceBatchesAction] VAS consistency validated. Is VAS Invoice:', isVasInvoice);

  try {
    console.log('💾 [combineInvoiceBatchesAction] Starting Firestore batch operation...');
    const firestoreBatch = adminDb.batch();

    // 1. Combine all items from the selected batches
    console.log('📦 [combineInvoiceBatchesAction] Combining items from all batches...');
    const combinedItems: InvoiceBatchItem[] = [];
    
    batchesToCombine.forEach((batch, batchIndex) => {
      console.log(`  📦 [combineInvoiceBatchesAction] Processing batch ${batchIndex + 1}/${batchesToCombine.length}:`, {
        id: batch.id,
        itemsCount: batch.items?.length
      });
      
      if (batch.items && Array.isArray(batch.items)) {
        batch.items.forEach((item, itemIndex) => {
          console.log(`    📦 [combineInvoiceBatchesAction] Item ${itemIndex + 1}:`, {
            itemName: item.itemName,
            bcn: item.bcn,
            quantityAllocated: item.quantityAllocated,
            rate: item.rate,
            discountPercent: item.discountPercent
          });
          combinedItems.push(item);
        });
      } else {
        console.warn(`  ⚠️ [combineInvoiceBatchesAction] Batch ${batch.id} has no items or invalid items array`);
      }
    });
    
    console.log('📦 [combineInvoiceBatchesAction] Total combined items:', combinedItems.length);
    console.log('📦 [combineInvoiceBatchesAction] Combined items summary:', combinedItems.map(item => ({
      itemName: item.itemName,
      bcn: item.bcn,
      qty: item.quantityAllocated
    })));

    // 2. Create a new invoice batch with the combined items
    console.log('📝 [combineInvoiceBatchesAction] Creating new combined batch document...');
    const newBatchRef = adminDb.collection('invoiceBatches').doc();
    console.log('📝 [combineInvoiceBatchesAction] New batch ID:', newBatchRef.id);
    
    const newCombinedBatch: Omit<InvoiceBatch, 'id'> = {
      orderId: firstBatch.orderId,
      customerName: firstBatch.customerName,
      customerPhone: firstBatch.customerPhone,
      customerAddress: firstBatch.customerAddress,
      salesPerson: firstBatch.salesPerson || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp() as any,
      status: 'pendingInvoice',
      items: combinedItems,
      isCombined: true,
      isVas: isVasInvoice,
      combinedFromBatches: batchesToCombine.map(b => b.id), // Track which batches were combined
    };
    
    console.log('📝 [combineInvoiceBatchesAction] New combined batch data:', {
      orderId: newCombinedBatch.orderId,
      customerName: newCombinedBatch.customerName,
      customerPhone: newCombinedBatch.customerPhone,
      status: newCombinedBatch.status,
      isCombined: newCombinedBatch.isCombined,
      isVas: newCombinedBatch.isVas,
      itemsCount: newCombinedBatch.items.length,
      combinedFromBatches: newCombinedBatch.combinedFromBatches
    });
    
    firestoreBatch.set(newBatchRef, newCombinedBatch);
    console.log('✅ [combineInvoiceBatchesAction] New batch added to Firestore batch');

    // 3. Delete the old batches
    console.log('🗑️ [combineInvoiceBatchesAction] Marking old batches for deletion...');
    batchesToCombine.forEach((batch, index) => {
      console.log(`  🗑️ [combineInvoiceBatchesAction] Deleting batch ${index + 1}/${batchesToCombine.length}:`, batch.id);
      const batchRef = adminDb.collection("invoiceBatches").doc(batch.id);
      firestoreBatch.delete(batchRef);
    });
    console.log('✅ [combineInvoiceBatchesAction] All old batches marked for deletion');

    // 4. Commit the batch operation
    console.log('💾 [combineInvoiceBatchesAction] Committing Firestore batch operation...');
    await firestoreBatch.commit();
    console.log('✅ [combineInvoiceBatchesAction] Firestore batch committed successfully!');

    console.log('🎉 [combineInvoiceBatchesAction] COMBINE OPERATION SUCCESSFUL');
    console.log('🎉 [combineInvoiceBatchesAction] New combined batch ID:', newBatchRef.id);
    console.log('🎉 [combineInvoiceBatchesAction] Deleted batch IDs:', batchesToCombine.map(b => b.id));
    console.log('🔗 [combineInvoiceBatchesAction] ========================================');

    return { 
      success: true, 
      message: `Successfully combined ${batchesToCombine.length} invoices into one batch.` 
    };
    
  } catch (error: any) {
    console.error('❌ [combineInvoiceBatchesAction] ========================================');
    console.error('❌ [combineInvoiceBatchesAction] ERROR OCCURRED');
    console.error('❌ [combineInvoiceBatchesAction] Error:', error);
    console.error('❌ [combineInvoiceBatchesAction] Error message:', error?.message);
    console.error('❌ [combineInvoiceBatchesAction] Error code:', error?.code);
    console.error('❌ [combineInvoiceBatchesAction] Error stack:', error?.stack);
    console.error('❌ [combineInvoiceBatchesAction] ========================================');
    
    return { 
      success: false, 
      message: `Failed to combine invoices: ${error?.message || 'Unknown error'}` 
    };
  }
}

interface GSTData {
    cgstPercent: number;
    sgstPercent: number;
    igstPercent: number;
    totalGstPercent: number;
    source: 'quotation' | 'default';
}

export async function fetchGSTFromQuotationAction(orderId: string): Promise<GSTData> {
  if (!orderId) {
    return { cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 0, totalGstPercent: 5, source: 'default' };
  }

  try {
    const quotationsQuery = adminDb.collectionGroup('quotations').where('orderNo', '==', orderId).limit(1);
    const querySnapshot = await quotationsQuery.get();

    if (querySnapshot.empty) {
      console.warn(`[GST] No quotation found for orderNo: ${orderId}. Defaulting GST.`);
      return { cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 0, totalGstPercent: 5, source: 'default' };
    }
    
    const quotationDoc = querySnapshot.docs[0];
    const quotationData = quotationDoc.data();
    
    const items = quotationData.items || [];
    if (items.length === 0) {
      console.warn(`[GST] No items in quotation for orderNo: ${orderId}. Defaulting GST.`);
      return { cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 0, totalGstPercent: 5, source: 'default' };
    }
    
    // Using the GST from the first item as the representative tax rate.
    const firstItem = items[0];
    const gstPercent = firstItem.gstPercent ?? 5; // Default to 5 if not present
    
    const cgstPercent = gstPercent / 2;
    const sgstPercent = gstPercent / 2;
    const igstPercent = 0; // Assuming IGST is not used based on current logic
    
    return {
      cgstPercent,
      sgstPercent,
      igstPercent,
      totalGstPercent: gstPercent,
      source: 'quotation'
    };

  } catch (error) {
    console.error(`[GST] Error fetching GST for order ${orderId}:`, error);
    return { cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 0, totalGstPercent: 5, source: 'default' };
  }
}
