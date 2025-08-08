

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
    const transactionsRef = stockRef.collection('stockAdded');

    const q = transactionsRef.where('poNumber', '==', poNumber).where('bcn', '==', itemName);
    const snapshot = await q.get();

    if (snapshot.empty) {
      return { success: false, message: `No matching stock addition transaction found for PO ${poNumber} and item ${itemName}.` };
    }
    
    const batch = adminDb.batch();
    let totalRevertedQuantity = 0;

    snapshot.docs.forEach(doc => {
      const transaction = doc.data() as StockTransaction;
      totalRevertedQuantity += transaction.quantityChange;
      batch.delete(doc.ref);
    });

    batch.update(stockRef, {
        quantity: FieldValue.increment(-totalRevertedQuantity),
        lastUpdatedAt: new Date().toISOString()
    });

    await batch.commit();
    
    return { success: true, message: `Successfully reverted stock addition of ${totalRevertedQuantity} for ${itemName}.` };
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
    const soldTransactionsPromise = stockRef.collection('stockSold').orderBy('createdAt', 'desc').get();

    const [addedSnapshot, soldSnapshot] = await Promise.all([addedTransactionsPromise, soldTransactionsPromise]);

    const addedTransactions = addedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockTransaction));
    const soldTransactions = soldSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockTransaction));

    const allTransactions = [...addedTransactions, ...soldTransactions];

    // Sort by creation date descending
    allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return JSON.parse(JSON.stringify(allTransactions));
  } catch (error) {
    console.error(`Error fetching transactions for stock ${stockId}:`, error);
    return [];
  }
}

export async function getAllStockTransactions(): Promise<StockTransaction[]> {
  try {
    const addedPromise = adminDb.collectionGroup('stockAdded').orderBy('createdAt', 'desc').get();
    const soldPromise = adminDb.collectionGroup('stockSold').orderBy('createdAt', 'desc').get();

    const [addedSnapshot, soldSnapshot] = await Promise.all([addedPromise, soldPromise]);

    const addedTransactions = addedSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as StockTransaction));
    const soldTransactions = soldSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as StockTransaction));
    
    const allTransactions = [...addedTransactions, ...soldTransactions];

    allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return JSON.parse(JSON.stringify(allTransactions));
  } catch (error) {
    console.error('Error fetching all stock transactions:', error);
    return [];
  }
}

export async function deleteStockTransaction(stockId: string, transactionId: string, type: 'addition' | 'deduction'): Promise<{ success: boolean; message: string }> {
  try {
    const stockRef = adminDb.collection('stocks').doc(stockId);
    const collectionName = type === 'addition' ? 'stockAdded' : 'stockSold';
    const transactionRef = stockRef.collection(collectionName).doc(transactionId);
    
    const transactionDoc = await transactionRef.get();
    if (!transactionDoc.exists) {
      throw new Error("Transaction not found.");
    }

    const transactionData = transactionDoc.data() as StockTransaction;
    const quantityChange = transactionData.quantityChange;

    const batch = adminDb.batch();
    
    // Delete the transaction document
    batch.delete(transactionRef);

    // Revert the quantity change on the main stock item
    batch.update(stockRef, { 
      quantity: FieldValue.increment(-quantityChange), // Negating the change (e.g., if it was +50, this adds -50)
      lastUpdatedAt: new Date().toISOString()
    });

    await batch.commit();

    return { success: true, message: `Transaction ${transactionId} deleted and stock quantity updated.` };

  } catch (error: any) {
    console.error("Error deleting stock transaction:", error);
    return { success: false, message: `Failed to delete transaction: ${error.message}` };
  }
}
