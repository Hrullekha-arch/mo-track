"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { EnrichedDealVisit } from "@/types/visits";
import { User } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { updateVisitDetailsAction } from "@/app/dashboard/visits/actions";

const formSchema = z.object({
  dueDate: z.string().min(1, "Due date is required."),
  representative: z.string().min(1, "Representative is required."),
  customerAddress: z.string().optional(),
  remark: z.string().optional(),
});

interface EditVisitDialogProps {
  visit: EnrichedDealVisit | null;
  isOpen: boolean;
  onClose: () => void;
  salesmen: User[];
  onSuccess: () => void;
}

export default function EditVisitDialog({
  visit,
  isOpen,
  onClose,
  salesmen,
  onSuccess,
}: EditVisitDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      dueDate: "",
      representative: "",
      customerAddress: "",
      remark: "",
    },
  });

  React.useEffect(() => {
    if (visit) {
      form.reset({
        dueDate: visit.dueDate
          ? format(new Date(visit.dueDate), "yyyy-MM-dd")
          : visit.slotDate || "",
        representative: visit.representative || "",
        customerAddress:
          visit.customerAddress || visit.location?.address || "",
        remark: visit.remark || "",
      });
    }
  }, [visit, form]);

  if (!visit) return null;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const result = await updateVisitDetailsAction(
        visit.customerId,
        visit.dealDocId,
        visit.id,
        {
          dueDate: new Date(values.dueDate).toISOString(),
          representative: values.representative,
          customerAddress: values.customerAddress?.trim(),
          remark: values.remark,
        }
      );
      if (result.success) {
        toast({ title: "Visit updated" });
        onSuccess();
        onClose();
      } else {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: result.message,
        });
      }
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit Visit</DialogTitle>
          <DialogDescription>
            Updating visit for {visit.customerName}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-slate-700">
                    Visit Date
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      className="rounded-lg border-slate-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="customerAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-slate-700">
                    Address
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Customer address"
                      {...field}
                      className="rounded-lg border-slate-200 resize-none"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="representative"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-slate-700">
                    Representative
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-lg border-slate-200">
                        <SelectValue placeholder="Select representative" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl">
                      {salesmen.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
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
              name="remark"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-slate-700">
                    Remarks
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any notes…"
                      {...field}
                      className="rounded-lg border-slate-200 resize-none"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="rounded-lg"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="rounded-lg">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{" "}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}