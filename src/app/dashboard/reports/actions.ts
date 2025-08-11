"use server";

import { adminDb } from "@/lib/firebase-admin";
import { Order } from "@/lib/types";
import { DateRange } from "react-day-picker";

type ReportType = 'order-summary' | 'sales-performance' | 'purchase-report' | 'stock-ledger';

interface ReportParams {
    reportType: ReportType;
    dateRange?: DateRange;
    userId?: string;
}

export interface ReportData {
    orders?: Order[];
    // Other report data types can be added here
}

export async function getReportData(params: ReportParams): Promise<ReportData> {
    switch (params.reportType) {
        case 'order-summary':
            return getOrderSummary(params.dateRange, params.userId);
        default:
            throw new Error('Invalid report type');
    }
}

async function getOrderSummary(dateRange?: DateRange, userId?: string): Promise<{ orders: Order[] }> {
    try {
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb.collection('orders');

        if (dateRange?.from) {
            query = query.where('createdAt', '>=', dateRange.from.toISOString());
        }
        if (dateRange?.to) {
            query = query.where('createdAt', '<=', dateRange.to.toISOString());
        }

        if (userId && userId !== 'all') {
            // This assumes you want to filter by the person who created the order.
            // You might need a more complex query for salesman or installer.
            query = query.where('createdBy.id', '==', userId);
        }

        const snapshot = await query.orderBy('createdAt', 'desc').get();
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        
        return { orders: JSON.parse(JSON.stringify(orders)) };

    } catch (error) {
        console.error("Error fetching order summary:", error);
        return { orders: [] };
    }
}
