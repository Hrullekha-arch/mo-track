
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Stock } from '@/lib/types';
import * as XLSX from "xlsx";
import { writeBatch } from 'firebase-admin/firestore';

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
            'rl price', 'cl price', 'mrp', 'caterogary', 'vendor name'
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
        const snapshot = await stockRef
            .where('bcn', '>=', query)
            .where('bcn', '<=', query + '\uf8ff')
            .limit(10)
            .get();

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
