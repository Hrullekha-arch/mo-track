"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm, useFieldArray, FormProvider } from "react-hook-form";
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

// Re-using schemas and types from CreateQuotationDialog
import { itemDetailSchema, vasDetailSchema } from "./CreateQuotationDialog";
import type { FormValues } from "./CreateQuotationDialog";

const formSchema = z.object({
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
  representativeId: z.string().optional(), // Added field
  cpdId: z.string().optional(), // To link quotation with CPD
});

interface QuotationFormProps {
    deal: Deal;
    customer: Customer;
    cpds: Cpd[];
    onSuccess: () => void;
}

export function QuotationForm({ deal, customer, cpds, onSuccess }: QuotationFormProps) {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();
    const [view, setView] = useState<'edit' | 'preview'>('edit');

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            store: user?.store || "MO GCR BRANCH",
            company: 'MO DESIGNS PRIVATE LIMITED',
            date: new Date(),
            items: [],
            vasDetails: [],
            customerName: customer.name,
            billingName: customer.name,
            billingAddress: customer.addressPinCode,
            dealName: deal.dealName,
            representativeId: deal.representativeId,
        },
    });

    async function handleCreateQuotation() {
        const values = form.getValues();
        if (!user) {
            toast({ variant: "destructive", title: "Not authenticated." });
            return;
        }
        setLoading(true);

        const totalAmount = values.items.reduce((sum, item) => {
            const subtotal = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
            const discount = subtotal * ((Number(item.discountPercent) || 0) / 100);
            const taxableAmt = subtotal - discount;
            const tax = taxableAmt * 0.05;
            return sum + taxableAmt + tax;
        }, 0);

        const vasTotal = (values.vasDetails || []).reduce((sum, vas) => {
            const taxableAmt = (Number(vas.rate) || 0) * (Number(vas.quantity) || 0);
            const tax = taxableAmt * 0.05;
            return sum + taxableAmt + tax;
        }, 0);

        try {
            const quotationResult = await createQuotationAction(customer.id, deal.id, values, totalAmount + vasTotal);

            if (quotationResult.success) {
                toast({ title: "Quotation Created", description: "The quotation has been sent for approval." });
                form.reset();
                onSuccess();
            } else {
                toast({ variant: "destructive", title: "Quotation Creation Failed", description: quotationResult.message });
            }
        } catch (error) {
            console.error("Error creating quotation: ", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to create the quotation." });
        } finally {
            setLoading(false);
        }
    }

    const handleProceed = () => {
        form.trigger().then(isValid => {
          if (isValid) {
            setView('preview');
          } else {
            toast({ variant: 'destructive', title: 'Validation Error', description: 'Please fill in all required fields before proceeding.' });
          }
        });
    };


    return (
        <FormProvider {...form}>
             <form className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {/* Form fields here, similar to CreateQuotationDialog */}
                </div>
                {/* Other form sections */}
                <div className="flex justify-end pt-4">
                    <Button type="button" onClick={handleProceed}>
                        Proceed to Preview
                    </Button>
                </div>
            </form>
        </FormProvider>
    );
}

