
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
            const qty = Number(row[7] || 1); // Assuming quantity is in column H
            const stockItem: Partial<Stock> = {
                bcn: String(row[0] || ''),
                itemName: String(row[1] || ''),
                serialNo: String(row[2] || ''),
                hsnCode: String(row[3] || ''),
                rlPrice: Number(row[4] || 0),
                clPrice: Number(row[5] || 0),
                mrp: Number(row[6] || 0),
                quantity: qty,
                availableQty: qty, // Initially, all stock is available
                reservedQty: 0,
                cutQty: 0,
                category: String(row[9] || ''), // Column J
                vendorName: String(row[10] || ''), // Column K
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
        const q = stockRef
            .where('bcn', '>=', query)
            .where('bcn', '<=', query + '\uf8ff')
            .limit(10); 

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
    
    // For additions, we increase the actual and available quantities.
    if (transaction.type === 'addition') {
        await adminDb.runTransaction(async (tx) => {
            const stockDoc = await tx.get(stockRef);
            if (!stockDoc.exists) {
                // If stock doesn't exist, we can create it.
                const newStock: Stock = {
                    id: stockId,
                    bcn: transaction.bcn,
                    itemName: transaction.bcn, // Use BCN as item name if not provided
                    quantity: transaction.quantityChange,
                    availableQty: transaction.quantityChange,
                    reservedQty: 0,
                    cutQty: 0,
                    unit: 'Mtr',
                    lastUpdatedAt: new Date().toISOString(),
                };
                tx.set(stockRef, newStock);
            } else {
                 tx.update(stockRef, { 
                    quantity: FieldValue.increment(transaction.quantityChange),
                    availableQty: FieldValue.increment(transaction.quantityChange),
                    lastUpdatedAt: new Date().toISOString()
                });
            }
           
            const transactionRef = stockRef.collection('stockAdded').doc();
            tx.set(transactionRef, { ...transaction, id: transactionRef.id });
        });
    } else {
        // For deductions (after cutting), we reduce actual and reserved.
        await adminDb.runTransaction(async (tx) => {
             const stockDoc = await tx.get(stockRef);
             if (!stockDoc.exists) throw new Error(`Stock ${stockId} not found.`);

             tx.update(stockRef, { 
                quantity: FieldValue.increment(transaction.quantityChange), // quantityChange is negative
                reservedQty: FieldValue.increment(transaction.quantityChange), // quantityChange is negative
                cutQty: FieldValue.increment(Math.abs(transaction.quantityChange)),
                lastUpdatedAt: new Date().toISOString()
            });

            // Log the deduction
             const transactionRef = stockRef.collection('stockSold').doc();
             tx.set(transactionRef, { ...transaction, id: transactionRef.id });
        });
    }

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

    batch.update(stockRef, {
        quantity: FieldValue.increment(-totalRevertedQuantity),
        availableQty: FieldValue.increment(-totalRevertedQuantity),
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
    const addedTransactionsPromise = stockRef.collection('stockAdded').orderBy('createdAt', 'desc').get();
    const soldTransactionsPromise = stockRef.collection('stockSold').orderBy('createdAt', 'desc').get();
    
    const [addedSnapshot, soldSnapshot] = await Promise.all([addedTransactionsPromise, soldTransactionsPromise]);

    const addedTransactions = addedSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as StockTransaction));
    const soldTransactions = soldSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as StockTransaction));
    
    const allTransactions = [...addedTransactions, ...soldTransactions];
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
      const soldPromise = stockRef.collection('stockSold').get();
      
      const [addedSnapshot, soldSnapshot] = await Promise.all([addedPromise, soldPromise]);

      addedSnapshot.forEach(doc => {
        allTransactions.push({ ...doc.data(), id: doc.id } as StockTransaction);
      });
      soldSnapshot.forEach(doc => {
        allTransactions.push({ ...doc.data(), id: doc.id } as StockTransaction);
      });
    }

    allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return JSON.parse(JSON.stringify(allTransactions));
  } catch (error) {
    console.error('Error fetching all stock transactions:', error);
    return [];
  }
}

export async function deleteStockTransaction(stockId: string, transactionId: string, type: 'addition' | 'deduction'): Promise<{ success: boolean; message: string }> {
  const stockRef = adminDb.collection('stocks').doc(stockId);
  const txRef = stockRef.collection(type === 'addition' ? 'stockAdded' : 'stockSold').doc(transactionId);
  
  try {
      await adminDb.runTransaction(async (transaction) => {
          const txDoc = await transaction.get(txRef);
          if (!txDoc.exists) throw new Error("Transaction not found.");

          const txData = txDoc.data() as StockTransaction;
          const quantityChange = txData.quantityChange;

          // Revert the main stock quantities
          if (type === 'addition') {
              transaction.update(stockRef, { 
                  quantity: FieldValue.increment(-quantityChange),
                  availableQty: FieldValue.increment(-quantityChange),
              });
          } else { // deduction
              transaction.update(stockRef, { 
                  quantity: FieldValue.increment(-quantityChange), // adds back the negative quantity
                  reservedQty: FieldValue.increment(-quantityChange),
                  cutQty: FieldValue.increment(quantityChange), // quantityChange is negative
              });
          }

          transaction.delete(txRef);
      });
      return { success: true, message: "Transaction deleted and stock reverted." };
  } catch (error: any) {
    console.error("Error deleting stock transaction:", error);
    return { success: false, message: `Failed to delete transaction: ${error.message}` };
  }
}


export async function deleteStockTransactions(transactions: StockTransaction[]): Promise<{ success: boolean; message: string }> {
  try {
    const batch = adminDb.batch();
    const quantityReversals: Record<string, { qty: number; available: number; reserved: number; cut: number }> = {};

    transactions.forEach(tx => {
      const collectionName = tx.type === 'addition' ? 'stockAdded' : 'stockSold';
      const txRef = adminDb.collection('stocks').doc(tx.stockId).collection(collectionName).doc(tx.id);
      batch.delete(txRef);

      if (!quantityReversals[tx.stockId]) {
          quantityReversals[tx.stockId] = { qty: 0, available: 0, reserved: 0, cut: 0 };
      }
      
      const change = tx.quantityChange;
      if (tx.type === 'addition') {
          quantityReversals[tx.stockId].qty -= change;
          quantityReversals[tx.stockId].available -= change;
      } else { // deduction
           quantityReversals[tx.stockId].qty -= change;
           quantityReversals[tx.stockId].reserved -= change;
           quantityReversals[tx.stockId].cut += change;
      }
    });

    for (const stockId in quantityReversals) {
      const stockRef = adminDb.collection('stocks').doc(stockId);
      const reversal = quantityReversals[stockId];
      batch.update(stockRef, {
        quantity: FieldValue.increment(reversal.qty),
        availableQty: FieldValue.increment(reversal.available),
        reservedQty: FieldValue.increment(reversal.reserved),
        cutQty: FieldValue.increment(reversal.cut),
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
    
export async function getStockDetails(stockId: string) {
    try {
        const [stock, transactions] = await Promise.all([
            getStockById(stockId),
            getStockTransactions(stockId),
        ]);

        if (!stock) {
            return { success: false, message: "Stock not found" };
        }
        
        return {
            success: true,
            message: "Details fetched successfully.",
            data: JSON.parse(JSON.stringify({
                stock,
                transactions,
            }))
        };

    } catch (error: any) {
        console.error("Error fetching stock details:", error);
        return { success: false, message: `Failed to fetch details: ${error.message}` };
    }
}
