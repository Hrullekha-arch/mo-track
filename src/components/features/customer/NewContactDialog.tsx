
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
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { addCustomer } from "@/app/dashboard/customers/actions";
import { Customer } from "@/lib/types";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required."),
  mobileNo: z.string().min(10, "Mobile number must be at least 10 digits.").max(15),
  email: z.string().email("Invalid email address.").optional().or(z.literal('')),
  salesSupport: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactSchema>;

interface NewContactDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCustomer: Customer) => void;
}

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
    }
  });

  async function onSubmit(data: ContactFormValues) {
    if (!user) {
        toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
        return;
    }
    setLoading(true);
    try {
        const result = await addCustomer({
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add New Contact</DialogTitle>
        </DialogHeader>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name*</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="mobileNo" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Mobile No*</FormLabel>
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
                            <FormLabel>Architect / Sales Support</FormLabel>
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
                 <DialogFooter className="pt-8">
                    <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                    <Button type="submit" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Contact
                    </Button>
                </DialogFooter>
            </form>
            </Form>
      </DialogContent>
    </Dialog>
  );
}
