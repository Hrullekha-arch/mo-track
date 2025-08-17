
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, ShoppingCart, Users, TrendingUp, Package, Star, BarChart, AlertTriangle, ArrowRight, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const placeholderData = {
    salesByPerson: [
        { name: 'Sales Person 1', sales: 400000, transactions: 120 },
        { name: 'Sales Person 2', sales: 300000, transactions: 95 },
        { name: 'Sales Person 3', sales: 280000, transactions: 80 },
    ],
    topProducts: [
        { name: 'BCN-FAB-001', volume: 150, revenue: 120000 },
        { name: 'BCN-FAB-007', volume: 120, revenue: 95000 },
        { name: 'BCN-ROD-003', volume: 200, revenue: 45000 },
    ],
    deadStock: [
        { name: 'BCN-FAB-092', age: '180+ days' },
        { name: 'BCN-ACC-011', age: '150 days' },
    ]
};

export default function ReportsPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Retail Business Report</h1>
                    <p className="text-muted-foreground">A complete overview of your business performance.</p>
                </div>
                <div>
                    <DateRangePicker />
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {/* Sales Overview */}
                <Card className="col-span-1 lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><DollarSign /> Sales Overview</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                         <div className="p-4 rounded-lg bg-muted">
                            <p className="text-sm text-muted-foreground">Total Sales</p>
                            <p className="text-2xl font-bold">₹7,80,000</p>
                         </div>
                          <div className="p-4 rounded-lg bg-muted">
                            <p className="text-sm text-muted-foreground">Net Profit</p>
                            <p className="text-2xl font-bold text-green-600">₹1,25,000</p>
                         </div>
                    </CardContent>
                </Card>
                {/* Profitability */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><TrendingUp /> Profitability</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Avg. Margin %</p>
                        <p className="text-2xl font-bold">28.5%</p>
                    </CardContent>
                </Card>
                {/* Customer Insights */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Users /> Customer Insights</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Avg. Basket Size</p>
                        <p className="text-2xl font-bold">₹3,450</p>
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
                        <ResponsiveContainer width="100%" height={300}>
                            <RechartsBarChart data={placeholderData.salesByPerson}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${Number(value)/1000}k`}/>
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="sales" fill="#8884d8" name="Total Sales"/>
                            </RechartsBarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                 {/* Stock & Inventory */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Package/> Stock & Inventory</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <h4 className="font-semibold mb-2">Top Selling Products</h4>
                            <Table>
                                <TableHeader>
                                    <TableRow><TableHead>Product</TableHead><TableHead className="text-right">Volume</TableHead></TableRow>
                                </TableHeader>
                                <TableBody>
                                    {placeholderData.topProducts.map(p => (
                                        <TableRow key={p.name}><TableCell>{p.name}</TableCell><TableCell className="text-right">{p.volume}</TableCell></TableRow>
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
                                    {placeholderData.deadStock.map(p => (
                                        <TableRow key={p.name}><TableCell>{p.name}</TableCell><TableCell className="text-right">{p.age}</TableCell></TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
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

            <Card className="mt-6 bg-blue-50 border-blue-200">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-800">⚡ Actionable Insights</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="list-disc list-inside space-y-2 text-blue-700">
                        <li>Restock high-demand items like BCN-FAB-001 immediately.</li>
                        <li>Offer a 20% discount on Dead Stock items to clear inventory.</li>
                        <li>Reward Sales Person 1 with a bonus for top performance.</li>
                        <li>Analyze pricing for BCN-ROD-003 to improve its low profit margin.</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}

