
"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { addReceiptAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

const receiptSchema = z.object({
  amount: z.preprocess(
    (val) => parseFloat(String(val)),
    z.number().positive("Amount must be a positive number.")
  ),
  date: z.string().min(1, "Date is required."),
  mode: z.enum(["Cash", "Card", "UPI", "Cheque"], {
    required_error: "Payment mode is required.",
  }),
  referenceNo: z.string().optional(),
  remarks: z.string().optional(),
});

type ReceiptFormValues = z.infer<typeof receiptSchema>;

export function ReceiptForm({
  customerId,
  dealId,
  onReceiptAdded,
}: {
  customerId: string;
  dealId: string;
  onReceiptAdded: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const form = useForm<ReceiptFormValues>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      amount: 0,
      date: new Date().toISOString().split("T")[0],
      mode: "Cash",
      referenceNo: "",
      remarks: "",
    },
  });

  const onSubmit = async (data: ReceiptFormValues) => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in.",
      });
      return;
    }
    setLoading(true);
    try {
      const result = await addReceiptAction(customerId, dealId, {
        ...data,
        createdBy: user.name,
        createdAt: new Date().toISOString(),
      });
      if (result.success) {
        toast({ title: "Receipt Added", description: "Payment receipt has been saved." });
        form.reset();
        onReceiptAdded();
      } else {
        toast({ variant: "destructive", title: "Error", description: result.message });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Receipt</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount*</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date*</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mode*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select payment mode" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="UPI">UPI</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="referenceNo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference No.</FormLabel>
                  <FormControl>
                    <Input placeholder="Card/UPI/Cheque No." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remarks</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Any additional notes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={loading}>
                {loading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add Receipt
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
