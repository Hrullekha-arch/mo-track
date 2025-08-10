

'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Stock, StockTransaction } from '@/lib/types';
import * as XLSX from "xlsx";
import { writeBatch, FieldValue } from 'firebase-admin/firestore';

const BATCH_SIZE = 499; // Firestore batch limit is 500 operations

export async function getStockData(): Promise<Stock[]> {
    try {
        const stockSnapshot = await adminDb.collection('stocks').get();
        if (stockSnapshot.empty) {
            return [];
        }
        const stockData = stockSnapshot.docs.map(doc => {
            const data = doc.data();
            // Ensure lastUpdatedAt is a string, defaulting if necessary
            const lastUpdatedAt = data.lastUpdatedAt ? new Date(data.lastUpdatedAt).toISOString() : new Date().toISOString();
            return {
                id: doc.id,
                ...data,
                lastUpdatedAt,
            } as Stock;
        });
        return stockData;
    } catch (error) {
        console.error("Error fetching stock data from server:", error);
        // If quota is exceeded or another error occurs, return an empty array to prevent crashing.
        // The client can then handle the empty state or show an error.
        return [];
    }
}

export async function getStockById(id: string): Promise<Stock | null> {
    try {
        const docRef = adminDb.collection("stocks").doc(id);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            const stockData = { id: docSnap.id, ...docSnap.data() };
            return JSON.parse(JSON.stringify(stockData)) as Stock;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching stock by ID ${id}:`, error);
        return null;
    }
}


export async function importStockData(base64Data: string): Promise<{ success: boolean; message: string; count?: number }> {
    try {
        const fileBuffer = Buffer.from(base64Data, 'base64');
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (json.length < 2) {
            return { success: false, message: "The Excel sheet is empty or invalid." };
        }

        const headers: string[] = (json[0] as string[]).map(h => String(h).trim().toLowerCase());
        const requiredHeaders = [
            'bcn', 'distributor collection name', 'serial no', 'hsn code',
            'rl price', 'cl price', 'mrp', 'category', 'vendor name'
        ];
        const missingHeaders = requiredHeaders.filter(rh => !headers.includes(rh));
        if (missingHeaders.length > 0) {
            return { success: false, message: `Missing required columns: ${missingHeaders.join(', ')}` };
        }

        const allItems = json.slice(1).map(row => {
            const stockItem: Partial<Stock> = {
                bcn: String(row[0] || ''),
                itemName: String(row[1] || ''),
                serialNo: String(row[2] || ''),
                hsnCode: String(row[3] || ''),
                rlPrice: Number(row[4] || 0),
                clPrice: Number(row[5] || 0),
                mrp: Number(row[6] || 0),
                category: String(row[9] || ''), // Column J
                vendorName: String(row[10] || ''), // Column K
                quantity: 1,
                unit: 'pcs',
                type: String(row[9] || 'fabric').toLowerCase(),
                lastUpdatedAt: new Date().toISOString(),
            };
            return stockItem;
        }).filter(item => item.bcn);

        for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
            const chunk = allItems.slice(i, i + BATCH_SIZE);
            const batch = adminDb.batch();

            chunk.forEach(stockItem => {
                const rawDocId = stockItem.bcn;
                if (!rawDocId) return;

                const docId = rawDocId.replace(/\//g, '-');
                const stockRef = adminDb.collection("stocks").doc(docId);
                batch.set(stockRef, { ...stockItem, id: docId });
            });
            await batch.commit();
        }

        return { success: true, message: "Import successful!", count: allItems.length };

    } catch (error: any) {
        console.error("Error in importStockData server action:", error);
        return { success: false, message: `Server-side import failed: ${error.message}` };
    }
}

export async function searchStockByBcn(query: string): Promise<Stock[]> {
    if (!query) {
        return [];
    }

    try {
        const stockRef = adminDb.collection('stocks');
        // Firestore doesn't support partial string matching well.
        // This query finds documents where the 'bcn' field starts with the query string.
        const q = stockRef
            .where('bcn', '>=', query)
            .where('bcn', '<=', query + '\uf8ff')
            .limit(10); // Limit to 10 results for performance

        const snapshot = await q.get();

        if (snapshot.empty) {
            return [];
        }

        const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stock));
        return JSON.parse(JSON.stringify(results));
    } catch (error) {
        console.error("Error searching stock by BCN:", error);
        return [];
    }
}


export async function updateStockQuantityAction(
  stockId: string, 
  transaction: Omit<StockTransaction, 'id'>
): Promise<{ success: boolean; message: string; newStock?: Stock }> {
  try {
    const stockRef = adminDb.collection('stocks').doc(stockId);
    const transactionCollectionName = transaction.type === 'addition' ? 'stockAdded' : 'stockSold';
    const transactionRef = stockRef.collection(transactionCollectionName).doc();

    const batch = adminDb.batch();
    
    batch.set(transactionRef, { ...transaction, id: transactionRef.id });
    
    batch.update(stockRef, { 
      quantity: FieldValue.increment(transaction.quantityChange),
      lastUpdatedAt: new Date().toISOString()
    });

    await batch.commit();

    const updatedStockDoc = await stockRef.get();
    const newStockData = { id: updatedStockDoc.id, ...updatedStockDoc.data() } as Stock;

    return { success: true, message: 'Stock updated successfully.', newStock: JSON.parse(JSON.stringify(newStockData)) };
  } catch (error: any) {
    console.error(`Error updating stock for ${stockId}:`, error);
    if (error.code === 'NOT_FOUND') {
        return { success: false, message: `Stock item with ID ${stockId} not found. Could not update quantity.` };
    }
    return { success: false, message: `Failed to update stock: ${error.message}` };
  }
}

export async function revertStockAdditionAction(
  stockId: string,
  poNumber: string,
  itemName: string,
  revertedBy: string
): Promise<{ success: boolean; message: string; }> {
  try {
    const stockRef = adminDb.collection('stocks').doc(stockId);
    
    const addedTxQuery = stockRef.collection('stockAdded')
        .where('poNumber', '==', poNumber)
        .where('bcn', '==', itemName);

    const snapshot = await addedTxQuery.get();

    if (snapshot.empty) {
        return { success: false, message: "Transaction to revert not found. It might have already been reverted or never existed." };
    }

    const batch = adminDb.batch();
    let totalRevertedQuantity = 0;

    snapshot.forEach(doc => {
        const txData = doc.data() as StockTransaction;
        totalRevertedQuantity += txData.quantityChange;
        batch.delete(doc.ref);
    });

    // Update the main stock quantity
    batch.update(stockRef, {
        quantity: FieldValue.increment(-totalRevertedQuantity),
        lastUpdatedAt: new Date().toISOString()
    });

    await batch.commit();
    
    return { success: true, message: `Successfully reverted stock addition of ${totalRevertedQuantity.toFixed(2)} for ${itemName}.` };
  } catch (error: any) {
    console.error(`Error reverting stock addition for ${stockId}:`, error);
    return { success: false, message: `Failed to revert stock addition: ${error.message}` };
  }
}


export async function getStockTransactions(stockId: string): Promise<StockTransaction[]> {
  try {
    const stockRef = adminDb.collection('stocks').doc(stockId);

    // Fetch from both sub-collections
    const addedTransactionsPromise = stockRef.collection('stockAdded').orderBy('createdAt', 'desc').get();
    
    // To get sold transactions, we need to iterate through added transactions
    const [addedSnapshot] = await Promise.all([addedTransactionsPromise]);

    const allTransactions: StockTransaction[] = [];

    for (const addedDoc of addedSnapshot.docs) {
        allTransactions.push({ ...addedDoc.data(), id: addedDoc.id } as StockTransaction);
        const soldSnapshot = await addedDoc.ref.collection('stockSold').orderBy('createdAt', 'desc').get();
        soldSnapshot.forEach(soldDoc => {
            allTransactions.push({ ...soldDoc.data(), id: soldDoc.id } as StockTransaction)
        })
    }
    
    // Sort by creation date descending
    allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return JSON.parse(JSON.stringify(allTransactions));
  } catch (error) {
    console.error(`Error fetching transactions for stock ${stockId}:`, error);
    return [];
  }
}

export async function getAvailableStockLengths(stockId: string): Promise<{ success: boolean; message: string; lengths?: { length: number; transactionId: string }[] }> {
    try {
        const stockAddedSnapshot = await adminDb.collection('stocks').doc(stockId).collection('stockAdded').get();
        
        const availableLengths: { length: number; transactionId: string }[] = [];
        stockAddedSnapshot.docs.forEach(doc => {
            const data = doc.data() as StockTransaction;
            // The quantityChange of a stockAdded document now represents the current available length of that roll.
            if (data.quantityChange > 0) {
                 availableLengths.push({ length: data.quantityChange, transactionId: doc.id });
            }
        });

        return { success: true, message: 'Lengths fetched.', lengths: availableLengths.sort((a,b) => a.length - b.length) };

    } catch (error: any) {
        console.error("Error fetching available stock lengths:", error);
        return { success: false, message: 'Failed to fetch available stock.' };
    }
}


export async function getAllStockTransactions(): Promise<StockTransaction[]> {
  try {
    const allTransactions: StockTransaction[] = [];
    const stocksSnapshot = await adminDb.collection('stocks').get();

    for (const stockDoc of stocksSnapshot.docs) {
      const stockId = stockDoc.id;
      const stockRef = adminDb.collection('stocks').doc(stockId);

      const addedPromise = stockRef.collection('stockAdded').get();
      const [addedSnapshot] = await Promise.all([addedPromise]);

      for (const doc of addedSnapshot.docs) {
        allTransactions.push({ ...doc.data(), id: doc.id } as StockTransaction);
        const soldSnapshot = await doc.ref.collection('stockSold').get();
        soldSnapshot.forEach(soldDoc => {
            allTransactions.push({ ...soldDoc.data(), id: soldDoc.id } as StockTransaction);
        });
      }
    }

    allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return JSON.parse(JSON.stringify(allTransactions));
  } catch (error) {
    console.error('Error fetching all stock transactions:', error);
    return [];
  }
}

export async function deleteStockTransaction(stockId: string, transactionId: string, type: 'addition' | 'deduction'): Promise<{ success: boolean; message: string }> {
  // This logic becomes more complex with nested subcollections.
  // Deleting a 'deduction' would require finding its parent 'addition' and reverting the quantity.
  // Deleting an 'addition' would require deleting all its 'deduction' subcollections.
  // For now, we will prevent this action until a clear business rule is defined.
  
  return { success: false, message: "Direct deletion of individual transactions is currently disabled due to the new data structure. Please revert from the source (e.g., order page)." };
}


export async function deleteStockTransactions(transactions: StockTransaction[]): Promise<{ success: boolean; message: string }> {
  try {
    const batch = adminDb.batch();
    const quantityReversals: { [stockId: string]: number } = {};

    transactions.forEach(tx => {
      const collectionName = tx.type === 'addition' ? 'stockAdded' : 'stockSold';
      
      // The path to the transaction is now more complex for 'stockSold'
      // This bulk delete logic would need to be significantly more complex to handle the new nested structure
      // For now, we will disable it for safety.
      throw new Error("Bulk deletion is disabled for the new nested stock structure.");
      
    });

    for (const stockId in quantityReversals) {
      const stockRef = adminDb.collection('stocks').doc(stockId);
      batch.update(stockRef, {
        quantity: FieldValue.increment(quantityReversals[stockId]),
        lastUpdatedAt: new Date().toISOString(),
      });
    }

    await batch.commit();
    return { success: true, message: "Transactions deleted successfully." };

  } catch (error: any) {
    console.error("Error deleting stock transactions:", error);
    return { success: false, message: `Failed to delete transactions: ${error.message}` };
  }
}

export async function updateStockBatchAction(
    itemsToUpdate: { id: string; [key: string]: any }[]
): Promise<{ success: boolean; message: string }> {
    try {
        const batch = adminDb.batch();
        
        itemsToUpdate.forEach(item => {
            const { id, ...updateData } = item;
            if (!id) return;

            const docRef = adminDb.collection('stocks').doc(id);
            // We need to remove any undefined fields before updating
            const cleanedData = Object.fromEntries(Object.entries(updateData).filter(([_, v]) => v !== undefined));
            
            if (Object.keys(cleanedData).length > 0) {
                batch.update(docRef, { ...cleanedData, lastUpdatedAt: new Date().toISOString() });
            }
        });

        await batch.commit();
        return { success: true, message: "Batch update successful." };
    } catch (error: any) {
        console.error("Error updating stock batch:", error);
        return { success: false, message: `Failed to update batch: ${error.message}` };
    }
}
    

    