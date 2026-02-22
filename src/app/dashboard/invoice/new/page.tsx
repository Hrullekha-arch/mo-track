

"use client";

import { use, Suspense } from "react";
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm, useFieldArray, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, PlusCircle, Trash2, Loader2, Calculator, Edit, Check, TriangleAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Quotation, Customer, Deal, DealProduct, Stock, QuotationItem, VasDetail, OrderType, Order } from "@/lib/types";
import React, { useEffect, useState, useMemo } from "react";
import { getCustomerById } from "@/app/dashboard/customers/actions";
import { getQuotationsForDeal, createDealOrderAction } from "./actions";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/context/AuthContext";
import { DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ConfirmOrderTypeDialog } from "@/components/features/order-management/ConfirmOrderTypeDialog";

const productSchema = z.object({
  id: z.string().optional(),
  collectionBrand: z.string(),
  serialNo: z.string().optional(),
  quantity: z.number(),
  mrp: z.number(),
  exclusiveRate: z.number().optional(),
  discountPercent: z.number().optional(),
  quotationRate: z.number(),
  orderRate: z.number(),
  room: z.string().optional(),
  noOfPcs: z.number().optional(),
  amount: z.number(),
  description: z.string().optional(),
  remark: z.string().optional(),
  gstPercent: z.number().optional(),
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

const vasSchema = z.object({
    vasName: z.string(),
    rate: z.string(),
    quantity: z.string(),
    gstPercent: z.union([z.number(), z.string()]).optional(),
});

const convertToOrderSchema = z.object({
  products: z.array(productSchema),
  vasDetails: z.array(vasSchema).optional(),
  addProduct: addProductSchema,
  orderRemark: z.string().optional(),
  billingName: z.string().optional(),
  addVas: z.boolean().optional(),
});

type ConvertToOrderFormValues = z.infer<typeof convertToOrderSchema>;

function ConvertToOrderContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const customerId = searchParams.get('customerId');
  const dealId = searchParams.get('dealId');
  const quotationId = searchParams.get('quotationId');
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [dataForConfirmation, setDataForConfirmation] = useState<Quotation | null>(null);

  const { toast } = useToast();
  
  const [bcnOptions, setBcnOptions] = useState<{ value: string; label: string; stockItem: Stock }[]>([]);
  const [isSearchingBcn, setIsSearchingBcn] = useState(false);


  const form = useForm<ConvertToOrderFormValues>({
    resolver: zodResolver(convertToOrderSchema),
    defaultValues: {
      products: [],
      vasDetails: [],
      addProduct: {
          productCategory: "",
          collectionBrand: "",
          serialNo: "",
          description: "",
          quantity: "",
          rate: "",
          discountPercent: "",
          discAmt: "",
          value: false,
          room: "",
          noOfPcs: "",
          remark: "",
          info1: "",
          info2: "",
          file: undefined,
      },
      orderRemark: "",
      billingName: "",
      addVas: false,
    }
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "products"
  });

  const { fields: vasFields } = useFieldArray({
      control: form.control,
      name: "vasDetails"
  });
  
  const watchedValues = form.watch();
  const shouldApplyTax = quotation?.applyTax !== false;

  const resolveTaxRate = (item: { gstPercent?: number | string }) => {
    if (!shouldApplyTax) return 0;
    const fromItem = Number((item as any)?.gstPercent ?? (item as any)?.taxPercent ?? (item as any)?.taxRate ?? (item as any)?.tax);
    if (Number.isFinite(fromItem)) return fromItem;
    return 5;
  };

  const resolveInclusiveRate = (item: { exclusiveRate?: number | string; rate?: number | string; mrp?: number | string; quotationRate?: number | string; gstPercent?: number | string }) => {
    const gstPercent = Number((item as any)?.gstPercent ?? 0);
    const exclusiveRate = Number((item as any)?.exclusiveRate);
    if (Number.isFinite(exclusiveRate) && exclusiveRate > 0) {
      return gstPercent > 0 ? exclusiveRate * (1 + gstPercent / 100) : exclusiveRate;
    }
    const fallback = Number((item as any)?.rate ?? (item as any)?.mrp ?? (item as any)?.quotationRate);
    return Number.isFinite(fallback) ? fallback : 0;
  };

  const round2 = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
  };

  const totals = useMemo(() => {
    const productTotals = (watchedValues.products || []).reduce((acc, item) => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.orderRate ?? resolveInclusiveRate(item)) || 0;
        const discountPercent = Number(item.discountPercent) || 0;
        const subtotal = qty * rate; // GST-inclusive
        const discountAmount = subtotal * (discountPercent / 100);
        const grossAfterDiscount = subtotal - discountAmount; // Still GST-inclusive
        const taxRate = resolveTaxRate(item);
        const taxableAmount = taxRate > 0 ? grossAfterDiscount / (1 + taxRate / 100) : grossAfterDiscount;
        const taxAmount = grossAfterDiscount - taxableAmount;
        const cgst = taxAmount / 2;
        const sgst = taxAmount / 2;

        acc.quantity += qty;
        acc.subtotal += subtotal;
        acc.discount += discountAmount;
        acc.taxable += taxableAmount;
        acc.cgst += cgst;
        acc.sgst += sgst;
        acc.total += grossAfterDiscount;
        return acc;
    }, { quantity: 0, subtotal: 0, discount: 0, taxable: 0, cgst: 0, sgst: 0, total: 0 });

    const vasTotals = (watchedValues.vasDetails || []).reduce((acc, item) => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const taxRate = resolveTaxRate(item);
        const taxableAmount = qty * rate; // GST-exclusive for VAS
        const taxAmount = taxableAmount * (taxRate / 100);
        const cgst = taxAmount / 2;
        const sgst = taxAmount / 2;

        acc.taxable += taxableAmount;
        acc.cgst += cgst;
        acc.sgst += sgst;
        acc.total += taxableAmount + taxAmount;
        return acc;
    }, { taxable: 0, cgst: 0, sgst: 0, total: 0 });

    const totalTaxable = productTotals.taxable + vasTotals.taxable;
    const cgst = productTotals.cgst + vasTotals.cgst;
    const sgst = productTotals.sgst + vasTotals.sgst;
    const grandTotal = productTotals.total + vasTotals.total;

    return { productTotals, vasTotals, grandTotal, cgst, sgst, totalTaxable };
  }, [watchedValues, shouldApplyTax]);


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
          const productsFromQuotation = specificQuotation.items.map((item: QuotationItem) => {
            const gstPercent = Number(item.gstPercent ?? 0);
            const discountPercent = Number(item.discountPercent) || 0;
            const inclusiveRate = resolveInclusiveRate({
              exclusiveRate: item.exclusiveRate,
              rate: item.rate,
              mrp: item.rate,
              quotationRate: item.rate,
              gstPercent,
            });
            const roundedInclusiveRate = round2(inclusiveRate);
            const exclusiveRate = Number.isFinite(Number(item.exclusiveRate))
              ? round2(Number(item.exclusiveRate))
              : round2(gstPercent > 0 ? inclusiveRate / (1 + gstPercent / 100) : inclusiveRate);
            const quotationRate = round2(roundedInclusiveRate * (1 - discountPercent / 100));
            return {
              id: item.id || undefined,
              collectionBrand: item.collectionBrand,
              serialNo: item.serialNo || '',
              quantity: item.quantity,
              mrp: roundedInclusiveRate,
              exclusiveRate,
              discountPercent,
              quotationRate: quotationRate,
              orderRate: roundedInclusiveRate, 
              room: item.room || '',
              noOfPcs: 1, 
              amount: round2(quotationRate * item.quantity), 
              description: item.salesDescription,
              remark: item.remark || '',
              gstPercent,
            };
          });
          form.setValue("products", productsFromQuotation);
          form.setValue("vasDetails", specificQuotation.vasDetails || []);
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

   const handleAddProduct = () => {
    const productData = form.getValues("addProduct");
    if (!productData.collectionBrand || !productData.quantity) {
      toast({ variant: 'destructive', title: 'Missing Information', description: 'Please provide at least a brand and quantity.' });
      return;
    }
   const rate = round2(parseFloat(productData.rate || '0'));
   const quantity = parseFloat(productData.quantity);
   const selectedStock = bcnOptions.find(option => option.value === productData.collectionBrand)?.stockItem;
   const gstPercent = Number(selectedStock?.tax ?? 0);
   const exclusiveRate = round2(gstPercent > 0 ? rate / (1 + gstPercent / 100) : rate);
   const discountPercent = parseFloat(productData.discountPercent || '0');
   const quotationRate = round2(rate * (1 - discountPercent / 100));
   const amount = round2(quotationRate * quantity);
    
    append({
      collectionBrand: productData.collectionBrand,
      serialNo: productData.serialNo,
      quantity: quantity,
      mrp: rate,
      exclusiveRate,
      discountPercent,
      quotationRate: quotationRate,
      orderRate: rate,
      room: productData.room,
      noOfPcs: parseInt(productData.noOfPcs || '1', 10),
      amount: amount,
      description: productData.description,
      remark: productData.remark,
      gstPercent: Number.isFinite(gstPercent) ? gstPercent : 0,
    });

    form.reset({ ...form.getValues(), addProduct: { collectionBrand: "", serialNo: "", description: "", quantity: "", rate: "", discountPercent: "", discAmt: "", value: false, room: "", noOfPcs: "", remark: "", info1: "", info2: "" } });
  };

