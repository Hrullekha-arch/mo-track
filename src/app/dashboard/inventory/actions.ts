
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Stock, StockTransaction, CuttingTask, CuttingTaskItem } from '@/lib/types';
import * as XLSX from "xlsx";
import { writeBatch, FieldValue, collection, collectionGroup, getDocs, query, where } from 'firebase-admin/firestore';

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
        return JSON.parse(JSON.stringify(stockData));
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
            'rl price', 'cl price', 'mrp', 'category', 'vendor name', 'qty'
        ];
        const missingHeaders = requiredHeaders.filter(rh => !headers.includes(rh));
        if (missingHeaders.length > 0) {
            return { success: false, message: `Missing required columns: ${missingHeaders.join(', ')}` };
        }

        const allItems = json.slice(1).map((row: any) => {
            const qty = Number(row[headers.indexOf('qty')] || 1);
            const bcn = String(row[headers.indexOf('bcn')] || '');
            const stockItem = {
                bcn: bcn,
                itemName: String(row[headers.indexOf('distributor collection name')] || ''),
                serialNo: String(row[headers.indexOf('serial no')] || ''),
                hsnCode: String(row[headers.indexOf('hsn code')] || ''),
                rlPrice: Number(row[headers.indexOf('rl price')] || 0),
                clPrice: Number(row[headers.indexOf('cl price')] || 0),
                mrp: Number(row[headers.indexOf('mrp')] || 0),
                quantity: qty,
                availableQty: qty,
                reservedQty: 0,
                cutQty: 0,
                category: String(row[headers.indexOf('category')] || ''),
                vendorName: String(row[headers.indexOf('vendor name')] || ''),
                unit: 'Mtr', // Assuming Mtr for fabric
                type: String(row[headers.indexOf('category')] || 'fabric').toLowerCase(),
                lastUpdatedAt: new Date().toISOString(),
            };
            return stockItem;
        }).filter(item => item.bcn);

        const batch = adminDb.batch();

        for (const stockItem of allItems) {
            const bcnDocRef = adminDb.collection("stocks").doc(stockItem.bcn);
            const lengthDocRef = bcnDocRef.collection("lengths").doc(); // Auto-generate ID for the length

            batch.set(bcnDocRef, { bcn: stockItem.bcn }, { merge: true }); // Create parent doc if not exists
            batch.set(lengthDocRef, { ...stockItem, id: lengthDocRef.id });
        }
        
        await batch.commit();

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
  const stockRef = adminDb.collection('stocks').doc(stockId);
  
  if (transaction.type === 'addition') {
    let finalStockData: Stock;
    
    try {
      // Let Firestore generate a unique ID for each new length document
      const newLengthRef = stockRef.collection('lengths').doc();

      await adminDb.runTransaction(async (tx) => {
          const stockDoc = await tx.get(stockRef); // READ FIRST
          
          const newLengthData: Partial<Stock> = {
              bcn: transaction.bcn,
              itemName: transaction.bcn,
              quantity: transaction.quantityChange,
              availableQty: transaction.quantityChange,
              reservedQty: 0,
              cutQty: 0,
              unit: 'Mtr',
              lastUpdatedAt: transaction.createdAt,
              poNumber: transaction.poNumber,
              salesman: transaction.salesman,
          };

          tx.set(newLengthRef, { ...newLengthData, id: newLengthRef.id }); // WRITE

          if (!stockDoc.exists) {
              tx.set(stockRef, { // WRITE
                  bcn: stockId,
                  itemName: transaction.bcn,
                  quantity: transaction.quantityChange,
                  availableQty: transaction.quantityChange,
                  reservedQty: 0,
                  cutQty: 0,
                  tax: 0,
                  rack: "",
                  vendorName: "",
                  hsnCode: "",
                  category: "",
                  serialNo: "",
                  mrp: 0
              }, { merge: true });
          } else {
              tx.update(stockRef, { // WRITE
                  quantity: FieldValue.increment(transaction.quantityChange),
                  availableQty: FieldValue.increment(transaction.quantityChange),
              });
          }
      });
      
      const updatedStockDoc = await stockRef.get();
      finalStockData = { id: updatedStockDoc.id, ...updatedStockDoc.data() } as Stock;
      
      return { success: true, message: 'Stock added successfully.', newStock: JSON.parse(JSON.stringify(finalStockData)) };

    } catch (error: any) {
        console.error("Error in stock addition transaction:", error);
        return { success: false, message: `Failed to add stock: ${error.message}` };
    }
  }
  
  // Handling for deductions remains complex and should be managed via allocation/cutting flows.
  return { success: false, message: 'This function only supports additions. Deductions are handled elsewhere.' };
}

