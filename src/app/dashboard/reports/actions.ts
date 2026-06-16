'use server';

import { adminDb } from "@/lib/firebase-admin";
import { Order, PurchaseRequest, StockTransaction } from "@/lib/types";
import { differenceInDays, subDays } from "date-fns";
import { DateRange } from "react-day-picker";

type ReportType =
    | 'order-summary'
    | 'sales-performance'
    | 'purchase-report'
    | 'stock-ledger'
    | 'profit-loss'
    | 'stock-analysis';

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
    topSellingProducts: { name: string; volume: number }[];
    deadStock: { name: string; age: string }[];
}

export interface ReportData {
    orders?: Order[];
    salesPerformance?: SalesPerformanceData[];
    purchaseReport?: PurchaseRequest[];
    stockLedger?: StockTransaction[];
    profitLoss?: ProfitLossData[];
    stockAnalysis?: StockAnalysisData;
}

interface StockSummary {
    id: string;
    bcn?: string;
    itemName?: string;
    name?: string;
    rlPrice?: number;
    costPriceRs?: number;
    lastUpdatedAt?: string;
    updatedAt?: string;
    createdAt?: string;
}

const serialize = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function getDateTime(value: unknown): number {
    if (typeof value !== 'string' || !value) return Number.NaN;
    return new Date(value).getTime();
}

function isWithinDateRange(value: string, dateRange?: DateRange): boolean {
    const time = getDateTime(value);
    if (!Number.isFinite(time)) return false;
    if (dateRange?.from && time < dateRange.from.getTime()) return false;
    if (dateRange?.to && time > dateRange.to.getTime()) return false;
    return true;
}

async function getOrderSummary(dateRange?: DateRange, userId?: string): Promise<Order[]> {
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb
        .collection('orders')
        .select(
            'crmOrderNo',
            'createdAt',
            'customerName',
            'customerPhone',
            'salesPerson',
            'storeName',
            'totalAmount',
            'fabricDetails',
        );

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
    return serialize(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
}

async function getStockSummaries(): Promise<StockSummary[]> {
    const snapshot = await adminDb
        .collection('stocks')
        .select(
            'bcn',
            'itemName',
            'name',
            'rlPrice',
            'costPriceRs',
            'lastUpdatedAt',
            'updatedAt',
            'createdAt',
        )
        .get();

    return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
        id: doc.id,
        ...doc.data(),
    } as StockSummary));
}

async function getCurrentStockLedger(): Promise<StockTransaction[]> {
    const cuttingSnapshot = await adminDb.collection('Cutting').get();
    const transactions: StockTransaction[] = [];

    cuttingSnapshot.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        const task = doc.data() as {
            orderId?: string;
            createdAt?: string;
            salesPerson?: string;
            items?: Array<{
                bcn?: string;
                quantityAllocated?: number | string;
                stockAddedId?: string;
                status?: StockTransaction['status'];
                cutBy?: string;
            }>;
        };

        if (!task.createdAt || !Array.isArray(task.items)) return;

        task.items.forEach((item, index) => {
            const bcn = String(item.bcn || '').trim();
            const quantity = Math.abs(Number(item.quantityAllocated) || 0);
            if (!bcn || quantity <= 0) return;

            transactions.push({
                id: `${doc.id}-${item.stockAddedId || bcn}-${index}`,
                stockId: bcn,
                bcn,
                type: 'deduction',
                quantityChange: -quantity,
                orderId: task.orderId,
                createdAt: task.createdAt!,
                createdBy: item.cutBy || 'Cutting Module',
                status: item.status,
                lengthId: item.stockAddedId,
                salesman: task.salesPerson,
            });
        });
    });

    return transactions.sort((a, b) => getDateTime(b.createdAt) - getDateTime(a.createdAt));
}

function buildSalesPerformance(orders: Order[]): SalesPerformanceData[] {
    const performance = new Map<string, SalesPerformanceData>();

    orders.forEach(order => {
        const salesman = order.salesPerson || 'Unknown';
        const current = performance.get(salesman) || {
            salesman,
            totalOrders: 0,
            totalValue: 0,
        };
        current.totalOrders += 1;
        current.totalValue += Number(order.totalAmount) || 0;
        performance.set(salesman, current);
    });

    return [...performance.values()].sort((a, b) => b.totalValue - a.totalValue);
}

