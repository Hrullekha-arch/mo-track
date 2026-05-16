"use client";

import * as React from "react";
import { Stock } from "@/lib/types";
import { OrderItem } from "@/types/order-items";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { useForm, useFieldArray, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import {
  getAvailableStockLengths,
  allocateStockToAction,
} from "@/app/dashboard/orders/[orderId]/actions";
import { getItemQty } from "@/lib/order-utils";

const allocationSchema = z.object({
  allocations: z
    .array(
      z.object({
        lengthId: z.string(),
        quantity: z.number().positive("Quantity must be positive."),
      })
    )
    .min(1, "Select at least one roll."),
});

type AllocationFormValues = z.infer<typeof allocationSchema>;

interface AllocateDialogProps {
  item: OrderItem;
  stock: Stock;
  orderId: string;
  onAllocationSuccess: (bcn?: string) => void;
  invoiceRequired: boolean;
}

export default function AllocateDialog({
  item,
  stock,
  orderId,
  onAllocationSuccess,
  invoiceRequired,
}: AllocateDialogProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [availableLengths, setAvailableLengths] = React.useState<
    { length: number; transactionId: string }[]
  >([]);
  const [loadingLengths, setLoadingLengths] = React.useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const requiredQty = getItemQty(item);

  const form = useForm<AllocationFormValues>({
    resolver: zodResolver(allocationSchema),
    defaultValues: { allocations: [] },
  });

  const { control, handleSubmit, watch } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "allocations",
  });

  const watchedAllocations = watch("allocations");
  const totalAllocated = React.useMemo(
    () =>
      watchedAllocations.reduce((s, a) => s + (Number(a.quantity) || 0), 0),
    [watchedAllocations]
  );

  // Load available lengths when dialog opens
  React.useEffect(() => {
    if (!isOpen) {
      form.reset({ allocations: [] });
      return;
    }

    setLoadingLengths(true);
    getAvailableStockLengths(stock.id)
      .then((r) => {
        if (r.success && r.lengths) {
          setAvailableLengths(r.lengths);
        } else {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Could not fetch available rolls.",
          });
        }
      })
      .catch(() => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load stock lengths.",
        });
      })
      .finally(() => {
        setLoadingLengths(false);
      });
  }, [isOpen, stock.id, form, toast]);

  const handleCheckboxChange = (
    checked: boolean,
    lengthId: string,
    availableLength: number
  ) => {
    const idx = fields.findIndex((f) => f.lengthId === lengthId);
    if (checked && idx === -1) {
      const currentTotal = form
        .getValues("allocations")
        .reduce((s, a) => s + (Number(a.quantity) || 0), 0);
      const qty = Math.max(
        0,
        Math.min(availableLength, requiredQty - currentTotal)
      );
      append({ lengthId, quantity: qty });
    } else if (!checked && idx > -1) {
      remove(idx);
    }
  };

  const onSubmit = async (data: AllocationFormValues) => {
    if (!user) {
      toast({ variant: "destructive", title: "Not authenticated" });
      return;
    }

    if (Math.abs(totalAllocated - requiredQty) > 0.01) {
      toast({
        variant: "destructive",
        title: "Quantity Mismatch",
        description: `Allocate exactly ${requiredQty.toFixed(2)}. Currently: ${totalAllocated.toFixed(2)}.`,
      });
      return;
    }

    if (
      !window.confirm(
        `Reserve ${totalAllocated.toFixed(2)} units? Reversible only before ${
          invoiceRequired ? "invoicing" : "dispatch"
        }.`
      )
    )
      return;

    setIsSubmitting(true);
    try {
      const itemRate = Number((item as any).rate);
      const rate = Number.isFinite(itemRate)
        ? itemRate
        : (stock.rrpWithGstRs ?? stock.mrp ?? 0);

      const result = await allocateStockToAction({
        orderId,
        stockId: stock.id,
        bcn: stock.bcn,
        allocations: data.allocations,
        itemName: stock.name || stock.itemName || stock.bcn,
        rate,
        userId: user.id,
        userName: user.name,
      });

      if (result.success) {
        toast({
          title: "Allocation Successful!",
          description: invoiceRequired
            ? "Stock reserved and sent for invoicing."
            : "Stock reserved and ready for delivery.",
        });
        // Pass BCN for incremental refresh
        onAllocationSuccess(result.bcn);
        setIsOpen(false);
      } else {
        toast({
          variant: "destructive",
          title: "Allocation Failed",
          description: result.message,
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Failed to allocate stock.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const remaining = requiredQty - totalAllocated;
  const isExact = Math.abs(remaining) <= 0.01;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs">
          Allocate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Allocate Stock</DialogTitle>
          <DialogDescription>
            Reserve stock for <strong className="font-semibold">{stock.bcn}</strong> · Required:{" "}
            <strong className="font-semibold">{requiredQty.toFixed(2)}</strong> units
          </DialogDescription>
        </DialogHeader>

        <FormProvider {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
                Available Rolls
              </Label>
              {loadingLengths ? (
                <div className="flex items-center gap-2 p-4 border rounded-lg bg-muted/20">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Fetching rolls…
                  </span>
                </div>
              ) : availableLengths.length > 0 ? (
                <div className="max-h-64 overflow-y-auto space-y-1.5 p-2 border rounded-lg bg-muted/30">
                  {availableLengths.map((len) => {
                    const fieldIdx = fields.findIndex(
                      (f) => f.lengthId === len.transactionId
                    );
                    const isChecked = fieldIdx > -1;
                    return (
                      <div
                        key={len.transactionId}
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-md transition-colors border",
                          isChecked
                            ? "bg-primary/5 border-primary/30 shadow-sm"
                            : "bg-background border-border hover:bg-muted/50"
                        )}
                      >
                        <Checkbox
                          id={`roll-${len.transactionId}`}
                          checked={isChecked}
                          onCheckedChange={(c) =>
                            handleCheckboxChange(
                              !!c,
                              len.transactionId,
                              len.length
                            )
                          }
                        />
                        <Label
                          htmlFor={`roll-${len.transactionId}`}
                          className="flex-1 cursor-pointer text-sm font-medium"
                        >
                          {len.length.toFixed(2)} Mtr available
                        </Label>
                        {isChecked && (
                          <FormField
                            control={control}
                            name={`allocations.${fieldIdx}.quantity`}
                            render={({ field }) => (
                              <FormItem className="m-0">
                                <FormControl>
                                  <Input
                                    type="number"
                                    className="w-24 h-8 text-xs"
                                    step="0.01"
                                    max={len.length}
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 border rounded-lg bg-muted/20 text-center">
                  <AlertCircle className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No rolls available for allocation.
                  </p>
                </div>
              )}
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-3 divide-x rounded-lg border bg-muted/30 text-center text-sm overflow-hidden">
              <div className="p-3">
                <div className="text-xs text-muted-foreground mb-0.5">
                  Required
                </div>
                <div className="font-semibold text-base">
                  {requiredQty.toFixed(2)}
                </div>
              </div>
              <div className="p-3">
                <div className="text-xs text-muted-foreground mb-0.5">
                  Allocated
                </div>
                <div className="font-semibold text-base text-blue-600">
                  {totalAllocated.toFixed(2)}
                </div>
              </div>
              <div className="p-3">
                <div className="text-xs text-muted-foreground mb-0.5">
                  Remaining
                </div>
                <div
                  className={cn(
                    "font-semibold text-base",
                    remaining < 0
                      ? "text-destructive"
                      : isExact
                      ? "text-green-600"
                      : ""
                  )}
                >
                  {remaining.toFixed(2)}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !isExact || !fields.length}
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Reserve Stock
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}