export async function revertStockAdditionAction(
  stockId: string, // This is now BCN
  poNumber: string,
  bcn: string,
  revertedBy: string
): Promise<{ success: boolean; message: string; }> {
  try {
    const stockRef = adminDb.collection('stocks').doc(stockId);
    
    // Find the length document by PO number and BCN.
    // This assumes one BCN per PO, which might need adjustment if a PO can have multiple rolls of the same BCN.
    const lengthsQuery = await stockRef.collection('lengths')
      .where('poNumber', '==', poNumber)
      .where('bcn', '==', bcn)
      .limit(1)
      .get();
      
    if (lengthsQuery.empty) {
      throw new Error(`No stock roll found for BCN ${bcn} and PO ${poNumber}.`);
    }

    const lengthDoc = lengthsQuery.docs[0];
    const lengthData = lengthDoc.data() as Stock;
    const lengthId = lengthDoc.id;
    const quantityToRevert = lengthData.quantity;

    await adminDb.runTransaction(async (transaction) => {
        // 1. Delete the length document
        transaction.delete(lengthDoc.ref);

        // 2. Decrement the main stock document quantities
        transaction.update(stockRef, {
            quantity: FieldValue.increment(-quantityToRevert),
            availableQty: FieldValue.increment(-quantityToRevert)
        });
        
        // (Optional) Log the reversion
        const revertLogRef = stockRef.collection('reversions').doc();
        transaction.set(revertLogRef, {
            revertedLengthId: lengthId,
            revertedQuantity: quantityToRevert,
            revertedBy: revertedBy,
            timestamp: new Date().toISOString()
        });
    });
    
    return { success: true, message: `Successfully reverted stock addition for BCN ${bcn} from PO ${poNumber}.` };
  } catch (error: any) {
    console.error(`Error reverting stock addition for ${stockId}:`, error);
    return { success: false, message: `Failed to revert stock addition: ${error.message}` };
  }
}

export async function getStockTransactions(bcn: string): Promise<StockTransaction[]> {
    try {
        const stockRef = adminDb.collection('stocks').doc(bcn);
        const addedSnapshot = await stockRef.collection('lengths').get();
        
        // Fetch all cutting tasks to find relevant cuts for this BCN
        const cuttingTasksSnapshot = await adminDb.collection('Cutting').where("items", "array-contains", {bcn: bcn}).get();

        const allCuttingItemsForBcn: (CuttingTaskItem & { createdAt: string; orderId: string; salesman: string })[] = [];
        cuttingTasksSnapshot.forEach(doc => {
            const task = doc.data() as CuttingTask;
            task.items.forEach(item => {
                if (item.bcn === bcn) {
                    allCuttingItemsForBcn.push({ 
                        ...item, 
                        createdAt: task.createdAt, 
                        orderId: task.orderId,
                        salesman: task.salesPerson
                    });
                }
            });
        });

        const soldTransactions: StockTransaction[] = allCuttingItemsForBcn.map(cut => ({
            id: `${cut.orderId}-${cut.stockAddedId}-${new Date(cut.createdAt).getTime()}`, // Make key more unique
            bcn: cut.bcn,
            type: 'deduction',
            quantityChange: -cut.quantityAllocated,
            orderId: cut.orderId,
            createdAt: cut.createdAt,
            createdBy: (cut as any).cutBy || "Cutting Module", // Use the name of the user who cut
            status: cut.status,
            lengthId: cut.stockAddedId,
            salesman: cut.salesman,
        } as StockTransaction));

        const addedTransactionsPromises = addedSnapshot.docs.map(async (doc) => {
            const data = doc.data();
            const lengthId = doc.id;
            
            // Filter the cutting items to get the history for this specific roll
            const cutHistory: StockTransaction[] = allCuttingItemsForBcn
                .filter(item => item.stockAddedId === lengthId)
                .map(cut => ({
                    id: `${cut.orderId}-${cut.stockAddedId}-${new Date(cut.createdAt).getTime()}`,
                    type: 'deduction',
                    quantityChange: -cut.quantityAllocated,
                    createdAt: cut.createdAt,
                    orderId: cut.orderId,
                    salesman: cut.salesman
                } as StockTransaction))
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            return { 
                ...data,
                id: doc.id,
                bcn: bcn,
                type: 'addition',
                quantityChange: Number(data.quantity) || 0,
                createdAt: data.lastUpdatedAt || new Date().toISOString(),
                salesman: data.salesman || 'N/A',
                createdBy: "Inbound Process", // Or fetch from the original PR
                cutHistory: cutHistory,
            } as StockTransaction;
        });
  
        const addedTransactions = await Promise.all(addedTransactionsPromises);
  
        const allTransactions = [...addedTransactions, ...soldTransactions];
        allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
        return JSON.parse(JSON.stringify(allTransactions));
    } catch (error) {
        console.error(`Error fetching transactions for stock ${bcn}:`, error);
        return [];
    }
}


