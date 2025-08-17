

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

async function getProfitLossReport(dateRange?: DateRange): Promise<ProfitLossData[]> {
    try {
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb.collection('orders');

        if (dateRange?.from) {
            query = query.where('createdAt', '>=', dateRange.from.toISOString());
        }
        if (dateRange?.to) {
            query = query.where('createdAt', '<=', dateRange.to.toISOString());
        }

        const ordersSnapshot = await query.get();
        const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

        const stockCache = new Map<string, Stock>();

        const profitLossData: ProfitLossData[] = [];

        for (const order of orders) {
            let costOfGoods = 0;
            if (order.fabricDetails) {
                for (const item of order.fabricDetails) {
                    const stockId = item.fabricName.replace(/\//g, '-');
                    let stockItem: Stock | undefined = stockCache.get(stockId);
                    
                    if (!stockItem) {
                        const stockDoc = await adminDb.collection('stocks').doc(stockId).get();
                        if (stockDoc.exists) {
                            stockItem = stockDoc.data() as Stock;
                            stockCache.set(stockId, stockItem);
                        }
                    }

                    if (stockItem) {
                        const itemCost = (stockItem.rlPrice || 0) * parseFloat(item.quantity);
                        costOfGoods += itemCost;
                    }
                }
            }
            
            const totalAmount = order.totalAmount || 0;
            const profit = totalAmount - costOfGoods;

            profitLossData.push({
                orderId: order.id,
                customerName: order.customerName,
                orderDate: order.createdAt,
                salesPerson: order.salesPerson,
                totalAmount: totalAmount,
                costOfGoods: costOfGoods,
                profit: profit,
            });
        }
        
        return JSON.parse(JSON.stringify(profitLossData.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())));

    } catch (error) {
        console.error("Error fetching profit and loss report:", error);
        return [];
    }
}

async function getStockAnalysis(dateRange?: DateRange): Promise<StockAnalysisData> {
    try {
        const stockSoldQuery = adminDb.collectionGroup('stockSold');
        let filteredSoldQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = stockSoldQuery;

        if (dateRange?.from) {
            filteredSoldQuery = filteredSoldQuery.where('createdAt', '>=', dateRange.from.toISOString());
        }
        if (dateRange?.to) {
            filteredSoldQuery = filteredSoldQuery.where('createdAt', '<=', dateRange.to.toISOString());
        }
        
        const stockSoldSnapshot = await filteredSoldQuery.get();
        const soldTransactions = stockSoldSnapshot.docs.map(doc => doc.data() as StockTransaction);

        // Top Selling Products
        const salesVolume = soldTransactions.reduce((acc, tx) => {
            const itemName = tx.bcn || 'Unknown';
            acc[itemName] = (acc[itemName] || 0) + Math.abs(tx.quantityChange);
            return acc;
        }, {} as Record<string, number>);

        const topSellingProducts = Object.entries(salesVolume)
            .map(([name, volume]) => ({ name, volume }))
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 5); // Top 5

        // Dead Stock
        const allStockSnapshot = await adminDb.collection('stocks').get();
        const allStock = allStockSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stock));

        const deadStockItems: { name: string; age: string; }[] = [];
        const ninetyDaysAgo = subDays(new Date(), 90);

        allStock.forEach(stock => {
            const lastSale = soldTransactions
                .filter(tx => tx.bcn === stock.bcn)
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

            if (!lastSale) {
                // Never sold
                const age = differenceInDays(new Date(), new Date(stock.lastUpdatedAt));
                deadStockItems.push({ name: stock.bcn || stock.itemName, age: `${age}+ days` });
            } else if (new Date(lastSale.createdAt) < ninetyDaysAgo) {
                // Not sold in the last 90 days
                const age = differenceInDays(new Date(), new Date(lastSale.createdAt));
                deadStockItems.push({ name: stock.bcn || stock.itemName, age: `${age} days` });
            }
        });

        return {
            topSellingProducts,
            deadStock: deadStockItems.sort((a, b) => parseInt(b.age) - parseInt(a.age)).slice(0, 5), // Top 5 oldest
        };

    } catch (error) {
        console.error("Error fetching stock analysis:", error);
        return { topSellingProducts: [], deadStock: [] };
    }
}
