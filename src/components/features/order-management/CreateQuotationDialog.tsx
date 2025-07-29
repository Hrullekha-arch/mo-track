
"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { doc, setDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { User, FabricDetail, FurnitureDetail, VasDetail } from "@/lib/types";
import { Loader2, PlusCircle, Trash2, CalendarIcon, Info, Calculator } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Combobox } from "@/components/ui/combobox";

// Placeholder options for comboboxes
const companyOptions = [{ value: "mo-design", label: "Mo Design" }];
const storeOptions = [{ value: "mo-gcr-branch", label: "MO GCR BRANCH" }];
const dealOptions = [{ value: "deal-1", label: "Deal 1" }, { value: "deal-2", label: "Deal 2" }];
const billingOptions = [{ value: "billing-1", label: "Billing 1" }];
const productCategoryOptions = [{ value: "fabric", label: "Fabric" }, { value: "furniture", label: "Furniture" }];
const collectionOptions = [{ value: "brand-a", label: "Brand A" }, { value: "brand-b", label: "Brand B" }];
const serialNoOptions = [{ value: "sn-1", label: "SN-1" }, { value: "sn-2", label: "SN-2" }];
const descriptionOptions = [{ value: "desc-1", label: "Description 1" }, { value: "desc-2", label: "Description 2" }];
const roomOptions = [{ value: "living-room", label: "Living Room" }, { value: "bed-room", label: "Bed Room" }];
const vasOptions = [{ value: "vas-1", label: "VAS 1" }, { value: "vas-2", label: "VAS 2" }];


const itemDetailSchema = z.object({
  productCategory: z.string().optional(),
  collectionBrand: z.string().min(1, "Collection/Brand is required"),
  serialNo: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  quantity: z.string().min(1, "Quantity is required"),
  rate: z.string().min(1, "Rate is required"),
  discountPercent: z.string().optional(),
  discountAmount: z.string().optional(),
  isValueDiscount: z.boolean().default(false),
  room: z.string().optional(),
  remark: z.string().optional(),
  info1: z.string().optional(),
  info2: z.string().optional(),
  stitchingType: z.enum(["in", "out"]).optional(),
  file: z.any().optional(),
  pushToMeasurement: z.boolean().default(false),
});

const vasDetailSchema = z.object({
    vasName: z.string().min(1, "VAS name is required"),
    rate: z.string().min(1, "Rate is required"),
    quantity: z.string().min(1, "Quantity is required"),
    room: z.string().optional(),
});

