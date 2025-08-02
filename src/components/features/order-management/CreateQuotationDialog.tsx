
"use client";

import { useState, useEffect, ReactNode, useMemo } from "react";
import { useForm, useFieldArray, useWatch, Control, UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Customer, Deal, DealProduct, Quotation, VasDetail } from "@/lib/types";
import { Loader2, PlusCircle, Trash2, CalendarIcon, Info, Calculator, Edit, Check, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as TableFooterComponent } from "@/components/ui/table";
import { createQuotationAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { PrintableQuotation } from "./PrintableQuotation";


// Placeholder options for comboboxes
const companyOptions = [{ value: "mo-design", label: "Mo Design" }];
const storeOptions = [{ value: "mo-gcr-branch", label: "MO GCR BRANCH" }];
const dealOptions = [{ value: "deal-1", label: "Deal 1" }, { value: "deal-2", label: "Deal 2" }];
const billingOptions = [{ value: "billing-1", label: "Billing 1" }];
const descriptionOptions = [{ value: "curtain", label: "Curtain" }, { value: "sofa-fabric", label: "Sofa Fabric" }];
const roomOptions = [{ value: "living-room", label: "Living Room" }, { value: "bed-room", label: "Bed Room" }];
const vasOptions = [{ value: "stitching", label: "Stitching" }, { value: "installation", label: "Installation" }];


const itemDetailSchema = z.object({
  id: z.string().optional(),
  collectionBrand: z.string().min(1, "Collection/Brand is required"),
  serialNo: z.string().optional(),
  salesDescription: z.string().min(1, "Description is required"),
  quantity: z.preprocess(
    (val) => (typeof val === "string" ? parseFloat(val) : val),
    z.number().min(0, "Quantity must be non-negative")
  ),
  rate: z.preprocess(
    (val) => (typeof val === "string" ? parseFloat(val) : val),
    z.number().min(0, "Rate must be non-negative")
  ),
  discountPercent: z.preprocess(
    (val) => (val === '' ? 0 : typeof val === "string" ? parseFloat(val) : val),
    z.number().min(0).max(100).optional()
  ),
  amount: z.number().optional(),
  room: z.string().optional(),
  remark: z.string().optional(),
});

const vasDetailSchema = z.object({
    vasName: z.string().min(1, "VAS name is required"),
    rate: z.string().min(1, "Rate is required"),
    quantity: z.string().min(1, "Quantity is required"),
    room: z.string().optional(),
});

const formSchema = z.object({
  store: z.string().min(1, "Store is required"),
  date: z.date({ required_error: "Date is required." }),
  validTillDate: z.date().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  dealName: z.string().min(1, "Deal name is required"),
  items: z.array(itemDetailSchema),
  vasDetails: z.array(vasDetailSchema).optional(),
});

export type FormValues = z.infer<typeof formSchema>;
interface ItemDetailValues extends DealProduct {
    rate?: number;
}


interface CreateQuotationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  deal: Deal;
  customer: Customer;
  initialItems: ItemDetailValues[];
}


const TotalsRow = ({ control }: { control: Control<FormValues> }) => {
    const items = useWatch({ control, name: 'items' });
    const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const totalAmount = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  
    return (
      <TableRow className="bg-muted font-semibold">
        <TableCell colSpan={3} className="text-right">Total</TableCell>
        <TableCell>{totalQuantity.toFixed(2)}</TableCell>
        <TableCell></TableCell>
        <TableCell></TableCell>
        <TableCell>{totalAmount.toFixed(2)}</TableCell>
        <TableCell colSpan={4}></TableCell>
      </TableRow>
    );
};


