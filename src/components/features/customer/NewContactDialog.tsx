
"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info, PlusCircle } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Customer } from "@/lib/types";
import { addCustomerAction } from "@/app/dashboard/customers/actions";
import { Separator } from "@/components/ui/separator";


const contactSchema = z.object({
  name: z.string().min(1, "Name is required."),
  mobileNo: z.string().min(10, "Mobile number must be at least 10 digits.").max(15),
  email: z.string().email("Invalid email address.").optional().or(z.literal('')),
  salesSupport: z.string().optional(),
  landmark: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  addressPinCode: z.string().optional(),
  gstin: z.string().optional(),
  panNo: z.string().optional(),
  referenceName: z.string().optional(),
  sourceOfCustomer: z.string().optional(),
  pinCode: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactSchema>;

interface NewContactDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCustomer: Customer) => void;
}

const CustomFormLabel = ({ children, tooltip }: { children: React.ReactNode, tooltip?: string }) => (
    <FormLabel className="flex items-center gap-1">
        {children}
        {tooltip && <Info className="h-3 w-3 text-muted-foreground" />}
    </FormLabel>
)

export function NewContactDialog({ isOpen, onClose, onSuccess }: NewContactDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
        name: "",
        mobileNo: "",
        email: "",
        salesSupport: "",
        landmark: "",
        city: "",
        state: "",
        addressPinCode: "",
        gstin: "",
        panNo: "",
        referenceName: "",
        sourceOfCustomer: "",
        pinCode: "",
    }
  });

  async function onSubmit(data: ContactFormValues) {
    if (!user) {
        toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
        return;
    }
    setLoading(true);
    try {
        const result = await addCustomerAction({
            ...data,
            createdBy: user.name,
        });

        if (result.success && result.customer) {
            toast({ title: "Contact Created", description: `${data.name} has been added to your contacts.` });
            form.reset();
            onSuccess(result.customer);
        } else {
            toast({ variant: "destructive", title: "Error", description: result.message });
        }
    } catch (error) {
        console.error("Error creating contact:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not save the new contact." });
    } finally {
        setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add New Contact</DialogTitle>
        </DialogHeader>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                            <CustomFormLabel tooltip="Customer's full name">Name*</CustomFormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="mobileNo" render={({ field }) => (
                        <FormItem>
                            <CustomFormLabel tooltip="Customer's primary contact number">Mobile No*</CustomFormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email Id</FormLabel>
                            <FormControl><Input type="email" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="salesSupport" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-1">Architect / Sales Support <Button type="button" size="icon" variant="ghost" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="arch_1">Architect 1</SelectItem>
                                    <SelectItem value="sales_1">Sales Support 1</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                     )} />
                </div>
                
                <div className="space-y-4">
                    <h3 className="text-base font-semibold text-muted-foreground border-b pb-2">Address Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4">
                        <FormField control={form.control} name="landmark" render={({ field }) => (
                            <FormItem><CustomFormLabel tooltip="Nearby landmark">Landmark</CustomFormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="city" render={({ field }) => (
                            <FormItem><CustomFormLabel tooltip="City of residence">City</CustomFormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="state" render={({ field }) => (
                            <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="addressPinCode" render={({ field }) => (
                            <FormItem><CustomFormLabel tooltip="Full address including pin code">Address & Pin Code</CustomFormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="gstin" render={({ field }) => (
                            <FormItem><FormLabel>GSTIN</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="panNo" render={({ field }) => (
                            <FormItem><FormLabel>PAN No</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                         <FormField control={form.control} name="referenceName" render={({ field }) => (
                            <FormItem><CustomFormLabel tooltip="Name of the person who referred this customer">Reference Name</CustomFormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                         <FormField control={form.control} name="sourceOfCustomer" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center gap-1">Source Of Customer <Button type="button" size="icon" variant="ghost" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="website">Website</SelectItem>
                                        <SelectItem value="referral">Referral</SelectItem>
                                        <SelectItem value="walk-in">Walk-in</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                         )} />
                         <FormField control={form.control} name="pinCode" render={({ field }) => (
                            <FormItem><FormLabel>Pin Code</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                </div>

                 <DialogFooter className="pt-8">
                    <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                    <Button type="submit" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                    </Button>
                </DialogFooter>
            </form>
            </Form>
      </DialogContent>
    </Dialog>
  );
}
