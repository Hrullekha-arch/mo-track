"use client";

import { useState, useEffect, ReactNode, useMemo } from "react";
import { useForm, useFieldArray, useWatch, Control, UseFormReturn, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Customer, Deal, DealProduct, Quotation, VasDetail, Cpd, QuotationItem, InvoiceBatch } from "@/lib/types";
import { Loader2, PlusCircle, Trash2, CalendarIcon, Info, Calculator, Edit, Check, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { createQuotationAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { roomOptions, vasOptions, storeOptions } from "@/lib/constants";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";


export const itemDetailSchema = z.object({
  id: z.string().optional(),
  collectionBrand: z.string().min(1, "Collection/Brand is required"),
  serialNo: z.string().optional(),
  salesDescription: z.string().min(1, "Description is required"),
  quantity: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return 0;
      return typeof val === "string" ? parseFloat(val) : Number(val);
    },
    z.number().min(0, "Quantity must be non-negative")
  ),
  rate: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return 0;
      return typeof val === "string" ? parseFloat(val) : Number(val);
    },
    z.number().min(0, "Rate must be non-negative")
  ),
  originalMrp: z.number().optional(),
  subtotal: z.number().optional(),
  discountPercent: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return 0;
      return typeof val === "string" ? parseFloat(val) : Number(val);
    },
    z.number().min(0).max(100).optional()
  ),
  discount: z.number().optional(),
  taxableAmt: z.number().optional(),
  cgst: z.number().optional(),
  sgst: z.number().optional(),
  igst: z.number().optional(),
  room: z.string().optional(),
  noOfPcs: z.string().optional(),
  remark: z.string().optional(),
  stitchingType: z.string().optional(),
});

export const vasDetailSchema = z.object({
    vasName: z.string().min(1, "VAS name is required"),
    rate: z.string().min(1, "Rate is required"),
    quantity: z.string().min(1, "Quantity is required"),
    room: z.string().optional(),
    taxableAmt: z.number().optional(),
    cgst: z.number().optional(),
    sgst: z.number().optional(),
    igst: z.number().optional(),
});

export const createQuotationFormSchema = z.object({
  company: z.string().optional(),
  store: z.string().min(1, "Store is required"),
  date: z.date({ required_error: "Date is required." }),
  validTillDate: z.date().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  billingName: z.string().optional(),
  billingAddress: z.string().optional(),
  dealName: z.string().min(1, "Deal name is required"),
  selectedCpdId: z.string().optional(),
  items: z.array(itemDetailSchema),
  vasDetails: z.array(vasDetailSchema).optional(),
  sendEmail: z.boolean().default(false),
  sendSms: z.boolean().default(false),
  representativeId: z.string().optional(),
  cpdId: z.string().optional(),
});

export type FormValues = z.infer<typeof createQuotationFormSchema>;
export interface ItemDetailValues extends DealProduct {
    rate?: number;
    discountPercent?: number;
    productType?: string;
    subCategory?: string;
}


interface CreateQuotationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  deal: Deal;
  customer: Customer;
  initialItems: DealProduct[];
  initialVasDetails: VasDetail[];
  cpds: Cpd[];
  selectedCpdId?: string;
}

const descriptionOptions = [
    { value: 'Curtain', label: 'Curtain' },
    { value: 'Sofa', label: 'Sofa' },
    { value: 'Wallpaper', label: 'Wallpaper' },
    { value: 'Blinds', label: 'Blinds' },
];

