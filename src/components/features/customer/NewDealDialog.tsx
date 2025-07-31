
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { User, Deal } from "@/lib/types";
import { addDealAction } from "@/app/dashboard/customers/actions";

const dealSchema = z.object({
  dealName: z.string().min(1, "Deal Name is required."),
  dealAmount: z.preprocess(
    (a) => {
        if (typeof a === 'string' && a.trim() === '') return undefined;
        const parsed = parseFloat(z.string().parse(a));
        return isNaN(parsed) ? undefined : parsed;
    },
    z.number().positive("Deal amount must be a positive number.").optional()
  ),
  representativeId: z.string().min(1, "A representative must be selected."),
  description: z.string().max(2000, "Description cannot exceed 2000 characters.").optional(),
});

type DealFormValues = z.infer<typeof dealSchema>;

interface NewDealDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newDeal: Deal) => void;
  customerId: string;
  salesmen: User[];
}

export function NewDealDialog({ isOpen, onClose, onSuccess, customerId, salesmen }: NewDealDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<DealFormValues>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      dealName: "",
      dealAmount: '',
      representativeId: "",
      description: "",
    }
  });

  async function onSubmit(data: DealFormValues) {
    setLoading(true);
    try {
      const result = await addDealAction({
        customerId,
        dealName: data.dealName,
        dealAmount: data.dealAmount || 0,
        representativeId: data.representativeId,
        description: data.description || "",
      });

      if (result.success && result.deal) {
        onSuccess(result.deal);
        form.reset();
      } else {
        toast({ variant: "destructive", title: "Error", description: result.message });
      }
    } catch (error) {
      console.error("Error creating deal:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not save the new deal." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New Deal</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="dealName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deal Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dealAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deal Amount</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="representativeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Representative</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="--SELECT--" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {salesmen.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deal Description <span className="text-sm text-destructive">(Upto 2000 characters)</span></FormLabel>
                  <FormControl>
                    <Textarea rows={4} maxLength={2000} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
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
