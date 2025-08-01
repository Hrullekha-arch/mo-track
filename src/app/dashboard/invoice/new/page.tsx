
"use client";

import { use, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, PlusCircle, Search, Trash2, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { getQuotationsForDeal } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { Quotation, Customer, Deal } from "@/lib/types";
import React, { useEffect, useState } from "react";
import { getCustomerById, getDealsForCustomer } from "@/app/dashboard/customers/actions";
import { getDealById } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const invoiceItemSchema = z.object({
  description: z.string(),
  hsnCode: z.string().optional(),
  quantity: z.number(),
  rate: z.number(),
  subtotal: z.number(),
  discountPercent: z.number(),
  discAmt: z.number(),
  taxableAmt: z.number(),
  cgst: z.number(),
  sgst: z.number(),
  igst: z.number(),
  totalTax: z.number(),
  amount: z.number(),
});

const invoiceSchema = z.object({
  contact: z.string(),
  company: z.string(),
  store: z.string(),
  invoiceDate: z.date(),
  billingName: z.string(),
  type: z.enum(['open', 'product-based']),
  items: z.array(invoiceItemSchema),
  roundOff: z.number().optional(),
  invoiceAmount: z.number(),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

function CreateInvoicePageContent() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId');
  const dealId = searchParams.get('dealId');
  const quotationId = searchParams.get('quotationId');
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);

  const { toast } = useToast();

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      type: 'open',
    }
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!customerId || !dealId || !quotationId) {
        toast({ variant: "destructive", title: "Error", description: "Missing required information to create an invoice." });
        setLoading(false);
        return;
      }
      try {
        const [customerData, dealData, quotationsData] = await Promise.all([
          getCustomerById(customerId),
          getDealById(customerId, dealId),
          getQuotationsForDeal(customerId, dealId)
        ]);

        setCustomer(customerData);
        setDeal(dealData);
        const specificQuotation = quotationsData.find(q => q.id === quotationId);
        setQuotation(specificQuotation || null);

        if (customerData && specificQuotation) {
          form.reset({
            contact: customerData.name,
            company: specificQuotation.company || 'MO DESIGNS PRIVATE LIMITED',
            store: specificQuotation.store,
            invoiceDate: new Date(),
            billingName: specificQuotation.billingName || '',
            type: 'open',
            items: specificQuotation.items.map(item => {
              const subtotal = item.quantity * item.rate;
              const discAmt = subtotal * ((item.discountPercent || 0) / 100);
              const taxableAmt = subtotal - discAmt;
              const totalTax = taxableAmt * 0.05; // 5% total tax
              return {
                description: item.salesDescription,
                hsnCode: '540752', // Placeholder
                quantity: item.quantity,
                rate: item.rate,
                subtotal: subtotal,
                discountPercent: item.discountPercent || 0,
                discAmt: discAmt,
                taxableAmt: taxableAmt,
                cgst: totalTax / 2,
                sgst: totalTax / 2,
                igst: 0,
                totalTax: totalTax,
                amount: taxableAmt + totalTax
              };
            }),
            invoiceAmount: specificQuotation.totalAmount
          });
        }
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Failed to load quotation data." });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [customerId, dealId, quotationId, toast, form]);

  const { fields, remove } = useFieldArray({
    control: form.control,
    name: "items"
  });

  const onSubmit = (data: InvoiceFormValues) => {
    console.log(data);
    toast({ title: "Invoice Created!", description: "The invoice has been successfully generated." });
  };
  
  if (loading) {
      return (
          <div className="p-8 space-y-4">
              <Skeleton className="h-8 w-1/4" />
              <div className="grid grid-cols-4 gap-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-48 w-full" />
          </div>
      )
  }

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create General Invoice
        </h1>
        <Button variant="outline" asChild>
            <Link href={`/dashboard/customers/${customerId}/${dealId}`}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Link>
        </Button>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <FormField control={form.control} name="contact" render={({ field }) => (
                  <FormItem><Label>Contact</Label><Input {...field} readOnly /></FormItem>
                )} />
                <FormField control={form.control} name="company" render={({ field }) => (
                  <FormItem><Label>Company</Label><Input {...field} readOnly /></FormItem>
                )} />
                <FormField control={form.control} name="store" render={({ field }) => (
                  <FormItem><Label>Store*</Label><Input {...field} readOnly /></FormItem>
                )} />
                <FormField control={form.control} name="invoiceDate" render={({ field }) => (
                  <FormItem className="flex flex-col"><Label>Invoice Date*</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent>
                    </Popover>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
                <FormField control={form.control} name="billingName" render={({ field }) => (
                  <FormItem><Label>Billing Name</Label>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl>
                      <SelectContent><SelectItem value="placeholder">--SELECT--</SelectItem></SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem><Label>Type*</Label>
                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex items-center space-x-4 pt-2">
                      <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="open" /></FormControl><Label className="font-normal">Open</Label></FormItem>
                      <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="product-based" /></FormControl><Label className="font-normal">Product Based</Label></FormItem>
                    </RadioGroup>
                  </FormItem>
                )} />
                <div className="flex gap-2">
                    <Button>Proceed</Button>
                    <Button variant="outline" type="button" onClick={() => form.reset()}>Clear</Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Delete</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>HSN Code</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Subtotal</TableHead>
                      <TableHead>Discount(%)</TableHead>
                      <TableHead>Disc. Amt</TableHead>
                      <TableHead>Taxable Amt</TableHead>
                      <TableHead>Tax</TableHead>
                      <TableHead>CGST</TableHead>
                      <TableHead>SGST</TableHead>
                      <TableHead>IGST</TableHead>
                      <TableHead>Total Tax</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell><Button variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>{item.hsnCode}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.rate.toFixed(2)}</TableCell>
                        <TableCell>{item.subtotal.toFixed(2)}</TableCell>
                        <TableCell>{item.discountPercent.toFixed(2)}</TableCell>
                        <TableCell>{item.discAmt.toFixed(2)}</TableCell>
                        <TableCell>{item.taxableAmt.toFixed(2)}</TableCell>
                        <TableCell>SALES@5%</TableCell>
                        <TableCell>{item.cgst.toFixed(2)}</TableCell>
                        <TableCell>{item.sgst.toFixed(2)}</TableCell>
                        <TableCell>{item.igst.toFixed(2)}</TableCell>
                        <TableCell>{item.totalTax.toFixed(2)}</TableCell>
                        <TableCell>{item.amount.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-6">
                <FormField control={form.control} name="roundOff" render={({ field }) => (
                  <FormItem><Label>Round Off</Label><Input type="number" {...field} /></FormItem>
                )} />
                <FormField control={form.control} name="invoiceAmount" render={({ field }) => (
                  <FormItem><Label>Invoice Amount*</Label><Input type="number" {...field} /></FormItem>
                )} />
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button type="submit">Create</Button>
            <Button variant="outline" type="button" asChild><Link href={`/dashboard/customers/${customerId}/${dealId}`}>Back</Link></Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function CreateInvoicePage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <CreateInvoicePageContent />
        </Suspense>
    )
}
