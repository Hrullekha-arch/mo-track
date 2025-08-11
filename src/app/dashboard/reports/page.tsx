
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Download, BarChart2, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { User, Order, PurchaseRequest, StockTransaction } from "@/lib/types";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getReportData, ReportData } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";

type ReportType = 'order-summary' | 'sales-performance' | 'purchase-report' | 'stock-ledger' | 'profit-loss';

const ReportTable = ({ data, type }: { data: ReportData, type: ReportType }) => {
    if (type === 'order-summary' && data.orders) {
        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Sales Person</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.orders.map(order => (
                        <TableRow key={order.id}>
                            <TableCell className="font-mono">{order.id}</TableCell>
                            <TableCell>{order.customerName}</TableCell>
                            <TableCell>{order.salesPerson}</TableCell>
                            <TableCell>₹{order.totalAmount?.toFixed(2) ?? '0.00'}</TableCell>
                            <TableCell>{order.milestones.slice().reverse().find(m => m.completed)?.name || "Order Received"}</TableCell>
                            <TableCell>{format(new Date(order.createdAt), "PP")}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        )
    }

    if (type === 'sales-performance' && data.salesPerformance) {
        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Salesman</TableHead>
                        <TableHead>Total Orders</TableHead>
                        <TableHead>Total Value</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.salesPerformance.map(item => (
                        <TableRow key={item.salesman}>
                            <TableCell>{item.salesman}</TableCell>
                            <TableCell>{item.totalOrders}</TableCell>
                            <TableCell>₹{item.totalValue.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        )
    }
    
    if (type === 'purchase-report' && data.purchaseReport) {
        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.purchaseReport.map(item => (
                        <TableRow key={item.id}>
                            <TableCell>{item.id}</TableCell>
                            <TableCell>{item.customerName}</TableCell>
                            <TableCell>{item.vendor || 'N/A'}</TableCell>
                            <TableCell><Badge>{item.status}</Badge></TableCell>
                            <TableCell>{format(new Date(item.createdAt), "PP")}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        )
    }

    if (type === 'stock-ledger' && data.stockLedger) {
        return (
             <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>BCN</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Quantity Change</TableHead>
                        <TableHead>Reference ID</TableHead>
                        <TableHead>User</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.stockLedger.map(tx => (
                        <TableRow key={tx.id}>
                            <TableCell>{format(new Date(tx.createdAt), "PP p")}</TableCell>
                            <TableCell className="font-mono">{tx.bcn}</TableCell>
                            <TableCell><Badge variant={tx.type === 'addition' ? 'default' : 'destructive'} className="capitalize">{tx.type}</Badge></TableCell>
                            <TableCell>{tx.quantityChange.toFixed(2)}</TableCell>
                            <TableCell>{tx.poNumber || tx.orderId || 'N/A'}</TableCell>
                            <TableCell>{tx.createdBy}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        )
    }

    return null;
}


export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('order-summary');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const usersQuery = query(collection(db, "users"));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersData);
    });
    return () => unsubscribe();
  }, []);

  const handleGenerateReport = async () => {
    setLoading(true);
    setReportData(null);
    try {
      const data = await getReportData({
        reportType,
        dateRange,
        userId: selectedUserId
      });
      setReportData(data);
       if (!data || Object.values(data).every(arr => arr.length === 0)) {
        toast({ title: "No Data", description: "No data found for the selected criteria." });
      }
    } catch (error) {
        toast({ variant: 'destructive', title: "Error", description: "Failed to generate report."})
    } finally {
        setLoading(false);
    }
  };

  const handleExport = () => {
    if (!reportData) {
      toast({ variant: 'destructive', title: 'No data to export' });
      return;
    }
    
    let dataToExport: any[] = [];
    let sheetName = "Report";

    if (reportType === 'order-summary' && reportData.orders) {
        sheetName = "Order Summary";
        dataToExport = reportData.orders.map(order => ({
            'Order ID': order.id,
            'Customer Name': order.customerName,
            'Sales Person': order.salesPerson,
            'Order Type': order.orderType,
            'Status': order.milestones.slice().reverse().find(m => m.completed)?.name || "Order Received",
            'Total Amount': order.totalAmount || 0,
            'Created At': format(new Date(order.createdAt), "yyyy-MM-dd HH:mm"),
        }));
    } else if (reportType === 'sales-performance' && reportData.salesPerformance) {
        sheetName = "Sales Performance";
        dataToExport = reportData.salesPerformance;
    } else if (reportType === 'purchase-report' && reportData.purchaseReport) {
        sheetName = "Purchase Report";
        dataToExport = reportData.purchaseReport.map(item => ({
             'PO Number': item.id,
             'Customer Name': item.customerName,
             'Vendor': item.vendor || 'N/A',
             'Status': item.status,
             'Date': format(new Date(item.createdAt), "yyyy-MM-dd"),
        }));
    } else if (reportType === 'stock-ledger' && reportData.stockLedger) {
        sheetName = "Stock Ledger";
        dataToExport = reportData.stockLedger.map(tx => ({
            'Date': format(new Date(tx.createdAt), "yyyy-MM-dd HH:mm"),
            'BCN': tx.bcn,
            'Type': tx.type,
            'Quantity Change': tx.quantityChange,
            'Reference ID': tx.poNumber || tx.orderId || 'N/A',
            'User': tx.createdBy
        }));
    }

    if (dataToExport.length === 0) {
      toast({ variant: 'destructive', title: 'No data to export' });
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `${sheetName.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: "Export Complete!" });
  };


  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Report Generator</h1>
        <p className="text-muted-foreground">Generate and export various reports for sales, stock, and performance.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate a New Report</CardTitle>
          <CardDescription>Select the report type and filters to generate a report.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Report Type</label>
              <Select value={reportType} onValueChange={(value) => setReportType(value as ReportType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="order-summary">Order Summary</SelectItem>
                  <SelectItem value="sales-performance">Salesman Performance</SelectItem>
                  <SelectItem value="purchase-report">Purchase Report</SelectItem>
                  <SelectItem value="stock-ledger">Stock Ledger</SelectItem>
                  <SelectItem value="profit-loss" disabled>Profit & Loss (soon)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} -{" "}
                          {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Filter by User</label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a user (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        {users.map(user => (
                            <SelectItem key={user.id} value={user.id}>{user.name} ({user.role})</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={handleGenerateReport} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart2 className="mr-2 h-4 w-4" />} 
                Generate Report
            </Button>
            <Button onClick={handleExport} disabled={!reportData}>
                <Download className="mr-2 h-4 w-4" /> Download CSV
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {loading && (
        <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {reportData && (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle>{reportType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Report</CardTitle>
                <CardDescription>
                    Showing results for the selected criteria.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ReportTable data={reportData} type={reportType} />
            </CardContent>
        </Card>
      )}

    </div>
  );
}
