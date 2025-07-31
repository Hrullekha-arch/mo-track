"use client";

import { useState } from 'react';
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, PlusCircle, Search, Trash2, Loader2 } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NewContactDialog } from '@/components/features/customer/NewContactDialog';
import { Customer } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { CustomerResultsTable } from '@/components/features/customer/CustomerResultsTable';
import { useRouter } from 'next/navigation';
import { searchCustomersAction } from './actions';

const searchSchema = z.object({
  customerName: z.string().optional(),
  mobileNo: z.string().optional(),
  salesSupport: z.string().optional(),
});

type SearchFormValues = z.infer<typeof searchSchema>;

export default function CustomersPage() {
  const [loading, setLoading] = useState(false);
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const router = useRouter();

  const { toast } = useToast();

  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      customerName: "",
      mobileNo: "",
      salesSupport: "all",
    }
  });

  const onSubmit = async (data: SearchFormValues) => {
    setLoading(true);
    setHasSearched(true);
    try {
      const results = await searchCustomersAction({
        customerName: data.customerName,
        mobileNo: data.mobileNo,
        salesSupport: data.salesSupport,
      });
      setSearchResults(results);
    } catch (error) {
      console.error("Error searching customers:", error);
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: "Could not fetch customer data.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNewContactSuccess = (newCustomer: Customer) => {
    setIsNewContactOpen(false);
    router.push(`/dashboard/customers/${newCustomer.id}`);
  };

  const clearForm = () => {
    form.reset();
    setSearchResults([]);
    setHasSearched(false);
  };

  return (
    <>
    <TooltipProvider>
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <header className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">
                Search Customer
            </h1>
            <div className="flex items-center gap-2">
                 <Button onClick={() => setIsNewContactOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    New Contact
                </Button>
            </div>
        </header>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="customerName" className="flex items-center gap-1">Name of Customer <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent><p>Search by full or partial customer name.</p></TooltipContent></Tooltip></Label>
                    <Input id="customerName" {...form.register("customerName")} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="mobileNo" className="flex items-center gap-1">Mobile No <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent><p>Search by customer's mobile number.</p></TooltipContent></Tooltip></Label>
                    <Input id="mobileNo" {...form.register("mobileNo")} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="salesSupport" className="flex items-center gap-1">Architect / Sales Support</Label>
                    <Select onValueChange={(value) => form.setValue("salesSupport", value)} defaultValue={form.getValues("salesSupport")}>
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
                <Button type="submit" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    Search
                </Button>
                <Button type="button" variant="outline" onClick={clearForm}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        
        <div className="mt-8">
            <CustomerResultsTable 
                customers={searchResults} 
                isLoading={loading} 
                hasSearched={hasSearched} 
            />
        </div>
      </div>
    </TooltipProvider>
    <NewContactDialog 
        isOpen={isNewContactOpen} 
        onClose={() => setIsNewContactOpen(false)}
        onSuccess={handleNewContactSuccess}
    />
    </>
  );
}
