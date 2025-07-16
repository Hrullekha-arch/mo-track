"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Download, BarChart2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useState } from "react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { mockUsers } from "@/lib/mock-data";

export function ReportGenerator() {
  const [date, setDate] = useState<DateRange | undefined>();

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Report Generator</h1>
        <p className="text-muted-foreground">Generate and export various reports.</p>
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
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select a report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="order-summary">Order Summary</SelectItem>
                  <SelectItem value="installer-performance">Installer Performance</SelectItem>
                  <SelectItem value="sales-overview">Sales Overview</SelectItem>
                  <SelectItem value="milestone-duration">Milestone Duration Analysis</SelectItem>
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
                <Select>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a user (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        {mockUsers.map(user => (
                            <SelectItem key={user.id} value={user.id}>{user.name} ({user.role})</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline"><BarChart2 className="mr-2 h-4 w-4" /> View Report</Button>
            <Button><Download className="mr-2 h-4 w-4" /> Download CSV</Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 p-12 border-2 border-dashed rounded-lg text-center">
        <p className="text-muted-foreground">The generated report will be displayed here.</p>
      </div>
    </div>
  );
}