function buildProfitLoss(orders: Order[], stocks: StockSummary[]): ProfitLossData[] {
    const stockById = new Map<string, StockSummary>();
    stocks.forEach(stock => {
        stockById.set(stock.id, stock);
        if (stock.bcn) stockById.set(stock.bcn, stock);
    });

    return orders.map(order => {
        const costOfGoods = (order.fabricDetails || []).reduce((total, item) => {
            const stockId = String(item.fabricName || '').replace(/\//g, '-');
            const stock = stockById.get(stockId);
            const unitCost = Number(stock?.rlPrice ?? stock?.costPriceRs) || 0;
            const quantity = Number.parseFloat(String(item.quantity || 0)) || 0;
            return total + unitCost * quantity;
        }, 0);
        const totalAmount = Number(order.totalAmount) || 0;

        return {
            orderId: order.id,
            customerName: order.customerName,
            orderDate: order.createdAt,
            salesPerson: order.salesPerson,
            totalAmount,
            costOfGoods,
            profit: totalAmount - costOfGoods,
        };
    });
}

function buildStockAnalysis(
    stocks: StockSummary[],
    stockLedger: StockTransaction[],
    dateRange?: DateRange,
): StockAnalysisData {
    const salesVolume = new Map<string, number>();
    const lastSaleByBcn = new Map<string, number>();

    stockLedger.forEach(transaction => {
        const saleTime = getDateTime(transaction.createdAt);
        const previousSale = lastSaleByBcn.get(transaction.bcn) || 0;
        if (Number.isFinite(saleTime) && saleTime > previousSale) {
            lastSaleByBcn.set(transaction.bcn, saleTime);
        }
        if (isWithinDateRange(transaction.createdAt, dateRange)) {
            salesVolume.set(
                transaction.bcn,
                (salesVolume.get(transaction.bcn) || 0) + Math.abs(transaction.quantityChange),
            );
        }
    });

    const topSellingProducts = [...salesVolume.entries()]
        .map(([name, volume]) => ({ name, volume }))
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5);

    const now = new Date();
    const ninetyDaysAgo = subDays(now, 90).getTime();
    const deadStock = stocks
        .map(stock => {
            const name = stock.bcn || stock.itemName || stock.name || stock.id;
            const lastSaleTime = lastSaleByBcn.get(name);
            if (lastSaleTime && lastSaleTime >= ninetyDaysAgo) return null;

            const referenceTime = lastSaleTime || getDateTime(
                stock.lastUpdatedAt || stock.updatedAt || stock.createdAt,
            );
            if (!Number.isFinite(referenceTime)) return null;

            const age = differenceInDays(now, new Date(referenceTime));
            return {
                name,
                age: lastSaleTime ? `${age} days` : `${age}+ days`,
                ageInDays: age,
            };
        })
        .filter((item): item is { name: string; age: string; ageInDays: number } => item !== null)
        .sort((a, b) => b.ageInDays - a.ageInDays)
        .slice(0, 5)
        .map(({ name, age }) => ({ name, age }));

    return { topSellingProducts, deadStock };
}

export async function getReportsDashboard(dateRange?: DateRange): Promise<Required<
    Pick<ReportData, 'orders' | 'salesPerformance' | 'stockLedger' | 'profitLoss' | 'stockAnalysis'>
>> {
    const [orders, stocks, stockLedger] = await Promise.all([
        getOrderSummary(dateRange),
        getStockSummaries(),
        getCurrentStockLedger(),
    ]);

    return serialize({
        orders,
        salesPerformance: buildSalesPerformance(orders),
        stockLedger,
        profitLoss: buildProfitLoss(orders, stocks),
        stockAnalysis: buildStockAnalysis(stocks, stockLedger, dateRange),
    });
}

async function getPurchaseReport(dateRange?: DateRange): Promise<PurchaseRequest[]> {
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb.collection('purchaseRequests');

    if (dateRange?.from) {
        query = query.where('createdAt', '>=', dateRange.from.toISOString());
    }
    if (dateRange?.to) {
        query = query.where('createdAt', '<=', dateRange.to.toISOString());
    }

    const snapshot = await query.orderBy('createdAt', 'desc').get();
    return serialize(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest)));
}

export async function getReportData(params: ReportParams): Promise<ReportData> {
    switch (params.reportType) {
        case 'order-summary':
            return { orders: await getOrderSummary(params.dateRange, params.userId) };
        case 'sales-performance': {
            const orders = await getOrderSummary(params.dateRange);
            return { salesPerformance: buildSalesPerformance(orders) };
        }
        case 'purchase-report':
            return { purchaseReport: await getPurchaseReport(params.dateRange) };
        case 'stock-ledger':
            return { stockLedger: serialize(await getCurrentStockLedger()) };
        case 'profit-loss': {
            const [orders, stocks] = await Promise.all([
                getOrderSummary(params.dateRange),
                getStockSummaries(),
            ]);
            return { profitLoss: serialize(buildProfitLoss(orders, stocks)) };
        }
        case 'stock-analysis': {
            const [stocks, stockLedger] = await Promise.all([
                getStockSummaries(),
                getCurrentStockLedger(),
            ]);
            return {
                stockAnalysis: serialize(buildStockAnalysis(stocks, stockLedger, params.dateRange)),
            };
        }
        default:
            throw new Error('Invalid report type');
    }
}