const formSchema = z.object({
  company: z.string().optional(),
  store: z.string().min(1, "Store is required"),
  date: z.date({ required_error: "Date is required." }),
  validTillDate: z.date().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  dealName: z.string().min(1, "Deal name is required"),
  discountPercent: z.string().optional(),
  applyTax: z.boolean().default(false),
  billingName: z.string().optional(),
  items: z.array(itemDetailSchema),
  vasDetails: z.array(vasDetailSchema).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateQuotationDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const AddItemsForm = ({ form }: { form: any }) => {
    const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

    return (
        <div className="space-y-4">
             <h3 className="text-lg font-semibold border-b pb-2">Add More Items</h3>
            {fields.map((field, index) => (
              <Card key={field.id} className="p-4 space-y-4 relative">
                 <Button type="button" variant="destructive" size="icon" className="absolute -top-3 -right-3 h-6 w-6" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <FormField control={form.control} name={`items.${index}.productCategory`} render={({ field }) => (<FormItem><FormLabel>Product Category</FormLabel><Combobox options={productCategoryOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.collectionBrand`} render={({ field }) => (<FormItem><FormLabel>Collection / Brand*</FormLabel><Combobox options={collectionOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.serialNo`} render={({ field }) => (<FormItem><FormLabel>Serial No</FormLabel><Combobox options={serialNoOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<FormItem><FormLabel>Description*</FormLabel><Combobox options={descriptionOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem><FormLabel>Quantity*</FormLabel><div className="flex items-center"><FormControl><Input {...field} /></FormControl><Button variant="ghost" size="icon" className="ml-1"><Calculator className="h-5 w-5"/></Button></div><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.rate`} render={({ field }) => (<FormItem><FormLabel>Rate* <Info className="inline h-3 w-3"/></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`items.${index}.discountPercent`} render={({ field }) => (<FormItem><FormLabel>Discount %</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="flex items-end gap-2"><FormField control={form.control} name={`items.${index}.discountAmount`} render={({ field }) => (<FormItem className="flex-grow"><FormLabel>Disc Amt</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name={`items.${index}.isValueDiscount`} render={({ field }) => (<FormItem className="flex flex-row items-end space-x-2 pb-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Value</FormLabel></FormItem>)} /></div>
                    <FormField control={form.control} name={`items.${index}.room`} render={({ field }) => (<FormItem><FormLabel>Room</FormLabel><Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                     <FormField control={form.control} name={`items.${index}.remark`} render={({ field }) => (<FormItem><FormLabel>Remark</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                     <FormField control={form.control} name={`items.${index}.info1`} render={({ field }) => (<FormItem><FormLabel>Info 1</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                     <FormField control={form.control} name={`items.${index}.info2`} render={({ field }) => (<FormItem><FormLabel>Info 2</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                     <FormField control={form.control} name={`items.${index}.stitchingType`} render={({ field }) => (<FormItem><FormLabel>Stitching Type</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex h-10 items-center space-x-4"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="in" /></FormControl><FormLabel className="font-normal">IN</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="out" /></FormControl><FormLabel className="font-normal">OUT</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>)} />
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                     <FormField control={form.control} name={`items.${index}.file`} render={({ field }) => (<FormItem><FormLabel>Upload file</FormLabel><FormControl><Input type="file" /></FormControl><FormMessage /></FormItem>)} />
                     <FormField control={form.control} name={`items.${index}.pushToMeasurement`} render={({ field }) => (<FormItem className="flex flex-row items-end space-x-2 pb-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel>Push to Measurement</FormLabel></FormItem>)} />
                </div>
              </Card>
            ))}
            <div className="flex gap-2">
                <Button type="button" variant="default" onClick={() => append({ collectionBrand: '', description: '', quantity: '', rate: '' })}>Add</Button>
                <Button type="button" variant="outline" onClick={() => form.reset({ ...form.getValues(), items: [] })}>Reset</Button>
            </div>
        </div>
    );
};
  
const VasForm = ({ form }: { form: any }) => {
    const { fields, append, remove } = useFieldArray({ control: form.control, name: "vasDetails" });
    return (
        <div className="space-y-4">
             <h3 className="text-lg font-semibold border-b pb-2">Add VAS Details (Value Added Services)</h3>
            {fields.map((field, index) => (
                <Card key={field.id} className="p-4 flex items-end gap-4">
                    <FormField control={form.control} name={`vasDetails.${index}.vasName`} render={({ field }) => (<FormItem className="flex-grow"><FormLabel>VAS*</FormLabel><Combobox options={vasOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`vasDetails.${index}.quantity`} render={({ field }) => (<FormItem><FormLabel>Quantity*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`vasDetails.${index}.rate`} render={({ field }) => (<FormItem><FormLabel>Rate*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`vasDetails.${index}.room`} render={({ field }) => (<FormItem className="flex-grow"><FormLabel>Room</FormLabel><Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                    <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                </Card>
            ))}
            <div className="flex gap-2">
                <Button type="button" variant="default" onClick={() => append({ vasName: '', quantity: '', rate: '' })}>Add</Button>
                <Button type="button" variant="outline" onClick={() => form.reset({ ...form.getValues(), vasDetails: [] })}>Reset</Button>
            </div>
        </div>
    );
};

export function CreateQuotationDialog({ isOpen, onClose }: CreateQuotationDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      store: "mo-gcr-branch",
      date: new Date(),
      items: [],
      vasDetails: [],
    },
  });

  async function onSubmit(values: FormValues) {
    if (!user) {
        toast({ variant: "destructive", title: "Not authenticated." });
        return;
    }
    setLoading(true);
    try {
        const purchaseRequestRef = doc(collection(db, 'purchaseRequests'));
        
        await setDoc(purchaseRequestRef, {
            ...values,
            id: purchaseRequestRef.id,
            dealId: values.dealName, // Assuming dealName is the dealId
            promiseDeliveryDate: values.validTillDate?.toISOString() || new Date().toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: {
                id: user.id,
                name: user.name,
            },
            milestones: [],
            status: 'pending',
            vendorType: 'undecided'
        });

      toast({ title: "Quotation Created", description: "The new purchase request has been created." });
      form.reset();
      onClose();
    } catch (error) {
      console.error("Error creating purchase request: ", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to create the quotation." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl">
        <DialogHeader>
          <DialogTitle>Create Quotation</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4 max-h-[85vh] overflow-y-auto pr-4">
            
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                 <FormField control={form.control} name="company" render={({ field }) => (<FormItem><FormLabel>Company</FormLabel><Combobox options={companyOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="store" render={({ field }) => (<FormItem><FormLabel>Store*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="date" render={({ field }) => (<FormItem><FormLabel>Date*</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="validTillDate" render={({ field }) => (<FormItem><FormLabel>Valid Till Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="customerName" render={({ field }) => (<FormItem><FormLabel>Customer Name*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="dealName" render={({ field }) => (<FormItem><FormLabel>Deal Name*</FormLabel><Combobox options={dealOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                <FormField control={form.control} name="discountPercent" render={({ field }) => (<FormItem><FormLabel>Discount(%)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="applyTax" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-2 pt-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel>Apply Tax</FormLabel></FormItem>)} />
                <FormField control={form.control} name="billingName" render={({ field }) => (<FormItem className="col-span-2"><FormLabel>Billing Name <Button variant="link" type="button" className="p-0 h-auto ml-2">CRM Details</Button></FormLabel><Combobox options={billingOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /><FormMessage /></FormItem>)} />
            </div>
            
            <Separator />
            
            <AddItemsForm form={form} />
            
            <Separator />

            <VasForm form={form} />
            
            <DialogFooter>
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Quotation
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
