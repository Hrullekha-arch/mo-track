"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Building2, CheckCircle2, Info, Loader2, ShoppingCart, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  createPurchaseOrderAction,
  type PendingPoItem,
  type PoCreationData,
} from "./actions";

const createPoSchema = z.object({
  vendor: z.string().min(1, "Vendor name is required."),
  courier: z.string().min(1, "Courier is required."),
  mode: z.enum(["AIR", "SURFACE"], { required_error: "Mode is required." }),
  tallyPoNumber: z.string().optional(),
  items: z.array(
    z.object({
      id: z.string(),
      purchaseQty: z.number().min(0.01, "Quantity must be > 0."),
    })
  ),
  promiseDeliveryDate: z.date({ required_error: "Promise delivery date is required." }),
});

type CreatePoFormValues = z.infer<typeof createPoSchema>;

export function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={cn("rounded-lg p-3 shrink-0", color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold leading-none mt-1">{value}</p>
        {sub ? <p className="text-xs text-muted-foreground mt-0.5">{sub}</p> : null}
      </div>
    </div>
  );
}

export function VendorVerificationDialog({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (isNew: boolean) => void;
}) {
  const [selection, setSelection] = React.useState("");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="rounded-full bg-blue-100 p-2">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <DialogTitle>Vendor Verification</DialogTitle>
          </div>
          <DialogDescription>
            Is the selected vendor a new or existing vendor in your system?
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                value: "yes",
                label: "Existing Vendor",
                desc: "Already registered",
                icon: CheckCircle2,
                color: "border-emerald-300 bg-emerald-50 text-emerald-700",
              },
              {
                value: "no",
                label: "New Vendor",
                desc: "Not yet registered",
                icon: AlertCircle,
                color: "border-amber-300 bg-amber-50 text-amber-700",
              },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelection(opt.value)}
                className={cn(
                  "rounded-xl border-2 p-4 text-left transition-all",
                  selection === opt.value ? `${opt.color} border-current` : "border-border hover:bg-muted/40"
                )}
              >
                <opt.icon
                  className={cn("h-5 w-5 mb-2", selection === opt.value ? "" : "text-muted-foreground")}
                />
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(selection === "no")} disabled={!selection}>
            Continue →
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreatePoDialog({
  isOpen,
  onClose,
  items,
  creator,
  onSuccess,
  isNewVendor,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: PendingPoItem[];
  creator: { id: string; name: string } | null;
  onSuccess: () => void;
  isNewVendor: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { toast } = useToast();

  const form = useForm<CreatePoFormValues>({
    resolver: zodResolver(createPoSchema),
    defaultValues: { vendor: "", courier: "", mode: "SURFACE", tallyPoNumber: "", items: [] },
  });

  const { control, handleSubmit } = form;

  React.useEffect(() => {
    if (items.length > 0) {
      form.reset({
        vendor: items[0].vendorName || "",
        courier: "",
        mode: "SURFACE",
        tallyPoNumber: items[0]?.originalRequest?.tallyPoNumber || "",
        items: items.map((item) => ({ id: item.id, purchaseQty: item.neededQty })),
        promiseDeliveryDate: undefined,
      });
    }
  }, [items, form]);

  const onSubmit = async (values: CreatePoFormValues) => {
    if (!creator || items.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Missing required data." });
      return;
    }

    setIsSubmitting(true);
    try {
      const poData: PoCreationData = {
        vendor: values.vendor,
        courier: values.courier,
        mode: values.mode,
        items: items.map((originalItem) => {
          const formItem = values.items.find((entry) => entry.id === originalItem.id);
          return { ...originalItem, neededQty: formItem?.purchaseQty || originalItem.neededQty };
        }),
        isNewVendor,
        promiseDeliveryDate: values.promiseDeliveryDate?.toISOString(),
        tallyPoNumber: values.tallyPoNumber?.trim() || undefined,
      };
      const result = await createPurchaseOrderAction(poData, creator);
      if (result.success) {
        toast({ title: "PO Created!", description: result.message });
        onSuccess();
        onClose();
      } else {
        toast({ variant: "destructive", title: "Error", description: result.message });
      }
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!items.length) return null;

  const totalQty = items.reduce((sum, item) => sum + item.neededQty, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-bold">Create Purchase Order</DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {items.length} item{items.length > 1 ? "s" : ""} · Vendor:{" "}
                <strong>{items[0].vendorName || "Unknown"}</strong>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isNewVendor ? (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-xs">
                  <AlertCircle className="mr-1 h-3 w-3" /> New Vendor
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-xs">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Existing Vendor
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                Total: {totalQty.toFixed(2)}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit)} id="create-po-form" className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <FormField
                  name="vendor"
                  control={control}
                  render={({ field }) => (
                    <FormItem className="col-span-2 md:col-span-1">
                      <FormLabel>Vendor *</FormLabel>
                      <FormControl><Input {...field} className="h-9" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="courier"
                  control={control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Courier *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="S M COURIER">S M COURIER</SelectItem>
                          <SelectItem value="NITCO LOGISTICS PVT LTD">NITCO LOGISTICS</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="mode"
                  control={control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mode *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="AIR">✈ AIR</SelectItem>
                          <SelectItem value="SURFACE">🚛 SURFACE</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="tallyPoNumber"
                  control={control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tally PO No.</FormLabel>
                      <FormControl><Input {...field} placeholder="Optional" className="h-9" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="promiseDeliveryDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-1">
                      <FormLabel className="text-sm font-medium text-gray-700">Delivery Date *</FormLabel>
                      <input
                        type="date"
                        min={new Date().toISOString().split("T")[0]}
                        value={field.value ? new Date(field.value).toISOString().split("T")[0] : ""}
                        onChange={(event) =>
                          field.onChange(event.target.value ? new Date(event.target.value) : null)
                        }
                        className="w-full h-9 px-3 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <div>
                <p className="text-sm font-semibold mb-3">Items to Purchase</p>
                <div className="rounded-xl border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        {["#", "BCN / Item", "Order Qty", "In Stock", "Purchase Qty"].map((header) => (
                          <TableHead key={header} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9">
                            {header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, index) => (
                        <TableRow key={item.id} className={index % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                          <TableCell className="text-xs text-muted-foreground w-8">{index + 1}</TableCell>
                          <TableCell>
                            <p className="text-sm font-semibold font-mono">{item.collectionBrand}</p>
                            <p className="text-xs text-muted-foreground">{item.itemName}</p>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium">{item.neededQty.toFixed(2)}</span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                item.stock > 0
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 text-slate-500"
                              )}
                            >
                              {item.stock.toFixed(2)}
                            </Badge>
                          </TableCell>
                          <TableCell className="w-32">
                            <FormField
                              name={`items.${index}.purchaseQty`}
                              control={control}
                              render={({ field }) => (
                                <Input
                                  {...field}
                                  type="number"
                                  step="0.01"
                                  className="h-8 text-sm"
                                  onChange={(event) => field.onChange(parseFloat(event.target.value))}
                                />
                              )}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </form>
          </Form>
        </div>

        <div className="px-6 py-4 border-t bg-muted/20 flex items-center justify-between shrink-0">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="create-po-form" disabled={isSubmitting} className="min-w-[140px]">
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating PO...</>
            ) : (
              <><ShoppingCart className="mr-2 h-4 w-4" /> Create PO</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePoDialog({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (poNumber: string) => void;
  isDeleting: boolean;
}) {
  const [poNumber, setPoNumber] = React.useState("");

  React.useEffect(() => {
    if (!isOpen) setPoNumber("");
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isDeleting) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="rounded-full bg-red-100 p-2">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <DialogTitle>Delete Purchase Order</DialogTitle>
          </div>
          <DialogDescription>
            Admin only. This will remove the PO from linked purchase requests and delete its inbound document. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-2">
          <Label htmlFor="delete-po-number" className="text-sm font-medium">PO Number</Label>
          <Input
            id="delete-po-number"
            value={poNumber}
            onChange={(event) => setPoNumber(event.target.value)}
            placeholder="Enter PO number to delete"
            disabled={isDeleting}
            className="h-9"
          />
          {poNumber ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="h-3 w-3" />
              Deleting PO <strong className="font-mono">{poNumber}</strong>
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isDeleting}>Cancel</Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => onConfirm(poNumber)}
            disabled={isDeleting || !poNumber.trim()}
          >
            {isDeleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</> : "Confirm Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