const PreviouslySelectedItems = ({ control, setValue, getValues }: { control: Control<FormValues>, setValue: UseFormReturn<FormValues>['setValue'], getValues: UseFormReturn<FormValues>['getValues'] }) => {
    const { fields, remove } = useFieldArray({ control, name: "items" });

    const items = useWatch({ control, name: 'items' });
    console.log("Watched Items:", items);

    useEffect(() => {
        items.forEach((item, index) => {
            const quantity = Number(item.quantity) || 0;
            const rate = Number(item.rate) || 0;
            const subtotal = quantity * rate;
            const discountPercent = Number(item.discountPercent) || 0;
            const discount = subtotal * (discountPercent / 100);
            const taxableAmt = subtotal - discount;

            // Only update if different to avoid infinite loops
            const currentTaxableAmt = getValues(`items.${index}.taxableAmt`);
            if (currentTaxableAmt !== taxableAmt) {
                setValue(`items.${index}.taxableAmt`, taxableAmt, { shouldValidate: false });
            }
        });
    }, [items, setValue, getValues]);

    return (
        <div className="space-y-4">
             <h3 className="text-lg font-semibold border-b pb-2">Previously Selected Items</h3>
             <div className="border rounded-md">
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead className="w-32">Rate</TableHead>
                            <TableHead>Discount %</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Room</TableHead>
                            <TableHead className="w-10">Remark</TableHead>
                            <TableHead className="w-10">Details</TableHead>
                            <TableHead className="w-10">Delete</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {fields.map((field, index) => {
                           const currentItem = items[index];
                           const rateIsLower = currentItem && 
                                              typeof currentItem.originalMrp === 'number' && 
                                              typeof currentItem.rate === 'number' &&
                                              currentItem.rate < currentItem.originalMrp;
                           
                           return (
                               <TableRow key={field.id}>
                                 <TableCell>{index + 1}</TableCell>
                                 <TableCell>
                                    <p className="font-medium text-primary cursor-pointer hover:underline">
                                      {getValues(`items.${index}.collectionBrand`)}
                                    </p>
                                    <FormField 
                                      control={control} 
                                      name={`items.${index}.salesDescription`} 
                                      render={({ field }) => (
                                        <Combobox 
                                          options={descriptionOptions} 
                                          value={field.value} 
                                          onSelect={field.onChange} 
                                          placeholder="--SELECT--" 
                                        />
                                      )} 
                                    />
                                </TableCell>
                                <TableCell>
                                     <FormField 
                                       control={control} 
                                       name={`items.${index}.quantity`} 
                                       render={({ field }) => (
                                         <Input 
                                           type="number" 
                                           value={field.value || ""}
                                           onChange={(e) => {
                                             const val = e.target.value;
                                             field.onChange(val === "" ? 0 : parseFloat(val));
                                           }}
                                           onBlur={field.onBlur}
                                           className="w-24"
                                         />
                                       )} 
                                     />
                                </TableCell>
                                <TableCell>
                                     <FormField
                                        control={control}
                                        name={`items.${index}.rate`}
                                        render={({ field }) => (
                                            <Input
                                              type="number"
                                              step="0.01"
                                              value={field.value || ""}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                field.onChange(val === "" ? 0 : parseFloat(val));
                                              }}
                                              onBlur={field.onBlur}
                                              className={rateIsLower ? "border-red-500 ring-2 ring-red-200 w-28" : "w-28"}
                                              placeholder="Enter rate"
                                            />
                                        )}
                                      />
                                </TableCell>
                                <TableCell>
                                     <FormField 
                                       control={control} 
                                       name={`items.${index}.discountPercent`} 
                                       render={({ field }) => (
                                         <Input 
                                           type="number" 
                                           step="0.01"
                                           value={field.value || ""}
                                           onChange={(e) => {
                                             const val = e.target.value;
                                             field.onChange(val === "" ? 0 : parseFloat(val));
                                           }}
                                           onBlur={field.onBlur}
                                           className="w-20"
                                         />
                                       )} 
                                     />
                                </TableCell>
                                 <TableCell>
                                    <FormField 
                                      control={control} 
                                      name={`items.${index}.taxableAmt`} 
                                      render={({ field }) => (
                                        <Input 
                                          readOnly 
                                          disabled 
                                          value={Number(field.value || 0).toFixed(2)} 
                                          className="w-24 bg-gray-50"
                                        />
                                      )} 
                                    />
                                </TableCell>
                                 <TableCell>
                                    <FormField 
                                      control={control} 
                                      name={`items.${index}.room`} 
                                      render={({ field }) => (
                                        <Combobox 
                                          options={roomOptions} 
                                          value={field.value || ""} 
                                          onSelect={field.onChange} 
                                          placeholder="--SELECT--" 
                                        />
                                      )} 
                                    />
                                </TableCell>
                                <TableCell>
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-blue-500"
                                  >
                                    <Edit className="h-4 w-4"/>
                                  </Button>
                                </TableCell>
                                <TableCell>
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-blue-500"
                                  >
                                    <PlusCircle className="h-4 w-4"/>
                                  </Button>
                                </TableCell>
                                <TableCell>
                                  <Button 
                                    type="button" 
                                    variant="destructive" 
                                    size="icon" 
                                    onClick={() => remove(index)}
                                  >
                                    <Trash2 className="h-4 w-4"/>
                                  </Button>
                                </TableCell>
                               </TableRow>
                           )
                        })}
                    </TableBody>
                 </Table>
             </div>
        </div>
    );
};

