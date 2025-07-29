
"use client";

import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, PlusCircle, Trash2, ArrowLeft, Loader2, Calculator, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { collection, doc, setDoc, onSnapshot, query, where, getDocs, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { PurchaseRequest, User } from "@/lib/types";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

const itemSchema = z.object({
    productCategory: z.string().optional(),
    collectionBrand: z.string().optional(),
    serialNo: z.string().optional(),
    description: z.string().optional(),
    quantity: z.string().min(1, "Quantity is required."),
    rate: z.string().min(1, "Rate is required."),
    discountPercent: z.string().optional(),
    discAmt: z.string().optional(),
    value: z.boolean().optional(),
    room: z.string().optional(),
    remark: z.string().optional(),
    info1: z.string().optional(),
    info2: z.string().optional(),
    stitchingType: z.enum(["IN", "OUT"]).optional(),
    uploadFile: z.any().optional(),
    pushToMeasurement: z.boolean().optional(),
});

const vasSchema = z.object({
    vas: z.string().optional(),
    quantity: z.string().optional(),
    rate: z.string().optional(),
    room: z.string().optional(),
});

const formSchema = z.object({
  company: z.string().optional(),
  store: z.string().min(1, "Store is required."),
  date: z.date({ required_error: "Date is required." }),
  validTillDate: z.date().optional(),
  customerName: z.string().min(1, "Customer Name is required"),
  dealName: z.string().optional(),
  discount: z.string().optional(),
  applyTax: z.boolean().optional(),
  billingName: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item is required."),
  vasDetails: z.array(vasSchema).optional(),
});

type QuotationFormValues = z.infer<typeof formSchema>;

export default function CreateQuotationPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const form = useForm<QuotationFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            store: "MO GCR BRANCH",
            date: new Date(),
            items: [{ quantity: '', rate: '' }],
            vasDetails: [],
        },
    });

    const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
        control: form.control,
        name: "items",
    });

    const { fields: vasFields, append: appendVas, remove: removeVas } = useFieldArray({
        control: form.control,
        name: "vasDetails",
    });

    const onSubmit = (data: QuotationFormValues) => {
        console.log(data);
        toast({ title: "Quotation Submitted", description: "The quotation has been created successfully." });
        // Add Firestore submission logic here
    };

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
             <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-2xl">Create Quotation</CardTitle>
                                <Button variant="ghost" type="button" onClick={() => router.back()}>
                                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Top section */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                                <FormField control={form.control} name="company" render={({ field }) => ( <FormItem><FormLabel>Company</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="company1">Company 1</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                <FormField control={form.control} name="store" render={({ field }) => ( <FormItem><FormLabel>Store*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                <FormField control={form.control} name="date" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Date*</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                                <FormField control={form.control} name="validTillDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Valid Till Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                                <FormField control={form.control} name="customerName" render={({ field }) => ( <FormItem><FormLabel>Customer Name*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                <FormField control={form.control} name="dealName" render={({ field }) => ( <FormItem><FormLabel>Deal Name*</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="deal1">Deal 1</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                <FormField control={form.control} name="discount" render={({ field }) => ( <FormItem><FormLabel>Discount(%)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                <FormField control={form.control} name="applyTax" render={({ field }) => ( <FormItem className="flex flex-row items-end space-x-2 pb-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Apply Tax</FormLabel></div></FormItem> )} />
                                <FormField control={form.control} name="billingName" render={({ field }) => ( <FormItem><FormLabel>Billing Name</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="billing1">Billing Name 1</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                <div className="flex items-end pb-2">
                                     <Button variant="link" className="p-0 h-auto">CRM Details</Button>
                                </div>
                            </div>
                            
                            <Separator />

                            {/* Add More Items Section */}
                            <div>
                                <h3 className="text-lg font-semibold mb-4">Add More Items</h3>
                                <div className="space-y-4">
                                {itemFields.map((field, index) => (
                                    <Card key={field.id} className="p-4 bg-muted/50 space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <FormField control={form.control} name={`items.${index}.productCategory`} render={({ field }) => ( <FormItem><FormLabel>Product Category</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="cat1">Category 1</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name={`items.${index}.collectionBrand`} render={({ field }) => ( <FormItem><FormLabel>Collection / Brand*</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="brand1">Brand 1</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name={`items.${index}.serialNo`} render={({ field }) => ( <FormItem><FormLabel>Serial No</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="sn1">SN-001</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => ( <FormItem><FormLabel>Description*</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="desc1">Description 1</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                            <div className="flex items-end gap-1">
                                                <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => ( <FormItem className="flex-grow"><FormLabel>Quantity*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                                <Button size="icon" variant="outline" type="button"><Calculator className="h-4 w-4"/></Button>
                                            </div>
                                            <div className="flex items-end gap-1">
                                                <FormField control={form.control} name={`items.${index}.rate`} render={({ field }) => ( <FormItem className="flex-grow"><FormLabel>Rate*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                                <Button size="icon" variant="ghost" type="button" className="text-muted-foreground"><Info className="h-4 w-4"/></Button>
                                            </div>
                                            <FormField control={form.control} name={`items.${index}.discountPercent`} render={({ field }) => ( <FormItem><FormLabel>Discount %</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <div className="flex items-end gap-2">
                                                <FormField control={form.control} name={`items.${index}.discAmt`} render={({ field }) => ( <FormItem className="flex-grow"><FormLabel>Disc Amt</FormLabel><FormControl><Input {...field} disabled /></FormControl><FormMessage /></FormItem> )} />
                                                <FormField control={form.control} name={`items.${index}.value`} render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-2 pb-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-normal">Value</FormLabel></FormItem> )} />
                                            </div>
                                            <FormField control={form.control} name={`items.${index}.room`} render={({ field }) => ( <FormItem><FormLabel>Room</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="room1">Room 1</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <FormField control={form.control} name={`items.${index}.remark`} render={({ field }) => ( <FormItem className="lg:col-span-2"><FormLabel>Remark</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name={`items.${index}.info1`} render={({ field }) => ( <FormItem><FormLabel>Info 1</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name={`items.${index}.info2`} render={({ field }) => ( <FormItem><FormLabel>Info 2</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
                                            <FormField control={form.control} name={`items.${index}.stitchingType`} render={({ field }) => ( <FormItem><FormLabel>Stitching Type</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex items-center space-x-4"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="IN" /></FormControl><FormLabel className="font-normal">IN</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="OUT" /></FormControl><FormLabel className="font-normal">OUT</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name={`items.${index}.uploadFile`} render={({ field }) => ( <FormItem><FormLabel>Upload file</FormLabel><FormControl><Input type="file" /></FormControl><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name={`items.${index}.pushToMeasurement`} render={({ field }) => ( <FormItem className="flex flex-row items-end space-x-2 pb-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Push to Measurement</FormLabel></div></FormItem> )} />
                                        </div>
                                        <div className="flex justify-end">
                                            <Button type="button" variant="destructive" size="sm" onClick={() => removeItem(index)}>Remove Item</Button>
                                        </div>
                                    </Card>
                                ))}
                                <div className="flex gap-2">
                                     <Button type="button" onClick={() => appendItem({ quantity: '', rate: '' })}>Add</Button>
                                     <Button type="button" variant="outline" onClick={() => form.reset({ ...form.getValues(), items: [{ quantity: '', rate: '' }] })}>Reset</Button>
                                </div>
                               </div>
                            </div>

                            <Separator />
                            
                            {/* Add VAS Details Section */}
                            <div>
                                <h3 className="text-lg font-semibold mb-4">Add VAS Details (Value Added Services)</h3>
                                <div className="space-y-4">
                                {vasFields.map((field, index) => (
                                    <Card key={field.id} className="p-4 bg-muted/50">
                                         <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                                            <FormField control={form.control} name={`vasDetails.${index}.vas`} render={({ field }) => ( <FormItem className="md:col-span-2"><FormLabel>VAS*</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="vas1">VAS 1</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name={`vasDetails.${index}.quantity`} render={({ field }) => ( <FormItem><FormLabel>Quantity*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name={`vasDetails.${index}.rate`} render={({ field }) => ( <FormItem><FormLabel>Rate*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name={`vasDetails.${index}.room`} render={({ field }) => ( <FormItem><FormLabel>Room</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl><SelectContent><SelectItem value="room1">Room 1</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                            <Button type="button" variant="destructive" size="icon" onClick={() => removeVas(index)}><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    </Card>
                                ))}
                                <div className="flex gap-2">
                                     <Button type="button" onClick={() => appendVas({})}>Add</Button>
                                     <Button type="button" variant="outline" onClick={() => form.reset({ ...form.getValues(), vasDetails: [] })}>Reset</Button>
                                </div>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
                            <Button type="submit">Submit</Button>
                        </CardFooter>
                    </Card>
                </form>
            </Form>
        </div>
    );
}
