
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User, FabricDetail, FurnitureDetail, VasDetail } from "@/lib/types";
import { Loader2, PlusCircle, Trash2, CalendarIcon, Info } from "lucide-react";
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

const fabricDetailSchema = z.object({
  fabricName: z.string().min(1, "Fabric name is required"),
  quantity: z.string().min(1, "Quantity is required"),
  hasPanels: z.boolean().default(false),
  type: z.string().optional(),
  panels: z.string().optional(),
});

const furnitureDetailSchema = z.object({
  furnitureName: z.string().min(1, "Furniture name is required"),
  quantity: z.string().min(1, "Quantity is required"),
});

const vasDetailSchema = z.object({
    vasName: z.string().min(1, "VAS name is required"),
    rate: z.string().min(1, "Rate is required"),
    quantity: z.string().min(1, "Quantity is required"),
    total: z.string().min(1, "Total is required"),
});

const formSchema = z.object({
  dealId: z.string().min(1, "Deal ID is required"),
  promiseDeliveryDate: z.date({ required_error: "Promise delivery date is required." }),
  customerName: z.string().min(1, "Customer name is required"),
  salesman: z.string().min(1, "Salesman is required"),
  email: z.string().email("Invalid email").optional().or(z.literal('')),
  type: z.enum(["fabric", "furniture"], { required_error: "Type is required" }),
  workType: z.enum(["stitching", "production", "delivery"], { required_error: "Work type is required" }),
  fabricDetails: z.array(fabricDetailSchema).optional(),
  furnitureDetails: z.array(furnitureDetailSchema).optional(),
  vasDetails: z.array(vasDetailSchema).optional(),
});

interface CreateQuotationDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const FabricForm = ({ form }: { form: any }) => {
    const { fields, append, remove } = useFieldArray({ control: form.control, name: "fabricDetails" });
    return (
      <div className="space-y-4">
        {fields.map((field, index) => (
          <Card key={field.id} className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name={`fabricDetails.${index}.fabricName`} render={({ field }) => (<FormItem><FormLabel>Fabric Name*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name={`fabricDetails.${index}.quantity`} render={({ field }) => (<FormItem><FormLabel>Quantity*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name={`fabricDetails.${index}.hasPanels`} render={({ field }) => (<FormItem className="flex flex-row items-start space-x-3 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>With Panels</FormLabel></div></FormItem>)} />
            {form.watch(`fabricDetails.${index}.hasPanels`) && (
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name={`fabricDetails.${index}.type`} render={({ field }) => (<FormItem><FormLabel>Type</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name={`fabricDetails.${index}.panels`} render={({ field }) => (<FormItem><FormLabel>Panels</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              </div>
            )}
            <Button type="button" variant="destructive" size="sm" onClick={() => remove(index)}>Remove Fabric</Button>
          </Card>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => append({ fabricName: '', quantity: '', hasPanels: false, type: '', panels: '' })}>Add Fabric Item</Button>
      </div>
    );
};
  
const FurnitureForm = ({ form }: { form: any }) => {
    const { fields, append, remove } = useFieldArray({ control: form.control, name: "furnitureDetails" });
    return (
        <div className="space-y-4">
        {fields.map((field, index) => (
            <Card key={field.id} className="p-4 flex items-end gap-4">
            <FormField control={form.control} name={`furnitureDetails.${index}.furnitureName`} render={({ field }) => (<FormItem className="flex-grow"><FormLabel>Furniture Name*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name={`furnitureDetails.${index}.quantity`} render={({ field }) => (<FormItem><FormLabel>Quantity*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
            </Card>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => append({ furnitureName: '', quantity: '' })}>Add Furniture Item</Button>
        </div>
    );
};

const VasForm = ({ form }: { form: any }) => {
    const { fields, append, remove } = useFieldArray({ control: form.control, name: "vasDetails" });
    return (
        <div className="space-y-4">
        {fields.map((field, index) => (
            <Card key={field.id} className="p-4 grid grid-cols-4 gap-4 items-end">
            <FormField control={form.control} name={`vasDetails.${index}.vasName`} render={({ field }) => (<FormItem><FormLabel>VAS Name*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name={`vasDetails.${index}.rate`} render={({ field }) => (<FormItem><FormLabel>Rate*</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name={`vasDetails.${index}.quantity`} render={({ field }) => (<FormItem><FormLabel>Quantity*</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <div className="flex items-end gap-2">
                <FormField control={form.control} name={`vasDetails.${index}.total`} render={({ field }) => (<FormItem className="flex-grow"><FormLabel>Total*</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            </Card>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => append({ vasName: '', rate: '', quantity: '', total: '' })}>Add VAS Details</Button>
        </div>
    );
};

export function CreateQuotationDialog({ isOpen, onClose }: CreateQuotationDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fabricDetails: [],
      furnitureDetails: [],
      vasDetails: [],
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
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
            promiseDeliveryDate: values.promiseDeliveryDate.toISOString(),
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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create Quotation</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4 max-h-[80vh] overflow-y-auto pr-4">
            <Card>
                <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <FormField control={form.control} name="dealId" render={({ field }) => (<FormItem><FormLabel>Deal ID*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="promiseDeliveryDate" render={({ field }) => (
                        <FormItem className="flex flex-col"><FormLabel>Promise Delivery Date*</FormLabel>
                        <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < new Date()} initialFocus /></PopoverContent>
                        </Popover><FormMessage /></FormItem>)}
                    />
                    <FormField control={form.control} name="customerName" render={({ field }) => (<FormItem><FormLabel>Customer Name*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="salesman" render={({ field }) => (<FormItem><FormLabel>Salesman*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </CardContent>
            </Card>

            <Tabs defaultValue="fabric" className="w-full">
                <TabsList><TabsTrigger value="fabric">Fabric</TabsTrigger><TabsTrigger value="furniture">Furniture</TabsTrigger></TabsList>
                <TabsContent value="fabric" className="mt-4"><FabricForm form={form} /></TabsContent>
                <TabsContent value="furniture" className="mt-4"><FurnitureForm form={form} /></TabsContent>
            </Tabs>
            
            <Card>
                <CardContent className="p-4">
                    <FormField control={form.control} name="workType" render={({ field }) => (
                        <FormItem className="space-y-3"><FormLabel>Work Type*</FormLabel>
                        <FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4">
                            <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="stitching" /></FormControl><FormLabel className="font-normal">Stitching</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="production" /></FormControl><FormLabel className="font-normal">Production</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="delivery" /></FormControl><FormLabel className="font-normal">Delivery</FormLabel></FormItem>
                        </RadioGroup></FormControl><FormMessage /></FormItem>)}
                    />
                </CardContent>
            </Card>

            <VasForm form={form} />
            
            <DialogFooter>
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Preview & Submit
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