const onSubmit = (data: ConvertToOrderFormValues) => {
  if (!quotation) return;

  const mappedItems: QuotationItem[] = data.products.map((p) => ({
    id: p.id ?? undefined,
    collectionBrand: p.collectionBrand ?? "",
    serialNo: p.serialNo ?? "",
    salesDescription: p.description ?? "",

    quantity: Number(p.quantity) || 0,
      rate: round2(Number(p.orderRate ?? p.mrp ?? p.quotationRate) || 0),
    discountPercent: Number(p.discountPercent) || 0,
    amount: round2((Number(p.quantity) || 0) * (Number(p.orderRate ?? p.mrp ?? p.quotationRate) || 0)),
    room: p.room ?? "",
    remark: p.remark ?? "",
    gstPercent: Number(p.gstPercent ?? 0),
  }));

  const updatedQuotationData: Quotation = {
    ...quotation,
    items: mappedItems,
    vasDetails: data.vasDetails,
    billingName: data.billingName,
    totalAmount: totals.grandTotal,
  };

  setDataForConfirmation(updatedQuotationData);
  setIsConfirmOpen(true);
};
function convertQuotationToTemporaryOrder(q: Quotation): Order {
  return {
    id: q.id ?? "",
    crmOrderNo: "",

    customerName: q.customerName ?? "",
    customerPhone: "",              // quotation doesn't have phone
    customerAddress: "",            // quotation doesn't have address
    salesPerson: "",                // quotation doesn't have salesperson
    storeName: q.store ?? "",

    orderType: "stitching",

    milestones: [],
    pmsMilestones: [],

    fabricDetails: [],
    furnitureDetails: [],
    vasDetails: q.vasDetails ?? [],

    totalAmount: q.totalAmount ?? 0,
    status: "Pending Approval",
    isAcknowledged: false,

    remarks: "",
    assignedTo: "",
    handledByCrm: "",

    createdAt: new Date().toISOString(),
    createdBy: q.createdBy? undefined : { id: "", name: "" },

    feedbackRating: undefined,
    feedbackRemarks: undefined,
    bypassedOtp: false,

    customerFeedbackRating: undefined,
    customerFeedbackRemarks: undefined,

    otp: "",
    completedAt: undefined,

    customerId: undefined,
    dealId: undefined,
    dealOrderDocId: undefined,
    representativeId: undefined,

    balanceFollowUp: false,
    paymentConfirmed: false,
    fullKittingTime: "",
    fullKittingTimeReupdated: false,

    items: (q.items || []).map(item => ({
      id: item.id ?? undefined,
      collectionBrand: item.collectionBrand ?? "",
      serialNo: item.serialNo ?? "",
      salesDescription: item.salesDescription ?? "",
      quantity: Number(item.quantity) || 0,
      rate: Number(item.rate) || 0,
      discountPercent: Number(item.discountPercent) || 0,
      amount: Number(item.amount) || 0,
      room: item.room ?? "",
      remark: item.remark ?? "",
      gstPercent: Number(item.gstPercent ?? 0),
    })),
  };
}



  const handleConfirmAndCreateOrder = async (order: Order, orderType: OrderType) => {
    if (!customerId || !dealId || !user || !dataForConfirmation) return;
    setIsSubmitting(true);
    try {
      const result = await createDealOrderAction(customerId, dealId, dataForConfirmation, { id: user.id, name: user.name }, orderType);

      if (result.success) {
        toast({ title: "Order Created!", description: "The sales order has been sent for approval." });
        router.push(`/dashboard/customers/${customerId}/${dealId}?tab=orders`);
      } else {
        toast({ variant: 'destructive', title: 'Creation Failed', description: result.message });
      }

    } catch(e) {
      toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred.' });
    } finally {
      setIsSubmitting(false);
      setIsConfirmOpen(false);
    }
  }

  


  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }if (quotation?.status !== "Approved") {
    return (
      <div className="flex justify-center items-center w-full h-screen">
        <Card className="border border-amber-800">
          <CardHeader >
            <div className="flex items-center justify-start gap-3">
              <TriangleAlert className=" h-8 w-8 text-red-500" />
              <CardTitle className="text-xl text-red-500">Cannot Convert Quotation !!</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-amber-800">The selected quotation is not approved and cannot be converted to an order. Please ensure the quotation is approved From Account Department.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
      <>
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
            <Button asChild variant="outline" size="icon">
                <Link href={`/dashboard/customers/${customerId}/${dealId}`}>
                    <ArrowLeft className="h-4 w-4" />
                </Link>
            </Button>
            <h1 className="text-2xl font-bold">Convert Quotation to Order</h1>
        </div>
      </div>
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
                  {fields.map((item, index) => {
                    const currentItem = watchedValues.products?.[index] ?? item;
                    const quantity = Number(currentItem.quantity) || 0;
                    const baseRate = resolveInclusiveRate({
                      exclusiveRate: (currentItem as any).exclusiveRate ?? (item as any).exclusiveRate,
                      mrp: currentItem.mrp ?? item.mrp,
                      quotationRate: currentItem.quotationRate,
                      gstPercent: currentItem.gstPercent ?? item.gstPercent,
                    });
                    const discountPercent = Number(currentItem.discountPercent) || 0;
                    const displayQuotationRate = baseRate * (1 - discountPercent / 100);
                    const displayAmount = quantity * displayQuotationRate;

                    return (
                      <TableRow key={item.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                        <TableCell>{item.collectionBrand}</TableCell>
                        <TableCell>{item.serialNo}</TableCell>
                        <TableCell><Input type="number" step="0.01" {...form.register(`products.${index}.quantity`)} /></TableCell>
                        <TableCell>{Number(item.mrp).toFixed(2)}</TableCell>
                        <TableCell><Input type="number" step="0.01" {...form.register(`products.${index}.discountPercent`)} /></TableCell>
                        <TableCell>{displayQuotationRate.toFixed(2)}</TableCell>
                        <TableCell><Input type="number" step="0.01" {...form.register(`products.${index}.orderRate`)} /></TableCell>
                        <TableCell>{item.room}</TableCell>
                        <TableCell><Input type="number" step="1" {...form.register(`products.${index}.noOfPcs`)} /></TableCell>
                        <TableCell>{displayAmount.toFixed(2)}</TableCell>
                        <TableCell><Input {...form.register(`products.${index}.description`)} /></TableCell>
                        <TableCell><Button type="button" variant="ghost" size="icon"><Edit className="h-4 w-4 text-blue-500" /></Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-semibold text-right">Total</TableCell>
                    <TableCell className="font-semibold">{totals.productTotals.quantity.toFixed(2)}</TableCell>
                    <TableCell colSpan={6}></TableCell>
                    <TableCell className="font-semibold">{totals.productTotals.total.toFixed(2)}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
          
           {vasFields.length > 0 && (
            <div>
                <h2 className="text-xl font-semibold mb-4">Value Added Services (VAS)</h2>
                 <div className="border rounded-lg overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Service Name</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead>Rate</TableHead>
                                <TableHead>Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {vasFields.map((item, index) => {
                                const amount = (Number(item.rate) || 0) * (Number(item.quantity) || 0);
                                return (
                                    <TableRow key={item.id}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>{item.vasName}</TableCell>
                                        <TableCell>{item.quantity}</TableCell>
                                        <TableCell>{item.rate}</TableCell>
                                        <TableCell>{amount.toFixed(2)}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TableCell colSpan={4} className="font-semibold text-right">VAS Total</TableCell>
                                <TableCell className="font-semibold">{totals.vasTotals.taxable.toFixed(2)}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                 </div>
            </div>
           )}

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
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <FormField control={form.control} name="addProduct.room" render={({ field }) => (<FormItem><FormLabel>Room</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="addProduct.stitchingType" render={({ field }) => (<FormItem><FormLabel>Stitching</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="in">In</SelectItem><SelectItem value="out">Out</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="addProduct.file" render={({ field }) => (<FormItem><FormLabel>Upload File</FormLabel><FormControl><Input type="file" onChange={(e) => field.onChange(e.target.files ? e.target.files[0] : null)} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                 <Button type="button" variant="outline" onClick={handleAddProduct}><PlusCircle className="mr-2 h-4 w-4" />Add Product</Button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField control={form.control} name="orderRemark" render={({ field }) => (<FormItem><FormLabel>Order Remark</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="billingName" render={({ field }) => (<FormItem><FormLabel>Billing Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
          </div>

          <FormField
            control={form.control}
            name="addVas"
            render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                        <FormLabel>Add VAS</FormLabel>
                    </div>
                </FormItem>
            )}
            />
            {form.watch('addVas') && <p>VAS form would go here.</p>}

            <Separator />
            <div className="flex justify-end">
                <div className="w-full max-w-sm space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Taxable Amount</span>
                        <span>₹{totals.totalTaxable.toFixed(2)}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">CGST</span>
                        <span>₹{totals.cgst.toFixed(2)}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">SGST</span>
                        <span>₹{totals.sgst.toFixed(2)}</span>
                    </div>
                     <div className="flex justify-between font-bold text-base">
                        <span>Grand Total</span>
                        <span>₹{totals.grandTotal.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            <DialogFooter className="pt-4">
                <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Convert to Order
                </Button>
            </DialogFooter>
        </form>
      </FormProvider>
    </div>
    {isConfirmOpen && dataForConfirmation && (
        <ConfirmOrderTypeDialog
          isOpen={isConfirmOpen}
          onClose={() => setIsConfirmOpen(false)}
          order={convertQuotationToTemporaryOrder(dataForConfirmation)}
          onConfirm={handleConfirmAndCreateOrder}
        />
      )}

    </>
  );
}

export default function NewInvoicePage() {
    return (
        <Suspense fallback={<Skeleton className="h-screen w-full" />}>
            <ConvertToOrderContent />
        </Suspense>
    )
}