export async function getAvailableStockLengths(bcn: string): Promise<{ success: boolean; message: string; lengths?: { length: number; transactionId: string }[] }> {
    try {
        const lengthsSnapshot = await adminDb.collection('stocks').doc(bcn).collection('lengths').get();
        
        const availableLengths: { length: number; transactionId: string; }[] = [];
        lengthsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.availableQty > 0) {
                 availableLengths.push({ length: data.availableQty, transactionId: doc.id });
            }
        });

        return { success: true, message: 'Lengths fetched.', lengths: JSON.parse(JSON.stringify(availableLengths.sort((a,b) => a.length - b.length))) };

    } catch (error: any) {
        console.error("Error fetching available stock lengths:", error);
        return { success: false, message: 'Failed to fetch available stock.' };
    }
}


export async function getAllStockTransactions(): Promise<StockTransaction[]> {
    try {
        // Fetch all stock additions from the 'lengths' subcollection across all 'stocks' documents
        const addedSnapshot = await adminDb.collectionGroup('lengths').get();
        const addedTransactions: StockTransaction[] = addedSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                type: 'addition',
                quantityChange: Number(data.quantity) || 0,
                createdAt: data.lastUpdatedAt || new Date().toISOString(),
                createdBy: data.createdBy || "Inbound Process",
                salesman: data.salesman || 'N/A',
            } as StockTransaction;
        });

        // Fetch all stock deductions from the 'Cutting' collection
        const cuttingTasksSnapshot = await adminDb.collection('Cutting').get();
        const soldTransactions: StockTransaction[] = [];
        cuttingTasksSnapshot.forEach(doc => {
            const task = doc.data() as CuttingTask;
            task.items.forEach(item => {
                soldTransactions.push({
                    id: `${task.orderId}-${item.bcn}-${item.stockAddedId || ''}-${new Date(task.createdAt).getTime()}`, // Make key more unique
                    bcn: item.bcn,
                    type: 'deduction',
                    quantityChange: -item.quantityAllocated,
                    orderId: task.orderId,
                    createdAt: task.createdAt,
                    createdBy: (item as any).cutBy || "Cutting Module", // Use the actual user if available
                    status: item.status,
                    lengthId: item.stockAddedId,
                    salesman: task.salesPerson, // Add salesman from the cutting task
                } as StockTransaction);
            });
        });

        // Merge and sort all transactions
        const allTransactions = [...addedTransactions, ...soldTransactions];
        allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return JSON.parse(JSON.stringify(allTransactions));
    } catch (error) {
        console.error("Error fetching all stock transactions:", error);
        return [];
    }
}


export async function deleteStockTransaction(stockId: string, transactionId: string, type: 'addition' | 'deduction'): Promise<{ success: boolean; message: string }> {
  return { success: false, message: "Direct deletion of individual transactions is currently disabled. Please revert from the source (e.g., order page)." };
}

export async function deleteStockTransactions(transactions: StockTransaction[]): Promise<{ success: boolean; message: string }> {
    return { success: false, message: "Bulk deletion is disabled for the new nested stock structure." };
}

export async function updateStockBatchAction(
    itemsToUpdate: { id: string; [key: string]: any }[]
): Promise<{ success: boolean; message: string }> {
    if (!itemsToUpdate || itemsToUpdate.length === 0) {
        return { success: false, message: "No items provided for update." };
    }

    let batch = adminDb.batch();
    let opCount = 0;

    for (const item of itemsToUpdate) {
        const docRef = adminDb.collection('stocks').doc(item.id);
        const { id, ...updateData } = item;
        batch.update(docRef, updateData);
        opCount++;

        if (opCount >= 499) {
            await batch.commit();
            batch = adminDb.batch();
            opCount = 0;
        }
    }

    if (opCount > 0) {
        await batch.commit();
    }

    return { success: true, message: `${itemsToUpdate.length} items have been updated.` };
}
    
export async function getStockDetails(bcn: string) {
    try {
        const stockRef = adminDb.collection('stocks').doc(bcn);
        const stockDoc = await stockRef.get();
        if (!stockDoc.exists) {
            return { success: false, message: "Stock BCN not found" };
        }

        const stock = { id: stockDoc.id, ...stockDoc.data() } as Stock;
        
        // Correctly fetch transactions using the already fixed function
        const transactions = await getStockTransactions(bcn);
        
        // Correctly get available lengths from the lengths subcollection
        const lengthsSnapshot = await stockRef.collection('lengths').get();
        const availableLengths = lengthsSnapshot.docs
            .map(doc => ({ length: doc.data().availableQty, transactionId: doc.id }))
            .filter(l => l.length > 0)
            .sort((a,b) => a.length - b.length);
        
        return {
            success: true,
            message: "Details fetched successfully.",
            data: JSON.parse(JSON.stringify({
                stock,
                transactions,
                availableLengths
            }))
        };

    } catch (error: any) {
        console.error("Error fetching stock details:", error);
        return { success: false, message: `Failed to fetch details: ${error.message}` };
    }
}
