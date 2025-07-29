
"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Info, Loader2, PlusCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

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
}

export function NewContactDialog({ isOpen, onClose }: NewContactDialogProps) {
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
        const newContactRef = doc(collection(db, "customers"));
        await setDoc(newContactRef, {
            ...data,
            id: newContactRef.id,
            createdAt: new Date().toISOString(),
            createdBy: user.id,
        });
        toast({ title: "Contact Created", description: `${data.name} has been added to your contacts.` });
        onClose();
        form.reset();
    } catch (error) {
        console.error("Error creating contact:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not save the new contact." });
    } finally {
        setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add New Contact</DialogTitle>
        </DialogHeader>
        <TooltipProvider>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                    <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-1">Name* <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent>Full name of the contact.</TooltipContent></Tooltip></FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="mobileNo" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-1">Mobile No* <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent>Contact's primary mobile number.</TooltipContent></Tooltip></FormLabel>
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
                            <FormLabel className="flex items-center gap-1">Architect / Sales Support <Button size="icon" variant="ghost" className="h-4 w-4 ml-1"><PlusCircle className="h-3 w-3"/></Button><Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 ml-1" /></TooltipTrigger><TooltipContent>Assigned architect or internal sales support.</TooltipContent></Tooltip></FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl>
                                <SelectContent><SelectItem value="arch_1">Architect 1</SelectItem></SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                     )} />
                </div>
                
                <div className="space-y-2">
                    <h4 className="text-md font-medium text-muted-foreground border-b pb-2">Address Details</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                     <FormField control={form.control} name="landmark" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-1">Landmark <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent>Nearby landmark for the address.</TooltipContent></Tooltip></FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="city" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-1">City <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent>City of the contact.</TooltipContent></Tooltip></FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="state" render={({ field }) => (
                        <FormItem>
                            <FormLabel>State</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="addressPinCode" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-1">Address & Pin Code <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent>Full address including Pin Code.</TooltipContent></Tooltip></FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="gstin" render={({ field }) => (
                        <FormItem>
                            <FormLabel>GSTIN</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="panNo" render={({ field }) => (
                        <FormItem>
                            <FormLabel>PAN No</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="referenceName" render={({ field }) => (
                        <FormItem>
                             <FormLabel className="flex items-center gap-1">Reference Name <Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent>Name of the person who referred this contact.</TooltipContent></Tooltip></FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="sourceOfCustomer" render={({ field }) => (
                        <FormItem>
                             <FormLabel className="flex items-center gap-1">Source Of Customer <Button size="icon" variant="ghost" className="h-4 w-4 ml-1"><PlusCircle className="h-3 w-3"/></Button><Tooltip><TooltipTrigger asChild><Info className="h-3 w-3 ml-1" /></TooltipTrigger><TooltipContent>How did this contact find us?</TooltipContent></Tooltip></FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl>
                                <SelectContent><SelectItem value="website">Website</SelectItem></SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                     )} />
                    <FormField control={form.control} name="pinCode" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Pin Code</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
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
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
