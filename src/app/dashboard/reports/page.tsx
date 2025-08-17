

"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, ShoppingCart, Users, TrendingUp, Package, Star, BarChart, AlertTriangle, ArrowRight, TrendingDown, Sparkles, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { BarChart as RechartsBarChart, LineChart as RechartsLineChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useState, useEffect, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { getReportData, SalesPerformanceData, ProfitLossData, StockAnalysisData, Order } from "./actions";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const formatToINR = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);


export default function ReportsPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [orders, setOrders] = useState<Order[]>([]);
    const [salesPerformance, setSalesPerformance] = useState<SalesPerformanceData[]>([]);
    const [profitLoss, setProfitLoss] = useState<ProfitLossData[]>([]);
    const [stockAnalysis, setStockAnalysis] = useState<StockAnalysisData>({ topSellingProducts: [], deadStock: []});
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const fetchAllReports = async () => {
            setLoading(true);
            try {
                const [salesData, profitData, stockData, orderData] = await Promise.all([
                    getReportData({ reportType: 'sales-performance', dateRange }),
                    getReportData({ reportType: 'profit-loss', dateRange }),
                    getReportData({ reportType: 'stock-analysis', dateRange }),
                    getReportData({ reportType: 'order-summary', dateRange }),
                ]);
                
                setSalesPerformance(salesData.salesPerformance || []);
                setProfitLoss(profitData.profitLoss || []);
                setStockAnalysis(stockData.stockAnalysis || { topSellingProducts: [], deadStock: [] });
                setOrders(orderData.orders || []);

            } catch (error) {
                toast({
                    variant: "destructive",
                    title: "Error loading reports",
                    description: "Could not fetch all report data.",
                });
            } finally {
                setLoading(false);
            }
        };

        fetchAllReports();
    }, [dateRange, toast]);
    
    const totalSales = salesPerformance.reduce((acc, curr) => acc + curr.totalValue, 0);
    const totalProfit = profitLoss.reduce((acc, curr) => acc + curr.profit, 0);
    const avgMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
    const totalTransactions = salesPerformance.reduce((acc, curr) => acc + curr.totalOrders, 0);
    const avgBasketSize = totalTransactions > 0 ? totalSales / totalTransactions : 0;
    
    const actionableInsights = useMemo(() => {
        const insights = [];

        // Insight 1: Top selling product
        if (stockAnalysis.topSellingProducts.length > 0) {
            const topProduct = stockAnalysis.topSellingProducts[0];
            insights.push(`Restock high-demand items like ${topProduct.name} immediately.`);
        }

        // Insight 2: Dead stock
        if (stockAnalysis.deadStock.length > 0) {
            const deadItem = stockAnalysis.deadStock[0];
            insights.push(`Offer a promotion on Dead Stock items like ${deadItem.name} to clear inventory.`);
        }

        // Insight 3: Top salesman
        if (salesPerformance.length > 0) {
            const topSalesman = salesPerformance[0];
            insights.push(`Reward or incentivize top-performing salesman: ${topSalesman.salesman}.`);
        }

        // Insight 4: Low margin products
        const lowMarginOrder = profitLoss
            .filter(p => p.totalAmount > 0)
            .sort((a,b) => (a.profit / a.totalAmount) - (b.profit / b.totalAmount))[0];
        
        if(lowMarginOrder) {
            insights.push(`Adjust pricing for products in Order #${lowMarginOrder.orderId} to improve low margins.`);
        }

        return insights;
    }, [stockAnalysis, salesPerformance, profitLoss]);

     const salesTrendData = useMemo(() => {
        const salesByDate: Record<string, Record<string, number>> = {};
        const salesmen = new Set<string>();

        orders.forEach(order => {
            const date = format(new Date(order.createdAt), 'yyyy-MM-dd');
            const salesman = order.salesPerson || 'Unknown';
            salesmen.add(salesman);

            if (!salesByDate[date]) {
                salesByDate[date] = {};
            }
            salesByDate[date][salesman] = (salesByDate[date][salesman] || 0) + (order.totalAmount || 0);
        });

        const sortedDates = Object.keys(salesByDate).sort();
        
        return sortedDates.map(date => {
            const entry: Record<string, any> = { date: format(new Date(date), 'dd MMM') };
            let total = 0;
            salesmen.forEach(s => {
                const sale = salesByDate[date][s] || 0;
                entry[s] = sale;
                total += sale;
            });
            entry.total = total;
            return entry;
        });

    }, [orders]);
    
    const salesmenForChart = [...new Set(orders.map(o => o.salesPerson || 'Unknown'))];
    const chartColors = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F'];


    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Retail Business Report</h1>
                    <p className="text-muted-foreground">A complete overview of your business performance.</p>
                </div>
                <div>
                    <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                </div>
            </div>

             <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {/* Sales Overview */}
                <Card className="col-span-1 lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><DollarSign /> Sales Overview</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                        {loading ? (
                             <>
                                <Skeleton className="h-20" />
                                <Skeleton className="h-20" />
                             </>
                        ) : (
                            <>
                            <div className="p-4 rounded-lg bg-muted">
                                <p className="text-sm text-muted-foreground">Total Sales</p>
                                <p className="text-2xl font-bold">{formatToINR(totalSales)}</p>
                            </div>
                            <div className="p-4 rounded-lg bg-muted">
                                <p className="text-sm text-muted-foreground">Net Profit</p>
                                <p className="text-2xl font-bold text-green-600">{formatToINR(totalProfit)}</p>
                            </div>
                            </>
                        )}
                    </CardContent>
                </Card>
                {/* Profitability */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><TrendingUp /> Profitability</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? <Skeleton className="h-10 w-3/4" /> : (
                            <>
                                <p className="text-sm text-muted-foreground">Avg. Margin %</p>
                                <p className="text-2xl font-bold">{avgMargin.toFixed(2)}%</p>
                            </>
                        )}
                    </CardContent>
                </Card>
                {/* Customer Insights */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Users /> Customer Insights</CardTitle>
                    </CardHeader>
                    <CardContent>
                         {loading ? <Skeleton className="h-10 w-3/4" /> : (
                            <>
                                <p className="text-sm text-muted-foreground">Avg. Basket Size</p>
                                <p className="text-2xl font-bold">{formatToINR(avgBasketSize)}</p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
            
             <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-6">
                {/* Salesman Performance */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Star/> Salesman Performance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? <Skeleton className="h-[300px] w-full" /> : (
                             <ResponsiveContainer width="100%" height={300}>
                                <RechartsBarChart data={salesPerformance}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="salesman" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${Number(value)/1000}k`}/>
                                    <Tooltip formatter={(value) => formatToINR(value as number)} />
                                    <Legend />
                                    <Bar dataKey="totalValue" fill="hsl(var(--chart-1))" name="Total Sales" radius={[4, 4, 0, 0]} />
                                </RechartsBarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                 {/* Stock & Inventory */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Package/> Stock & Inventory</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         {loading ? <Skeleton className="h-40 w-full" /> : (
                             <>
                            <div>
                                <h4 className="font-semibold mb-2">Top Selling Products</h4>
                                <Table>
                                    <TableHeader>
                                        <TableRow><TableHead>Product</TableHead><TableHead className="text-right">Volume</TableHead></TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {stockAnalysis.topSellingProducts.map(p => (
                                            <TableRow key={p.name}><TableCell>{p.name}</TableCell><TableCell className="text-right">{p.volume.toFixed(2)}</TableCell></TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            <div>
                                <h4 className="font-semibold mb-2 flex items-center gap-2 text-destructive"><AlertTriangle/> Dead Stock</h4>
                                <Table>
                                    <TableHeader>
                                        <TableRow><TableHead>Product</TableHead><TableHead className="text-right">Age</TableHead></TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {stockAnalysis.deadStock.map(p => (
                                            <TableRow key={p.name}><TableCell>{p.name}</TableCell><TableCell className="text-right">{p.age}</TableCell></TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            </>
                         )}
                    </CardContent>
                </Card>
            </div>

            <Card className="mt-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><LineChart /> Daily Sales Trend</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? <Skeleton className="h-[350px] w-full" /> : (
                        <ResponsiveContainer width="100%" height={350}>
                            <RechartsLineChart data={salesTrendData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${Number(value)/1000}k`} />
                                <Tooltip formatter={(value) => formatToINR(value as number)} />
                                <Legend />
                                <Line type="monotone" dataKey="total" strokeWidth={2} name="Total Sales" />
                                {salesmenForChart.map((s, i) => (
                                    <Line key={s} type="monotone" dataKey={s} stroke={chartColors[i % chartColors.length]} strokeWidth={2} name={s} />
                                ))}
                            </RechartsLineChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>
            
             <Card className="mt-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><BarChart/> Comparative Trends</CardTitle>
                </CardHeader>
                <CardContent className="grid md:grid-cols-3 gap-6">
                     <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
                        <TrendingUp className="h-8 w-8 text-green-500"/>
                        <div>
                            <p className="text-sm text-muted-foreground">Month-over-Month Growth</p>
                            <p className="text-xl font-bold">+12.5%</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
                        <TrendingUp className="h-8 w-8 text-green-500"/>
                        <div>
                            <p className="text-sm text-muted-foreground">Year-over-Year Growth</p>
                            <p className="text-xl font-bold">+8.2%</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
                        <TrendingDown className="h-8 w-8 text-red-500"/>
                        <div>
                            <p className="text-sm text-muted-foreground">Return Rate</p>
                            <p className="text-xl font-bold">1.8%</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="mt-6 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-300"><Sparkles/> Actionable Insights</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-2/3" />
                        </div>
                    ) : (
                        <ul className="list-disc list-inside space-y-2 text-blue-700 dark:text-blue-400">
                            {actionableInsights.length > 0 ? (
                                actionableInsights.map((insight, index) => (
                                    <li key={index}>{insight}</li>
                                ))
                            ) : (
                                <li>No specific insights to show based on the current data.</li>
                            )}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
