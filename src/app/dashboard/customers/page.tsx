"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Info,
  PlusCircle,
  Search,
  X,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NewContactDialog } from "@/components/features/customer/NewContactDialog";
import { Customer } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { CustomerResultsTable } from "@/components/features/customer/CustomerResultsTable";
import { useRouter } from "next/navigation";
import { searchCustomersAction } from "./actions";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  customerName: z.string().optional(),
  phone: z.string().optional(),
  quotationNo: z.string().optional(),
  orderNo: z.string().optional(),
  dealId: z.string().optional(),
  salesSupport: z.string().optional(),
});

type SearchFormValues = z.infer<typeof searchSchema>;

// Helper: tooltip-wrapped label
function FieldLabel({
  htmlFor,
  children,
  tooltip,
}: {
  htmlFor: string;
  children: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide"
    >
      {children}
      {tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 shrink-0 cursor-help text-muted-foreground/60 hover:text-muted-foreground transition-colors" />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[200px]">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
    </Label>
  );
}

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
      phone: "",
      quotationNo: "",
      orderNo: "",
      dealId: "",
      salesSupport: "all",
    },
  });

  const isDirty = Object.values(form.watch()).some(
    (v) => v && v !== "all" && v !== ""
  );

  const onSubmit = async (data: SearchFormValues) => {
    setLoading(true);
    setHasSearched(true);
    try {
      const results = await searchCustomersAction({
        customerName: data.customerName,
        phone: data.phone,
        salesSupport: data.salesSupport,
        quotationNo: data.quotationNo,
        orderNo: data.orderNo,
        dealId: data.dealId,
      });
      setSearchResults(results);
    } catch (error) {
      console.error("Error searching customers:", error);
      toast({
        variant: "destructive",
        title: "Search failed",
        description: "Could not fetch customer data. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNewContactSuccess = (newCustomer: Customer) => {
    setIsNewContactOpen(false);
    router.push(
      `/dashboard/customers/${newCustomer.customerId || newCustomer.id}`
    );
  };

  const clearForm = () => {
    form.reset();
    setSearchResults([]);
    setHasSearched(false);
  };

  return (
    <>
      <TooltipProvider>
        <div className="container mx-auto px-4 py-6 md:px-6 md:py-8 max-w-7xl space-y-6">
          {/* ── Page header ── */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Customers
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Search and manage customer records.
              </p>
            </div>
            <Button
              onClick={() => setIsNewContactOpen(true)}
              size="sm"
              className="gap-2 shrink-0"
            >
              <PlusCircle className="h-4 w-4" />
              New Contact
            </Button>
          </div>

          {/* ── Search card ── */}
          <Card className="border border-border/60 shadow-sm">
            {/* Card header strip */}
            <div className="flex items-center gap-2 px-6 py-4 border-b border-border/60">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Search Filters</span>
            </div>

            <CardContent className="pt-5 pb-6 px-6">
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-5"
              >
                {/* Row 1: Name + Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <FieldLabel
                      htmlFor="customerName"
                      tooltip="Search by full or partial customer name."
                    >
                      Customer Name
                    </FieldLabel>
                    <Input
                      id="customerName"
                      placeholder="e.g. John Doe"
                      className="h-9 text-sm"
                      {...form.register("customerName")}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabel
                      htmlFor="phone"
                      tooltip="Search by customer's phone number."
                    >
                      Phone
                    </FieldLabel>
                    <Input
                      id="phone"
                      placeholder="e.g. +91 98765 43210"
                      className="h-9 text-sm"
                      {...form.register("phone")}
                    />
                  </div>
                </div>

                {/* Row 2: Quotation No + Deal ID + Order No */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="quotationNo">Quotation No</FieldLabel>
                    <Input
                      id="quotationNo"
                      placeholder="e.g. QT-2024-001"
                      className="h-9 text-sm"
                      {...form.register("quotationNo")}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="dealId">Deal ID</FieldLabel>
                    <Input
                      id="dealId"
                      placeholder="e.g. DL-00123"
                      className="h-9 text-sm"
                      {...form.register("dealId")}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="orderNo">Order No</FieldLabel>
                    <Input
                      id="orderNo"
                      placeholder="e.g. ORD-2024-055"
                      className="h-9 text-sm"
                      {...form.register("orderNo")}
                    />
                  </div>
                </div>

                {/* Row 3: Sales Support */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="salesSupport">
                      Architect / Sales Support
                    </FieldLabel>
                    <Select
                      onValueChange={(value) =>
                        form.setValue("salesSupport", value)
                      }
                      defaultValue={form.getValues("salesSupport")}
                    >
                      <SelectTrigger id="salesSupport" className="h-9 text-sm">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="arch_1">Architect 1</SelectItem>
                        <SelectItem value="sales_1">Sales Support 1</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border/60" />

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={loading}
                    className="gap-2"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    {loading ? "Searching…" : "Search"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearForm}
                    disabled={!isDirty && !hasSearched}
                    className={cn(
                      "gap-2 text-muted-foreground hover:text-foreground transition-opacity",
                      !isDirty && !hasSearched ? "opacity-40" : "opacity-100"
                    )}
                  >
                    <X className="h-4 w-4" />
                    Clear
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* ── Results ── */}
          <CustomerResultsTable
            customers={searchResults}
            isLoading={loading}
            hasSearched={hasSearched}
          />
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