const VasForm = ({ control }: { control: Control<FormValues> }) => {
    const { fields, append, remove } = useFieldArray({ control, name: "vasDetails" });
    return (
        <div className="space-y-4">
             <h3 className="text-lg font-semibold border-b pb-2">Add VAS Details (Value Added Services)</h3>
            {fields.map((field, index) => (
                <div key={field.id} className="p-4 border rounded-lg flex items-end gap-4">
                    <FormField control={control} name={`vasDetails.${index}.vasName`} render={({ field }) => (<FormItem className="flex-grow"><FormLabel>VAS*</FormLabel><Combobox options={vasOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                    <FormField control={control} name={`vasDetails.${index}.quantity`} render={({ field }) => (<FormItem><FormLabel>Quantity*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={control} name={`vasDetails.${index}.rate`} render={({ field }) => (<FormItem><FormLabel>Rate*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={control} name={`vasDetails.${index}.room`} render={({ field }) => (<FormItem className="flex-grow"><FormLabel>Room</FormLabel><Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                    <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                </div>
            ))}
            <div className="flex gap-2">
                <Button type="button" variant="default" onClick={() => append({ vasName: '', quantity: '1', rate: '0', room: '' })}>Add</Button>
                <Button type="button" variant="outline" onClick={() => remove()}>Reset</Button>
            </div>
        </div>
    );
};

const QuotationPreview = ({ form, onBack, onSubmit, loading }: { form: UseFormReturn<FormValues>, onBack: () => void, onSubmit: () => void, loading: boolean }) => {
    const values = form.getValues();

    const calculatedItems = useMemo(() => {
        return values.items.map(item => {
            const quantity = Number(item.quantity) || 0;
            const rate = Number(item.rate) || 0;
            const subtotal = quantity * rate;
            const discountPercent = Number(item.discountPercent) || 0;
            const discount = subtotal * (discountPercent / 100);
            const taxableAmt = subtotal - discount;
            const cgst = taxableAmt * 0.025;
            const sgst = taxableAmt * 0.025;
            const igst = 0;
            return { ...item, quantity, rate, discountPercent, subtotal, discount, taxableAmt, cgst, sgst, igst };
        });
    }, [values.items]);

    const vasWithCalculations = useMemo(() => {
        return (values.vasDetails || []).map(vas => {
            const quantity = Number(vas.quantity) || 0;
            const rate = Number(vas.rate) || 0;
            const taxableAmt = quantity * rate;
            const cgst = taxableAmt * 0.025;
            const sgst = taxableAmt * 0.025;
            const igst = 0;
            return { ...vas, taxableAmt, cgst, sgst, igst };
        });
    }, [values.vasDetails]);

    const totals = useMemo(() => {
        const itemTotals = calculatedItems.reduce((acc, item) => {
            acc.quantity += item.quantity;
            acc.subtotal += item.subtotal;
            acc.discount += item.discount;
            acc.taxableAmt += item.taxableAmt;
            acc.cgst += item.cgst;
            acc.sgst += item.sgst;
            acc.igst += item.igst;
            return acc;
        }, { quantity: 0, subtotal: 0, discount: 0, taxableAmt: 0, cgst: 0, sgst: 0, igst: 0 });

        const vasTotals = vasWithCalculations.reduce((acc, vas) => {
            acc.quantity += Number(vas.quantity);
            acc.taxableAmt += vas.taxableAmt;
            acc.cgst += vas.cgst;
            acc.sgst += vas.sgst;
            acc.igst += vas.igst;
            return acc;
        }, { quantity: 0, taxableAmt: 0, cgst: 0, sgst: 0, igst: 0 });

        const quotationAmount = itemTotals.taxableAmt + vasTotals.taxableAmt + itemTotals.cgst + vasTotals.cgst + itemTotals.sgst + vasTotals.sgst;

        return { itemTotals, vasTotals, quotationAmount };
    }, [calculatedItems, vasWithCalculations]);

    return (
        <FormProvider {...form}>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold">Confirm & Create Quotation</h2>
                    <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4"/> Back</Button>
                </div>

                <div className="grid grid-cols-4 gap-x-8 gap-y-4 text-sm">
                    <div className="space-y-1"><p className="text-muted-foreground">Company</p><p className="font-semibold">{values.company || 'MO DESIGNS PRIVATE LIMITED'}</p></div>
                    <div className="space-y-1"><p className="text-muted-foreground">Store</p><p className="font-semibold">{values.store}</p></div>
                    <div className="space-y-1"><p className="text-muted-foreground">Quotation Date</p><p className="font-semibold">{format(values.date, 'dd/MM/yyyy')}</p></div>
                    <div className="space-y-1"><p className="text-muted-foreground">Valid Till Date</p><p className="font-semibold">{values.validTillDate ? format(values.validTillDate, 'dd/MM/yyyy') : '-'}</p></div>
                    <div className="space-y-1"><p className="text-muted-foreground">Customer Name</p><p className="font-semibold">{values.customerName}</p></div>
                    <div className="space-y-1"><p className="text-muted-foreground">Billing Name</p><p className="font-semibold">{values.billingName || values.customerName}</p></div>
                    <div className="space-y-1 col-span-2"><p className="text-muted-foreground">Billing Address</p><p className="font-semibold">{values.billingAddress || '-'}</p></div>
                </div>

                {/* Item Details */}
                <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Item Details</h3>
                    <div className="border rounded-md overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Collection / Brand</TableHead>
                                    <TableHead>Serial No</TableHead>
                                    <TableHead>Quantity</TableHead>
                                    <TableHead>Rate</TableHead>
                                    <TableHead>Subtotal</TableHead>
                                    <TableHead>Discount</TableHead>
                                    <TableHead>Room</TableHead>
                                    <TableHead>No of Pcs</TableHead>
                                    <TableHead>Taxable Amt</TableHead>
                                    <TableHead>CGST</TableHead>
                                    <TableHead>SGST</TableHead>
                                    <TableHead>IGST</TableHead>
                                    <TableHead>Description</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {calculatedItems.map((item, index) => (
                                    <TableRow key={item.id || index}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>{item.collectionBrand}</TableCell>
                                        <TableCell>{item.serialNo}</TableCell>
                                        <TableCell>{item.quantity.toFixed(2)}</TableCell>
                                        <TableCell>{item.rate.toFixed(2)}</TableCell>
                                        <TableCell>{item.subtotal.toFixed(2)}</TableCell>
                                        <TableCell>{item.discount.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@{item.discountPercent.toFixed(2)}%</span></TableCell>
                                        <TableCell>{item.room}</TableCell>
                                        <TableCell>{item.noOfPcs}</TableCell>
                                        <TableCell>{item.taxableAmt.toFixed(2)}</TableCell>
                                        <TableCell>{item.cgst.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@2.50%</span></TableCell>
                                        <TableCell>{item.sgst.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@2.50%</span></TableCell>
                                        <TableCell>{item.igst.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@0.00%</span></TableCell>
                                        <TableCell>{item.salesDescription}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell colSpan={3} className="font-bold text-right">Total</TableCell>
                                    <TableCell className="font-bold">{totals.itemTotals.quantity.toFixed(2)}</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="font-bold">{totals.itemTotals.subtotal.toFixed(2)}</TableCell>
                                    <TableCell className="font-bold">{totals.itemTotals.discount.toFixed(2)}</TableCell>
                                    <TableCell colSpan={2}></TableCell>
                                    <TableCell className="font-bold">{totals.itemTotals.taxableAmt.toFixed(2)}</TableCell>
                                    <TableCell className="font-bold">{totals.itemTotals.cgst.toFixed(2)}</TableCell>
                                    <TableCell className="font-bold">{totals.itemTotals.sgst.toFixed(2)}</TableCell>
                                    <TableCell className="font-bold">{totals.itemTotals.igst.toFixed(2)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                </div>

                {/* VAS Details */}
                {vasWithCalculations.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="text-lg font-semibold">VAS Details (Value Added Services)</h3>
                        <div className="border rounded-md overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>Vas Name</TableHead>
                                        <TableHead>Quantity</TableHead>
                                        <TableHead>Rate</TableHead>
                                        <TableHead>Room</TableHead>
                                        <TableHead>Taxable Amt</TableHead>
                                        <TableHead>CGST</TableHead>
                                        <TableHead>SGST</TableHead>
                                        <TableHead>IGST</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {vasWithCalculations.map((vas, index) => (
                                        <TableRow key={`vas-${index}`}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell>{vas.vasName}</TableCell>
                                            <TableCell>{Number(vas.quantity).toFixed(2)}</TableCell>
                                            <TableCell>{Number(vas.rate).toFixed(2)}</TableCell>
                                            <TableCell>{vas.room || '-'}</TableCell>
                                            <TableCell>{vas.taxableAmt.toFixed(2)}</TableCell>
                                            <TableCell>{vas.cgst.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@2.5%</span></TableCell>
                                            <TableCell>{vas.sgst.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@2.5%</span></TableCell>
                                            <TableCell>{vas.igst.toFixed(2)}<br /><span className="text-xs text-muted-foreground">@0.00%</span></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={2} className="font-bold text-right">Total</TableCell>
                                        <TableCell className="font-bold">{totals.vasTotals.quantity.toFixed(2)}</TableCell>
                                        <TableCell colSpan={2}></TableCell>
                                        <TableCell className="font-bold">{totals.vasTotals.taxableAmt.toFixed(2)}</TableCell>
                                        <TableCell className="font-bold">{totals.vasTotals.cgst.toFixed(2)}</TableCell>
                                        <TableCell className="font-bold">{totals.vasTotals.sgst.toFixed(2)}</TableCell>
                                        <TableCell className="font-bold">{totals.vasTotals.sgst.toFixed(2)}</TableCell>
                                        <TableCell className="font-bold">{totals.vasTotals.igst.toFixed(2)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t">
                    <div className="flex items-center gap-8">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Quotation Amount</p>
                            <p className="font-bold text-2xl text-primary">₹{totals.quotationAmount.toFixed(2)}</p>
                        </div>
                        <FormField 
                          control={form.control} 
                          name="sendEmail" 
                          render={({ field }) => (
                            <FormItem className="flex items-center gap-2 space-y-0">
                              <FormControl>
                                <Checkbox 
                                  checked={field.value} 
                                  onCheckedChange={field.onChange} 
                                />
                              </FormControl>
                              <FormLabel className="cursor-pointer">Send Email</FormLabel>
                            </FormItem>
                          )} 
                        />
                        <FormField 
                          control={form.control} 
                          name="sendSms" 
                          render={({ field }) => (
                            <FormItem className="flex items-center gap-2 space-y-0">
                              <FormControl>
                                <Checkbox 
                                  checked={field.value} 
                                  onCheckedChange={field.onChange} 
                                />
                              </FormControl>
                              <FormLabel className="cursor-pointer">Send SMS</FormLabel>
                            </FormItem>
                          )} 
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={onBack}
                        >
                          Back to Edit
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button 
                                  type="button" 
                                  disabled={loading} 
                                  className="bg-cyan-600 hover:bg-cyan-700"
                                >
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Create Quotation
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Confirm Quotation Creation</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will create a quotation with status 'Pending Approval' for an amount of ₹{totals.quotationAmount.toFixed(2)}. Are you sure you want to continue?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={onSubmit}>
                                      Continue & Create
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            </div>
        </FormProvider>
    )
}

export function CreateQuotationDialog({
  isOpen,
  onOpenChange,
  onSuccess,
  deal,
  customer,
  initialItems,
  initialVasDetails,
  cpds,
  selectedCpdId,
}: CreateQuotationDialogProps) {

  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const [view, setView] = useState<'edit' | 'preview'>('edit');

  const form = useForm<FormValues>({
    resolver: zodResolver(createQuotationFormSchema),
    defaultValues: {
      store: user?.store || "MO GCR BRANCH",
      company: 'MO DESIGNS PRIVATE LIMITED',
      date: new Date(),
      items: [],
      vasDetails: [],
      selectedCpdId: selectedCpdId,
      sendEmail: false,
      sendSms: false,
    },
  });

  const handleCpdSelect = (cpdId: string) => {
    // Only set the ID for reference. Do not auto-populate.
    form.setValue("selectedCpdId", cpdId === "none" ? "No CPD ID" : cpdId);
  };

  useEffect(() => {
    if (isOpen) {
      if (deal && customer) {
        console.log("🔄 Initializing form with items:", initialItems);
        
        const itemsForForm: any[] = initialItems.map((item, idx) => {
          const description = `${item.collectionBrand || ''} - ${item.salesDescription || ''}`.trim();
          
          // Parse rate with multiple fallbacks
          let effectiveRate = 0;
          
          if (item.rate !== undefined && item.rate !== null) {
            const parsedRate = Number(item.rate);
            if (!isNaN(parsedRate)) {
              effectiveRate = parsedRate;
            }
          }
          
          // Fallback to MRP if rate is not available
          if (effectiveRate === 0 && item.mrp !== undefined && item.mrp !== null) {
            const parsedMrp = Number(item.mrp);
            if (!isNaN(parsedMrp)) {
              effectiveRate = parsedMrp;
            }
          }

          const originalMrp = item.mrp !== undefined && item.mrp !== null ? Number(item.mrp) : effectiveRate;
          
          console.log(`Item ${idx}:`, {
            collectionBrand: item.collectionBrand,
            rate: item.rate,
            mrp: item.mrp,
            effectiveRate,
            originalMrp
          });

          return {
            id: item.id || `item-${idx}`,
            collectionBrand: item.collectionBrand || '',
            serialNo: item.serialNo || '',
            salesDescription: description,
            quantity: Number(item.quantity) || 0,
            rate: effectiveRate,
            originalMrp: originalMrp,
            discountPercent: Number(item.discountPercent) || 0,
            subtotal: 0,
            discount: 0,
            taxableAmt: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            room: item.room || '',
            noOfPcs: item.noOfPcs || '1',
            remark: item.remarks || '',
            stitchingType: item.stitchingType || '',
          };
        });

        const vasForForm = (initialVasDetails || []).map((vas, idx) => ({
          vasName: vas.vasName,
          rate: String(vas.rate),
          quantity: String(vas.quantity),
          room: vas.room || '',
          taxableAmt: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
        }));

        console.log("📝 Form items prepared:", itemsForForm);

        // Reset form with prepared values
        form.reset({
          store: user?.store || "MO GCR BRANCH",
          company: 'MO DESIGNS PRIVATE LIMITED',
          date: new Date(),
          validTillDate: undefined,
          customerName: customer.name,
          billingName: customer.name,
          billingAddress: customer.addressPinCode,
          dealName: deal.dealName,
          selectedCpdId: selectedCpdId,
          items: itemsForForm,
          vasDetails: vasForForm,
          sendEmail: false,
          sendSms: false,
          representativeId: deal.representativeId,
        });

        console.log("✅ Form reset complete");
      }
      setView('edit'); 
    }
  }, [isOpen, deal, customer, initialItems, initialVasDetails, selectedCpdId, user]);


  async function handleCreateQuotation() {
    const values = form.getValues();
    if (!user) {
        toast({ variant: "destructive", title: "Not authenticated." });
        return;
    }
    setLoading(true);

    const totalAmount = values.items.reduce((sum, item) => {
        const quantity = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const subtotal = quantity * rate;
        const discount = subtotal * ((Number(item.discountPercent) || 0) / 100);
        const taxableAmt = subtotal - discount;
        const tax = taxableAmt * 0.05; // 2.5% CGST + 2.5% SGST
        return sum + taxableAmt + tax;
    }, 0);

    const vasTotal = (values.vasDetails || []).reduce((sum, vas) => {
        const taxableAmt = (Number(vas.rate) || 0) * (Number(vas.quantity) || 0);
        const tax = taxableAmt * 0.05;
        return sum + taxableAmt + tax;
    }, 0);

    try {
        const quotationResult = await createQuotationAction(
          customer.id, 
          deal.id, 
          values, 
          totalAmount + vasTotal
        );

        if (quotationResult.success) {
            toast({ 
              title: "✅ Quotation Created", 
              description: "The quotation has been sent for approval." 
            });
            form.reset();
            onSuccess();
            onOpenChange(false);
        } else {
            toast({ 
              variant: "destructive", 
              title: "Quotation Creation Failed", 
              description: quotationResult.message 
            });
        }
    } catch (error) {
      console.error("Error creating quotation: ", error);
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: "Failed to create the quotation." 
      });
    } finally {
      setLoading(false);
    }
  }

  const handleProceed = () => {
    form.trigger().then(isValid => {
      if(isValid) {
        const items = form.getValues('items');
        console.log("📋 Items before preview:", items);
        setView('preview');
      } else {
        toast({ 
          variant: 'destructive', 
          title: 'Validation Error', 
          description: 'Please fill in all required fields before proceeding.' 
        });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {view === 'edit' ? 'Create Quotation' : 'Preview Quotation'}
          </DialogTitle>
          <DialogDescription>
            {view === 'edit' 
              ? 'Fill in the quotation details and add items.'
              : 'Review the quotation details before creating.'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-y-auto pr-4">
        {view === 'edit' ? (
            <FormProvider {...form}>
            <form className="space-y-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <FormField 
                      control={form.control} 
                      name="store" 
                      render={({ field }) => (
                        <FormItem>
                            <FormLabel>Store*</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a store" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {storeOptions.map(opt => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} 
                    />
                    <FormField 
                      control={form.control} 
                      name="date" 
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date*</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button 
                                  variant={"outline"} 
                                  className="w-full justify-start text-left font-normal"
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar 
                                mode="single" 
                                selected={field.value} 
                                onSelect={field.onChange} 
                                initialFocus 
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )} 
                    />
                    <FormField 
                      control={form.control} 
                      name="validTillDate" 
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valid Till Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button 
                                  variant={"outline"} 
                                  className="w-full justify-start text-left font-normal"
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar 
                                mode="single" 
                                selected={field.value} 
                                onSelect={field.onChange} 
                                initialFocus 
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )} 
                    />
                    <FormField 
                      control={form.control} 
                      name="customerName" 
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Customer Name*</FormLabel>
                          <FormControl>
                            <Input {...field} readOnly />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} 
                    />
                    <FormField 
                      control={form.control} 
                      name="dealName" 
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Deal Name*</FormLabel>
                          <Combobox 
                            options={[{value: deal.dealName, label: deal.dealName}]} 
                            value={field.value} 
                            onSelect={field.onChange} 
                            placeholder="--SELECT--" 
                          />
                          <FormMessage />
                        </FormItem>
                      )} 
                    />
                     <FormField
                        control={form.control}
                        name="selectedCpdId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Select CPD (for reference)</FormLabel>
                                <Select 
                                  onValueChange={(value) => {
                                    field.onChange(value);
                                    handleCpdSelect(value);
                                  }} 
                                  value={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Load items from a CPD" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {cpds.map(cpd => (
                                          <SelectItem key={cpd.id} value={cpd.id}>
                                            {cpd.cpdId}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormDescription>
                                  Selecting a CPD is for reference only.
                                </FormDescription>
                            </FormItem>
                        )}
                    />
                </div>

                <Separator />

                <PreviouslySelectedItems 
                  control={form.control} 
                  setValue={form.setValue} 
                  getValues={form.getValues} 
                />

                <Separator />

                <VasForm control={form.control} />
            </form>
            </FormProvider>
        ) : (
             <QuotationPreview 
               form={form} 
               onBack={() => setView('edit')} 
               onSubmit={handleCreateQuotation} 
               loading={loading} 
             />
        )}
        </div>

        {view === 'edit' && (
             <DialogFooter className="border-t pt-4">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="button" 
                  onClick={handleProceed}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                    Proceed to Preview
                </Button>
            </DialogFooter>
        )}

      </DialogContent>
    </Dialog>
  );
}
