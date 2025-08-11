
"use server";

import { adminDb } from "@/lib/firebase-admin";
import { Order, PurchaseRequest, StockTransaction } from "@/lib/types";
import { DateRange } from "react-day-picker";

type ReportType = 'order-summary' | 'sales-performance' | 'purchase-report' | 'stock-ledger' | 'profit-loss';

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

export interface ReportData {
    orders?: Order[];
    salesPerformance?: SalesPerformanceData[];
    purchaseReport?: PurchaseRequest[];
    stockLedger?: StockTransaction[];
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
        default:
            throw new Error('Invalid report type');
    }
}

async function getOrderSummary(dateRange?: DateRange, userId?: string): Promise<Order[]> {
    try {
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb.collection('orders');

        if (dateRange?.from) {
            query = query.where('createdAt', '>=', dateRange.from.toISOString());
        }
        if (dateRange?.to) {
            query = query.where('createdAt', '<=', dateRange.to.toISOString());
        }

        if (userId && userId !== 'all') {
            query = query.where('salesPerson', '==', userId);
        }

        const snapshot = await query.orderBy('createdAt', 'desc').get();
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        
        return JSON.parse(JSON.stringify(orders));

    } catch (error) {
        console.error("Error fetching order summary:", error);
        return [];
    }
}

async function getSalesPerformance(dateRange?: DateRange): Promise<SalesPerformanceData[]> {
    try {
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb.collection('orders');

        if (dateRange?.from) {
            query = query.where('createdAt', '>=', dateRange.from.toISOString());
        }
        if (dateRange?.to) {
            query = query.where('createdAt', '<=', dateRange.to.toISOString());
        }

        const snapshot = await query.get();
        const orders = snapshot.docs.map(doc => doc.data() as Order);

        const performanceMap = orders.reduce((acc, order) => {
            if (!acc[order.salesPerson]) {
                acc[order.salesPerson] = { salesman: order.salesPerson, totalOrders: 0, totalValue: 0 };
            }
            acc[order.salesPerson].totalOrders += 1;
            acc[order.salesPerson].totalValue += order.totalAmount || 0;
            return acc;
        }, {} as Record<string, SalesPerformanceData>);

        return Object.values(performanceMap).sort((a,b) => b.totalValue - a.totalValue);

    } catch (error) {
        console.error("Error fetching sales performance:", error);
        return [];
    }
}

async function getPurchaseReport(dateRange?: DateRange): Promise<PurchaseRequest[]> {
    try {
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb.collection('purchaseRequests');

        if (dateRange?.from) {
            query = query.where('createdAt', '>=', dateRange.from.toISOString());
        }
        if (dateRange?.to) {
            query = query.where('createdAt', '<=', dateRange.to.toISOString());
        }

        const snapshot = await query.orderBy('createdAt', 'desc').get();
        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
        
        return JSON.parse(JSON.stringify(requests));
    } catch (error) {
        console.error("Error fetching purchase report:", error);
        return [];
    }
}

async function getStockLedger(dateRange?: DateRange): Promise<StockTransaction[]> {
    try {
        const stockAddedQuery = adminDb.collectionGroup('stockAdded');
        const stockSoldQuery = adminDb.collectionGroup('stockSold');
        
        let addedQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = stockAddedQuery;
        let soldQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = stockSoldQuery;

        if (dateRange?.from) {
            addedQuery = addedQuery.where('createdAt', '>=', dateRange.from.toISOString());
            soldQuery = soldQuery.where('createdAt', '>=', dateRange.from.toISOString());
        }
        if (dateRange?.to) {
            addedQuery = addedQuery.where('createdAt', '<=', dateRange.to.toISOString());
            soldQuery = soldQuery.where('createdAt', '<=', dateRange.to.toISOString());
        }
        
        const [addedSnapshot, soldSnapshot] = await Promise.all([
            addedQuery.orderBy('createdAt', 'desc').get(),
            soldQuery.orderBy('createdAt', 'desc').get()
        ]);
        
        const addedTransactions = addedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockTransaction));
        const soldTransactions = soldSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockTransaction));
        
        const allTransactions = [...addedTransactions, ...soldTransactions];
        allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return JSON.parse(JSON.stringify(allTransactions));
    } catch (error) {
        console.error("Error fetching stock ledger:", error);
        return [];
    }
}
