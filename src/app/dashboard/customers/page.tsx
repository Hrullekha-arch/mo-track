
"use client";

import { useState } from 'react';
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, PlusCircle, Search, Trash2, Upload, Play } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const searchSchema = z.object({
  customerName: z.string().optional(),
  mobileNo: z.string().optional(),
  dealName: z.string().optional(),
  billingName: z.string().optional(),
  salesSupport: z.string().optional(),
});

type SearchFormValues = z.infer<typeof searchSchema>;

export default function CustomersPage() {
  const [loading, setLoading] = useState(false);

  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      customerName: "",
      mobileNo: "",
      dealName: "",
      billingName: "",
      salesSupport: "",
    }
  });

  const onSubmit = (data: SearchFormValues) => {
    console.log("Searching with:", data);
    // TODO: Implement search logic
  };

  const clearForm = () => {
    form.reset();
  };

  return (
    <TooltipProvider>
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <header className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Search Customer</h1>
            <div className="flex items-center gap-2">
                 <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    New Contact
                </Button>
                <Button variant="destructive" size="icon">
                    <Play className="h-4 w-4" />
                </Button>
            </div>
        </header>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="customerName" className="flex items-center gap-1">Name of Customer <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent><p>Search by full or partial customer name.</p></TooltipContent></Tooltip></Label>
                    <Input id="customerName" {...form.register("customerName")} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="mobileNo" className="flex items-center gap-1">Mobile No <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent><p>Search by customer's mobile number.</p></TooltipContent></Tooltip></Label>
                    <Input id="mobileNo" {...form.register("mobileNo")} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="dealName" className="flex items-center gap-1">Search by Deal Name <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent><p>Find customers associated with a specific deal.</p></TooltipContent></Tooltip></Label>
                    <Input id="dealName" {...form.register("dealName")} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="billingName" className="flex items-center gap-1">Billing Name <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent><p>Search by the name used for billing.</p></TooltipContent></Tooltip></Label>
                    <Input id="billingName" {...form.register("billingName")} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="salesSupport" className="flex items-center gap-1">Architect / Sales Support <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent><p>Filter by the assigned architect or sales support person.</p></TooltipContent></Tooltip></Label>
                    <Select onValueChange={(value) => form.setValue("salesSupport", value)}>
                        <SelectTrigger id="salesSupport">
                            <SelectValue placeholder="--SELECT--" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="arch_1">Architect 1</SelectItem>
                            <SelectItem value="sales_1">Sales Support 1</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit">
                    <Search className="mr-2 h-4 w-4" />
                    Search
                </Button>
                <Button type="button" variant="outline" onClick={clearForm}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear
                </Button>
                <Button type="button">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Placeholder for search results */}
        <div className="mt-8">
            <Card>
                <CardHeader>
                    <CardTitle>Search Results</CardTitle>
                    <CardDescription>Customers matching your criteria will appear here.</CardDescription>
                </CardHeader>
                <CardContent className="text-center text-muted-foreground py-12">
                    <p>Enter search criteria and click "Search" to see results.</p>
                </CardContent>
            </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