const PreviouslySelectedItems = ({ control, setValue, getValues }: { control: Control<FormValues>, setValue: UseFormReturn<FormValues>['setValue'], getValues: UseFormReturn<FormValues>['getValues'] }) => {
    const { fields, remove } = useFieldArray({ control, name: "items" });
    
    const items = useWatch({ control, name: 'items' });

    useEffect(() => {
        items.forEach((item, index) => {
            const quantity = Number(item.quantity) || 0;
            const rate = Number(item.rate) || 0;
            const discount = Number(item.discountPercent) || 0;
            const newAmount = quantity * rate * (1 - discount / 100);
            
            if (newAmount !== getValues(`items.${index}.amount`)) {
                setValue(`items.${index}.amount`, newAmount, { shouldValidate: true });
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
                            <TableHead>Rate</TableHead>
                            <TableHead>Discount %</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Room</TableHead>
                            <TableHead className="w-10">Remark</TableHead>
                            <TableHead className="w-10">Details</TableHead>
                            <TableHead className="w-10">Delete</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {fields.map((field, index) => (
                           <TableRow key={field.id}>
                             <TableCell>{index + 1}</TableCell>
                             <TableCell>
                                <p className="font-medium text-primary cursor-pointer hover:underline">{getValues(`items.${index}.collectionBrand`)}</p>
                                <FormField control={control} name={`items.${index}.salesDescription`} render={({ field }) => (
                                    <Combobox options={descriptionOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" />
                                )} />
                            </TableCell>
                            <TableCell>
                                 <FormField control={control} name={`items.${index}.quantity`} render={({ field }) => (<Input type="number" {...field} />)} />
                            </TableCell>
                            <TableCell>
                                 <FormField control={control} name={`items.${index}.rate`} render={({ field }) => (<Input type="number" {...field} />)} />
                            </TableCell>
                            <TableCell>
                                 <FormField control={control} name={`items.${index}.discountPercent`} render={({ field }) => (<Input type="number" {...field} />)} />
                            </TableCell>
                             <TableCell>
                                <FormField control={control} name={`items.${index}.amount`} render={({ field }) => (<Input readOnly disabled value={Number(field.value || 0).toFixed(2)} />)} />
                            </TableCell>
                             <TableCell>
                                <FormField control={control} name={`items.${index}.room`} render={({ field }) => (<Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" />)} />
                            </TableCell>
                            <TableCell><Button type="button" variant="ghost" size="icon" className="text-blue-500"><Edit className="h-4 w-4"/></Button></TableCell>
                            <TableCell><Button type="button" variant="ghost" size="icon" className="text-blue-500"><PlusCircle className="h-4 w-4"/></Button></TableCell>
                            <TableCell><Button type="button" variant="destructive" size="icon" className="text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4"/></Button></TableCell>
                           </TableRow>
                        ))}
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
                <Button type="button" variant="default" onClick={() => append({ vasName: '', quantity: '', rate: '' })}>Add</Button>
                <Button type="button" variant="outline" onClick={() => remove()}>Reset</Button>
            </div>
        </div>
    );
};

export function CreateQuotationDialog({ isOpen, onClose, onSuccess, deal, customer, initialItems }: CreateQuotationDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      store: "mo-gcr-branch",
      date: new Date(),
      items: [],
      vasDetails: [],
    },
  });
  
  const itemsWatch = useWatch({ control: form.control, name: 'items' });
  const vasWatch = useWatch({ control: form.control, name: 'vasDetails' });

  const totalAmount = useMemo(() => {
    const itemsTotal = itemsWatch.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const vasTotal = (vasWatch || []).reduce((sum, vas) => sum + ((Number(vas.rate) || 0) * (Number(vas.quantity) || 0)), 0);
    return itemsTotal + vasTotal;
  }, [itemsWatch, vasWatch]);


  useEffect(() => {
    if (isOpen) {
      if (deal && customer) {
        const itemsForForm: any[] = initialItems.map(item => {
          const description = `${item.collectionBrand || ''} - ${item.salesDescription || ''}`.trim();
          return {
              id: item.collectionBrand + item.serialNo, // Create a unique-ish ID
              collectionBrand: item.collectionBrand || '',
              serialNo: item.serialNo || '',
              salesDescription: description,
              quantity: parseFloat(item.quantity) || 0,
              rate: item.rate || 0,
              discountPercent: 0,
              amount: 0,
              room: item.room || '',
              remarks: item.remarks || '',
          };
        });

        form.reset({
          store: "mo-gcr-branch",
          date: new Date(),
          validTillDate: undefined,
          customerName: customer.name,
          dealName: deal.dealName,
          items: itemsForForm,
          vasDetails: [],
        });
      }
      setView('edit'); // Reset to edit view when dialog opens
    }
  }, [isOpen, deal, customer, initialItems, form]);


  async function createQuotation(values: FormValues) {
    if (!user) {
        toast({ variant: "destructive", title: "Not authenticated." });
        return;
    }
    setLoading(true);
    try {
        const result = await createQuotationAction(customer.id, deal.id, values, totalAmount);

        if (result.success) {
            toast({ title: "Quotation Created", description: "The new quotation has been saved." });
            form.reset();
            onSuccess();
            onClose();
        } else {
             toast({ variant: "destructive", title: "Error", description: result.message });
        }
    } catch (error) {
      console.error("Error creating purchase request: ", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to create the quotation." });
    } finally {
      setLoading(false);
    }
  }

  const handleProceed = () => {
    form.trigger().then(isValid => {
      if(isValid) {
        setView('preview');
      } else {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Please fill in all required fields before proceeding.' });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw]">
        <DialogHeader>
          <DialogTitle>
            {view === 'edit' ? 'Create Quotation' : 'Quotation Preview'}
          </DialogTitle>
        </DialogHeader>
        
        {view === 'edit' && (
            <Form {...form}>
            <form className="space-y-6 py-4 max-h-[85vh] overflow-y-auto pr-4">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <FormField control={form.control} name="store" render={({ field }) => (<FormItem><FormLabel>Store*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="date" render={({ field }) => (<FormItem><FormLabel>Date*</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="validTillDate" render={({ field }) => (<FormItem><FormLabel>Valid Till Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="customerName" render={({ field }) => (<FormItem><FormLabel>Customer Name*</FormLabel><FormControl><Input {...field} readOnly /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="dealName" render={({ field }) => (<FormItem><FormLabel>Deal Name*</FormLabel><Combobox options={[{value: deal.dealName, label: deal.dealName}]} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                </div>

                <Separator />
                
                <PreviouslySelectedItems control={form.control} setValue={form.setValue} getValues={form.getValues} />
                
                <Separator />

                <VasForm control={form.control} />
                
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="button" onClick={handleProceed}>
                        Proceed
                    </Button>
                </DialogFooter>
            </form>
            </Form>
        )}
        
        {view === 'preview' && (
            <div className="space-y-4 py-4 max-h-[85vh] overflow-y-auto pr-4">
                <PrintableQuotation values={form.getValues()} />
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => setView('edit')}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Edit
                    </Button>
                    <Button type="button" onClick={form.handleSubmit(createQuotation)} disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                        Confirm & Create Quotation
                    </Button>
                </DialogFooter>
            </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
