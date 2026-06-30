
'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order, PurchaseRequest, Stock, StockTransaction } from "@/lib/types";
import { DateRange } from "react-day-picker";
import { subDays, differenceInDays } from "date-fns";

type ReportType = 'order-summary' | 'sales-performance' | 'purchase-report' | 'stock-ledger' | 'profit-loss' | 'stock-analysis';

interface ReportParams {
    reportType: ReportType;
    dateRange?: DateRange;
    userId?: string;
}

export interface SalesPerformanceData {
    salesman: string;
    totalOrders: number;
    totalValue: number;
}

export interface ProfitLossData {
    orderId: string;
    customerName: string;
    orderDate: string;
    salesPerson: string;
    totalAmount: number;
    costOfGoods: number;
    profit: number;
}

export interface StockAnalysisData {
    topSellingProducts: { name: string; volume: number; }[];
    deadStock: { name: string; age: string; }[];
}

export interface ReportData {
    orders?: Order[];
    salesPerformance?: SalesPerformanceData[];
    purchaseReport?: PurchaseRequest[];
    stockLedger?: StockTransaction[];
    profitLoss?: ProfitLossData[];
    stockAnalysis?: StockAnalysisData;
}

// Default to last 30 days when no date range selected
function resolveRange(dateRange?: DateRange): { from: Date; to: Date } {
    return {
        from: dateRange?.from ?? subDays(new Date(), 30),
        to: dateRange?.to ?? new Date(),
    };
}

export async function getReportData(params: ReportParams): Promise<ReportData> {
    switch (params.reportType) {
        case 'order-summary':
            return { orders: await getOrderSummary(params.dateRange, params.userId) };
        case 'sales-performance':
            return { salesPerformance: await getSalesPerformance(params.dateRange) };
        case 'purchase-report':
            return { purchaseReport: await getPurchaseReport(params.dateRange) };
        case 'stock-ledger':
            return { stockLedger: await getStockLedger(params.dateRange) };
        case 'profit-loss':
            return { profitLoss: await getProfitLossReport(params.dateRange) };
        case 'stock-analysis':
            return { stockAnalysis: await getStockAnalysis(params.dateRange) };
        default:
            throw new Error('Invalid report type');
    }
}

async function getOrderSummary(dateRange?: DateRange, userId?: string): Promise<Order[]> {
    try {
        const { from, to } = resolveRange(dateRange);
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb.collection('orders')
            .where('createdAt', '>=', from.toISOString())
            .where('createdAt', '<=', to.toISOString());

        if (userId && userId !== 'all') {
            query = query.where('salesPerson', '==', userId);
        }

        const snapshot = await query.orderBy('createdAt', 'desc').limit(500).get();
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        return JSON.parse(JSON.stringify(orders));
    } catch (error) {
        console.error("Error fetching order summary:", error);
        return [];
    }
}

async function getSalesPerformance(dateRange?: DateRange): Promise<SalesPerformanceData[]> {
    try {
        const orders = await getOrderSummary(dateRange);
        const performanceMap = orders.reduce((acc, order) => {
            const salesman = order.salesPerson || 'Unknown';
            if (!acc[salesman]) {
                acc[salesman] = { salesman, totalOrders: 0, totalValue: 0 };
            }
            acc[salesman].totalOrders += 1;
            acc[salesman].totalValue += order.totalAmount || (order as any).grandTotal || 0;
            return acc;
        }, {} as Record<string, SalesPerformanceData>);

        return Object.values(performanceMap).sort((a, b) => b.totalValue - a.totalValue);
    } catch (error) {
        console.error("Error fetching sales performance:", error);
        return [];
    }
}

async function getPurchaseReport(dateRange?: DateRange): Promise<PurchaseRequest[]> {
    try {
        const { from, to } = resolveRange(dateRange);
        const snapshot = await adminDb.collection('purchaseRequests')
            .where('createdAt', '>=', from.toISOString())
            .where('createdAt', '<=', to.toISOString())
            .orderBy('createdAt', 'desc')
            .limit(300)
            .get();
        return JSON.parse(JSON.stringify(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest))));
    } catch (error) {
        console.error("Error fetching purchase report:", error);
        return [];
    }
}

// Stock transactions are stored in stocks/{stockId}/lengths subcollection
async function getStockLedger(dateRange?: DateRange): Promise<StockTransaction[]> {
    try {
        const { from, to } = resolveRange(dateRange);
        const snapshot = await adminDb.collectionGroup('lengths')
            .where('createdAt', '>=', from.toISOString())
            .where('createdAt', '<=', to.toISOString())
            .orderBy('createdAt', 'desc')
            .limit(300)
            .get();

        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockTransaction));
        return JSON.parse(JSON.stringify(transactions));
    } catch (error) {
        console.error("Error fetching stock ledger:", error);
        return [];
    }
}

