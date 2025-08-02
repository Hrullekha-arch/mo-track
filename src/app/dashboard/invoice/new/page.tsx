
"use client";

import { use, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useFieldArray, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, PlusCircle, Trash2, Loader2, Calculator, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { Quotation, Customer, Deal, DealProduct, Stock } from "@/lib/types";
import React, { useEffect, useState } from "react";
import { getCustomerById } from "@/app/dashboard/customers/actions";
import { getDealById, getQuotationsForDeal } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";

const productSchema = z.object({
  id: z.string().optional(),
  collectionBrand: z.string(),
  serialNo: z.string().optional(),
  quantity: z.number(),
  mrp: z.number(),
  discountPercent: z.number().optional(),
  quotationRate: z.number(),
  orderRate: z.number(),
  room: z.string().optional(),
  noOfPcs: z.number().optional(),
  amount: z.number(),
  description: z.string().optional(),
  remark: z.string().optional(),
});

const addProductSchema = z.object({
  productCategory: z.string().optional(),
  collectionBrand: z.string().optional(),
  serialNo: z.string().optional(),
  description: z.string().optional(),
  quantity: z.string().optional(),
  rate: z.string().optional(),
  discountPercent: z.string().optional(),
  discAmt: z.string().optional(),
  value: z.boolean().optional(),
  room: z.string().optional(),
  noOfPcs: z.string().optional(),
  remark: z.string().optional(),
  info1: z.string().optional(),
  info2: z.string().optional(),
  stitchingType: z.enum(["in", "out"]).optional(),
  file: z.any().optional(),
});

const convertToOrderSchema = z.object({
  products: z.array(productSchema),
  addProduct: addProductSchema,
  orderRemark: z.string().optional(),
  billingName: z.string().optional(),
  addVas: z.boolean().optional(),
});

type ConvertToOrderFormValues = z.infer<typeof convertToOrderSchema>;

function ConvertToOrderContent() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId');
  const dealId = searchParams.get('dealId');
  const quotationId = searchParams.get('quotationId');

  const [loading, setLoading] = useState(true);
  const [quotation, setQuotation] = useState<Quotation | null>(null);

  const { toast } = useToast();
  
  // State for BCN search in "Add More Product"
  const [bcnOptions, setBcnOptions] = useState<{ value: string; label: string; stockItem: Stock }[]>([]);
  const [isSearchingBcn, setIsSearchingBcn] = useState(false);


  const form = useForm<ConvertToOrderFormValues>({
    resolver: zodResolver(convertToOrderSchema),
    defaultValues: {
      products: [],
      addProduct: {},
    }
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "products"
  });

  const productTotal = fields.reduce((acc, item, index) => {
    return {
      quantity: acc.quantity + (form.getValues(`products.${index}.quantity`) || 0),
      amount: acc.amount + (form.getValues(`products.${index}.amount`) || 0),
    };
  }, { quantity: 0, amount: 0 });

  useEffect(() => {
    const fetchData = async () => {
      if (!customerId || !dealId || !quotationId) {
        toast({ variant: "destructive", title: "Error", description: "Missing required information to create an order." });
        setLoading(false);
        return;
      }
      try {
        const quotationsData = await getQuotationsForDeal(customerId, dealId);
        const specificQuotation = quotationsData.find(q => q.id === quotationId);

        if (specificQuotation) {
          setQuotation(specificQuotation);
          const productsFromQuotation = specificQuotation.items.map(item => {
            const quotationRate = item.rate * (1 - (item.discountPercent || 0) / 100);
            return {
              collectionBrand: item.collectionBrand,
              serialNo: item.serialNo || '',
              quantity: item.quantity,
              mrp: item.rate,
              discountPercent: item.discountPercent || 0,
              quotationRate: quotationRate,
              orderRate: item.rate, // Set Order Rate to MRP
              room: item.room || '',
              noOfPcs: 1, // Placeholder
              amount: item.rate * item.quantity, // Calculate amount based on MRP (Order Rate)
              description: item.salesDescription,
              remark: item.remark || ''
            };
          });
          form.setValue("products", productsFromQuotation);
        } else {
          toast({ variant: "destructive", title: "Error", description: "Quotation not found." });
        }
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Failed to load quotation data." });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [customerId, dealId, quotationId, toast, form]);
  
  const handleBcnSearch = async (query: string) => {
    if (query.length < 2) { setBcnOptions([]); return; }
    setIsSearchingBcn(true);
    try {
        const results = await searchStockByBcn(query);
        setBcnOptions(results.map(stock => ({ value: stock.bcn || stock.id, label: stock.bcn || stock.id, stockItem: stock })));
    } catch (error) {
        console.error("Error searching BCN:", error);
        toast({ variant: 'destructive', title: 'Search failed' });
    } finally {
        setIsSearchingBcn(false);
    }
  };

  const handleBcnSelect = (value: string) => {
    const selectedOption = bcnOptions.find(opt => opt.value === value);
    if (selectedOption) {
        const stockItem = selectedOption.stockItem;
        form.setValue('addProduct.collectionBrand', stockItem.bcn || stockItem.id);
        form.setValue('addProduct.serialNo', stockItem.serialNo || '');
        form.setValue('addProduct.rate', (stockItem.mrp || 0).toString());
    }
  };

  const onSubmit = (data: ConvertToOrderFormValues) => {
    console.log(data);
    toast({ title: "Order Proceeding...", description: "Order has been processed for the next step." });
  };

  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold mb-4">Product</h2>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Delete</TableHead>
                    <TableHead>Collection / Brand</TableHead>
                    <TableHead>Serial No</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>MRP</TableHead>
                    <TableHead>Discount %</TableHead>
                    <TableHead>Quotation Rate</TableHead>
                    <TableHead>Order Rate</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>No Of Pcs</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Remark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                      <TableCell>{item.collectionBrand}</TableCell>
                      <TableCell>{item.serialNo}</TableCell>
                      <TableCell><Input type="number" {...form.register(`products.${index}.quantity`)} /></TableCell>
                      <TableCell>{item.mrp.toFixed(2)}</TableCell>
                      <TableCell><Input type="number" {...form.register(`products.${index}.discountPercent`)} /></TableCell>
                      <TableCell>{item.quotationRate.toFixed(2)}</TableCell>
                      <TableCell><Input type="number" {...form.register(`products.${index}.orderRate`)} /></TableCell>
                      <TableCell>{item.room}</TableCell>
                      <TableCell><Input type="number" {...form.register(`products.${index}.noOfPcs`)} /></TableCell>
                      <TableCell>{item.amount.toFixed(2)}</TableCell>
                      <TableCell><Input {...form.register(`products.${index}.description`)} /></TableCell>
                      <TableCell><Button type="button" variant="ghost" size="icon"><Edit className="h-4 w-4 text-blue-500" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-semibold text-right">Total</TableCell>
                    <TableCell className="font-semibold">{productTotal.quantity.toFixed(2)}</TableCell>
                    <TableCell colSpan={6}></TableCell>
                    <TableCell className="font-semibold">{productTotal.amount.toFixed(2)}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">Add More Product</h2>
            <div className="p-4 border rounded-lg space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <FormField control={form.control} name="addProduct.productCategory" render={({ field }) => (<FormItem><FormLabel>Product Category</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="fabric">Fabric</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="addProduct.collectionBrand" render={({ field }) => (<FormItem><FormLabel>Collection / Brand (BCN)*</FormLabel><Combobox options={bcnOptions} value={field.value} onSelect={handleBcnSelect} onSearch={handleBcnSearch} placeholder="Search BCN..." searchPlaceholder="Type to search BCN..." emptyPlaceholder={isSearchingBcn ? 'Searching...' : 'No BCN found.'} /><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="addProduct.serialNo" render={({ field }) => (<FormItem><FormLabel>Serial No*</FormLabel><FormControl><Input {...field} readOnly /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="addProduct.description" render={({ field }) => (<FormItem><FormLabel>Description</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="curtain">Curtain</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                     <FormField control={form.control} name="addProduct.quantity" render={({ field }) => (<FormItem><FormLabel>Quantity*</FormLabel><div className="flex items-center"><FormControl><Input {...field} /></FormControl><Button type="button" variant="ghost" size="icon"><Calculator className="h-5 w-5"/></Button></div><FormMessage /></FormItem>)} />
                     <FormField control={form.control} name="addProduct.rate" render={({ field }) => (<FormItem><FormLabel>Rate</FormLabel><FormControl><Input {...field} readOnly /></FormControl><FormMessage /></FormItem>)} />
                     <FormField control={form.control} name="addProduct.discountPercent" render={({ field }) => (<FormItem><FormLabel>Discount%</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                     <FormField control={form.control} name="addProduct.discAmt" render={({ field }) => (<FormItem><FormLabel>Disc Amt</FormLabel><div className="flex items-center gap-2"><FormControl><Input {...field} /></FormControl><FormField control={form.control} name="addProduct.value" render={({ field }) => (<FormItem className="flex items-center gap-1"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><Label className="font-normal">Value</Label></FormItem>)} /></div><FormMessage /></FormItem>)} />
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <FormField control={form.control} name="addProduct.noOfPcs" render={({ field }) => (<FormItem><FormLabel>No of Pcs</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="addProduct.remark" render={({ field }) => (<FormItem><FormLabel>Remark</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="addProduct.info1" render={({ field }) => (<FormItem><FormLabel>Info 1</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="addProduct.info2" render={({ field }) => (<FormItem><FormLabel>Info 2</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="addProduct.stitchingType" render={({ field }) => (<FormItem><FormLabel>Stitching Type</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex items-center gap-4"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="in" /></FormControl><FormLabel className="font-normal">IN</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="out" /></FormControl><FormLabel className="font-normal">OUT</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="addProduct.file" render={({ field }) => (<FormItem><FormLabel>Upload file</FormLabel><FormControl><Input type="file" /></FormControl><FormMessage /></FormItem>)} />
                 </div>
                 <div className="flex gap-2">
                    <Button type="button" className="bg-teal-600 hover:bg-teal-700">Add</Button>
                    <Button type="button" variant="outline">Clear</Button>
                 </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <FormField control={form.control} name="orderRemark" render={({ field }) => (<FormItem><FormLabel>Order Remark</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="billingName" render={({ field }) => (<FormItem><FormLabel>Billing Name</FormLabel><Select onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="placeholder">Placeholder</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="addVas" render={({ field }) => (<FormItem className="flex items-center gap-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><Label className="font-normal">Add VAS</Label></FormItem>)} />
          </div>

          <div className="flex gap-2">
            <Button type="submit">Proceed</Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}

export default function ConvertToOrderPage() {
    return (
        <Suspense fallback={<Skeleton className="h-screen w-full" />}>
            <ConvertToOrderContent />
        </Suspense>
    )
}
