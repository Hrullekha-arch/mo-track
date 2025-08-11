
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Download, BarChart2, Wrench } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { User } from "@/lib/types";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function ReportsPage() {
  const [date, setDate] = useState<DateRange | undefined>();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const usersQuery = query(collection(db, "users"));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersData);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Report Generator</h1>
        <p className="text-muted-foreground">Generate and export various reports for sales, stock, and performance.</p>
      </div>

      <Card className="opacity-50 pointer-events-none">
        <CardHeader>
          <CardTitle>Generate a New Report</CardTitle>
          <CardDescription>Select the report type and filters to generate a report.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Report Type</label>
              <Select disabled>
                <SelectTrigger>
                  <SelectValue placeholder="Select a report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="order-summary">Order Summary</SelectItem>
                  <SelectItem value="sales-performance">Salesman Performance</SelectItem>
                  <SelectItem value="purchase-report">Purchase Report</SelectItem>
                  <SelectItem value="stock-ledger">Stock Ledger</SelectItem>
                   <SelectItem value="profit-loss" disabled>Profit & Loss (Coming Soon)</SelectItem>
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
                    disabled
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date?.from ? (
                      date.to ? (
                        <>
                          {format(date.from, "LLL dd, y")} -{" "}
                          {format(date.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(date.from, "LLL dd, y")
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
                    defaultMonth={date?.from}
                    selected={date}
                    onSelect={setDate}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Filter by User</label>
                <Select disabled>
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
            <Button variant="outline" disabled><BarChart2 className="mr-2 h-4 w-4" /> View Report</Button>
            <Button disabled><Download className="mr-2 h-4 w-4" /> Download CSV</Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 p-12 border-2 border-dashed rounded-lg text-center">
        <Wrench className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Feature Under Development</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The reporting feature is currently being built and will be available soon.
        </p>
      </div>
    </div>
  );
}