async function getProfitLossReport(dateRange?: DateRange): Promise<ProfitLossData[]> {
    try {
        const orders = await getOrderSummary(dateRange);
        if (orders.length === 0) return [];

        // Collect all unique stock IDs to batch-fetch (avoids N+1)
        const stockIds = new Set<string>();
        orders.forEach(order => {
            if (order.fabricDetails) {
                order.fabricDetails.forEach(item => {
                    if (item.fabricName) stockIds.add(item.fabricName.replace(/\//g, '-'));
                });
            }
        });

        // Batch fetch stocks in chunks of 10 (Firestore getAll limit)
        const stockCache = new Map<string, Stock>();
        const idArray = Array.from(stockIds);
        const chunkSize = 10;
        for (let i = 0; i < idArray.length; i += chunkSize) {
            const chunk = idArray.slice(i, i + chunkSize);
            const refs = chunk.map(id => adminDb.collection('stocks').doc(id));
            if (refs.length > 0) {
                const docs = await adminDb.getAll(...refs);
                docs.forEach(doc => {
                    if (doc.exists) stockCache.set(doc.id, doc.data() as Stock);
                });
            }
        }

        const profitLossData: ProfitLossData[] = orders.map(order => {
            let costOfGoods = 0;
            if (order.fabricDetails) {
                order.fabricDetails.forEach(item => {
                    const stockId = item.fabricName?.replace(/\//g, '-');
                    const stockItem = stockId ? stockCache.get(stockId) : undefined;
                    if (stockItem) {
                        costOfGoods += (stockItem.rlPrice || 0) * parseFloat(String(item.quantity || 0));
                    }
                });
            }
            const totalAmount = order.totalAmount || (order as any).grandTotal || 0;
            return {
                orderId: order.crmOrderNo || order.orderNo || order.id,
                customerName: order.customerName || order.customerSnapshot?.name || '',
                orderDate: order.createdAt,
                salesPerson: order.salesPerson || 'Unknown',
                totalAmount,
                costOfGoods,
                profit: totalAmount - costOfGoods,
            };
        });

        return JSON.parse(JSON.stringify(profitLossData.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())));
    } catch (error) {
        console.error("Error fetching profit and loss report:", error);
        return [];
    }
}

async function getStockAnalysis(dateRange?: DateRange): Promise<StockAnalysisData> {
    try {
        const { from, to } = resolveRange(dateRange);

        // Top Selling: deduction transactions in the lengths subcollection
        const soldSnapshot = await adminDb.collectionGroup('lengths')
            .where('type', '==', 'deduction')
            .where('createdAt', '>=', from.toISOString())
            .where('createdAt', '<=', to.toISOString())
            .limit(1000)
            .get();

        const soldTransactions = soldSnapshot.docs.map(doc => doc.data() as StockTransaction);

        const salesVolume: Record<string, number> = {};
        soldTransactions.forEach(tx => {
            const name = tx.bcn || 'Unknown';
            salesVolume[name] = (salesVolume[name] || 0) + Math.abs(tx.quantityChange);
        });

        const topSellingProducts = Object.entries(salesVolume)
            .map(([name, volume]) => ({ name, volume: volume as number }))
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 5);

        // Dead Stock: items with qty > 0 but no recent sales
        const ninetyDaysAgo = subDays(new Date(), 90);
        const allSoldSnap = await adminDb.collectionGroup('lengths')
            .where('type', '==', 'deduction')
            .orderBy('createdAt', 'desc')
            .limit(2000)
            .get();

        const lastSaleByBcn = new Map<string, Date>();
        allSoldSnap.docs.forEach(doc => {
            const tx = doc.data() as StockTransaction;
            if (tx.bcn && !lastSaleByBcn.has(tx.bcn)) {
                lastSaleByBcn.set(tx.bcn, new Date(tx.createdAt));
            }
        });

        const allStockSnap = await adminDb.collection('stocks')
            .where('availableQty', '>', 0)
            .limit(200)
            .get();

        const deadStockItems: { name: string; age: string }[] = [];
        allStockSnap.docs.forEach(doc => {
            const stock = doc.data() as Stock;
            const bcn = stock.bcn || doc.id;
            const lastSale = lastSaleByBcn.get(bcn);
            const stockDate = new Date(stock.createdAt || (stock as any).createdAt || Date.now());

            if (!lastSale) {
                const age = differenceInDays(new Date(), stockDate);
                if (age > 30) deadStockItems.push({ name: bcn, age: `${age} days` });
            } else if (lastSale < ninetyDaysAgo) {
                const age = differenceInDays(new Date(), lastSale);
                deadStockItems.push({ name: bcn, age: `${age} days` });
            }
        });

        return {
            topSellingProducts,
            deadStock: deadStockItems
                .sort((a, b) => parseInt(b.age) - parseInt(a.age))
                .slice(0, 5),
        };
    } catch (error) {
        console.error("Error fetching stock analysis:", error);
        return { topSellingProducts: [], deadStock: [] };
    }
}
