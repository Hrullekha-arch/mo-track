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
import { User, Order } from "@/lib/types";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getReportData, ReportData } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from "xlsx";

type ReportType = 'order-summary' | 'sales-performance' | 'purchase-report' | 'stock-ledger';

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
       if (data.orders && data.orders.length === 0) {
        toast({ title: "No Data", description: "No data found for the selected criteria." });
      }
    } catch (error) {
        toast({ variant: 'destructive', title: "Error", description: "Failed to generate report."})
    } finally {
        setLoading(false);
    }
  };

  const handleExport = () => {
    if (!reportData || !reportData.orders || reportData.orders.length === 0) {
      toast({ variant: 'destructive', title: 'No data to export' });
      return;
    }

    const dataToExport = reportData.orders.map(order => ({
      'Order ID': order.id,
      'Customer Name': order.customerName,
      'Sales Person': order.salesPerson,
      'Order Type': order.orderType,
      'Status': order.milestones.slice().reverse().find(m => m.completed)?.name || "Order Received",
      'Total Amount': order.totalAmount || 0,
      'Created At': format(new Date(order.createdAt), "yyyy-MM-dd HH:mm"),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Order Summary");
    XLSX.writeFile(workbook, `order_summary_${new Date().toISOString().split('T')[0]}.xlsx`);
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
                  <SelectItem value="sales-performance" disabled>Salesman Performance (soon)</SelectItem>
                  <SelectItem value="purchase-report" disabled>Purchase Report (soon)</SelectItem>
                  <SelectItem value="stock-ledger" disabled>Stock Ledger (soon)</SelectItem>
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
            <Button onClick={handleExport} disabled={!reportData || !reportData.orders || reportData.orders.length === 0}>
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

      {reportData && reportData.orders && (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle>Order Summary Report</CardTitle>
                <CardDescription>
                    Showing {reportData.orders.length} orders.
                </CardDescription>
            </CardHeader>
            <CardContent>
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
                        {reportData.orders.map(order => (
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
            </CardContent>
        </Card>
      )}

    </div>
  );
}
