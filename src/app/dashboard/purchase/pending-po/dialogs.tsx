"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Info,
  Loader2,
  Pencil,
  Save,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
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
  getPurchaseOrderForEditAction,
  updatePurchaseOrderAction,
  type EditablePurchaseOrder,
  type PendingPoItem,
  type PoCreationData,
} from "./actions";

export type CreatePoSubmitAction = (
  poData: PoCreationData,
  creator: { id: string; name: string }
) => Promise<{ success: boolean; message: string }>;

const createPoSchema = z.object({
  vendorName: z.string().min(1, "Vendor name is required."),
  zohoVendorId: z.string().optional(),
  zohoPoNumber: z.string().optional(),
  courier: z.string().min(1, "Courier is required."),
  mode: z.enum(["AIR", "SURFACE"], { required_error: "Mode is required." }),
  tallyPoNumber: z.string().optional(),
  items: z.array(
    z.object({
      id: z.string(),
      purchaseQty: z.number().min(0.01, "Quantity must be > 0."),
      zohoItemId: z.string().optional(),
      zohoItemName: z.string().optional(),
      zohoSku: z.string().optional(),
      zohoRate: z.number().optional(),
      zohoTaxId: z.string().optional(),
      zohoTaxExemptionId: z.string().optional(),
      zohoReverseChargeTaxId: z.string().optional(),
      zohoReverseChargeVatId: z.string().optional(),
    })
  ),
  promiseDeliveryDate: z.date({ required_error: "Promise delivery date is required." }),
});

type CreatePoFormValues = z.infer<typeof createPoSchema>;

type ZohoVendor = {
  id: string;
  name: string;
  email?: string;
  mobile?: string;
  gstNo?: string;
};

type ZohoItem = {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  unit?: string;
  purchaseRate?: number;
  rate?: number;
  itemType?: string;
  preferredVendorId?: string;
  taxId?: string;
  taxExemptionId?: string;
  reverseChargeTaxId?: string;
  reverseChargeVatId?: string;
};

const formatDateForInput = (value?: Date) => {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
};

const getNumeric = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toVendorOption = (vendor: ZohoVendor): ComboboxOption => ({
  value: vendor.id,
  label: (
    <div className="flex flex-col py-0.5">
      <span className="font-medium text-sm">{vendor.name}</span>
      <span className="text-xs text-muted-foreground truncate">
        {[vendor.mobile, vendor.email].filter(Boolean).join(" - ") || "Vendor"}
      </span>
    </div>
  ),
});

const toItemOption = (item: ZohoItem): ComboboxOption => ({
  value: item.id,
  label: (
    <div className="flex flex-col py-0.5">
      <span className="font-medium text-sm">
        {item.sku ? `${item.sku} - ${item.name}` : item.name}
      </span>
      <span className="text-xs text-muted-foreground truncate">
        Rate {getNumeric(item.purchaseRate ?? item.rate, 0).toFixed(2)}
        {item.unit ? ` - ${item.unit}` : ""}
      </span>
    </div>
  ),
});

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

  React.useEffect(() => {
    if (!isOpen) setSelection("");
  }, [isOpen]);

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
                <opt.icon className={cn("h-5 w-5 mb-2", selection === opt.value ? "" : "text-muted-foreground")} />
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(selection === "no")} disabled={!selection}>
            Continue
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
  zohoBotEnabled = false,
  submitAction,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: PendingPoItem[];
  creator: { id: string; name: string } | null;
  onSuccess: () => void;
  isNewVendor: boolean;
  zohoBotEnabled?: boolean;
  submitAction?: CreatePoSubmitAction;
}) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isPoNumberLoading, setIsPoNumberLoading] = React.useState(false);
  const [isAutoLinkingItems, setIsAutoLinkingItems] = React.useState(false);

  const [vendorOptions, setVendorOptions] = React.useState<ComboboxOption[]>([]);
  const [vendorById, setVendorById] = React.useState<Record<string, ZohoVendor>>({});

  const [itemOptionsBySourceId, setItemOptionsBySourceId] = React.useState<Record<string, ComboboxOption[]>>({});
  const [itemById, setItemById] = React.useState<Record<string, ZohoItem>>({});

  const { toast } = useToast();

  const form = useForm<CreatePoFormValues>({
    resolver: zodResolver(createPoSchema),
    defaultValues: {
      vendorName: "",
      zohoVendorId: "",
      zohoPoNumber: "",
      courier: "",
      mode: "SURFACE",
      tallyPoNumber: "",
      items: [],
    },
  });

  const { control, handleSubmit, setValue, getValues } = form;

  const findSourceItem = React.useCallback(
    (sourceItemId: string) => items.find((item) => item.id === sourceItemId),
    [items]
  );

  const fetchItemsForRow = React.useCallback(
    async (sourceItemId: string, query: string, vendorId?: string): Promise<ZohoItem[]> => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setItemOptionsBySourceId((prev) => ({ ...prev, [sourceItemId]: [] }));
        return [];
      }

      const url = `/api/zoho/items?search=${encodeURIComponent(trimmed)}${
        vendorId ? `&vendorId=${encodeURIComponent(vendorId)}` : ""
      }`;
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || "Failed to search Zoho items."));
      }

      const fetchedItems = (Array.isArray(payload.items) ? payload.items : []) as ZohoItem[];
      setItemById((prev) => {
        const next = { ...prev };
        fetchedItems.forEach((item) => {
          next[item.id] = item;
        });
        return next;
      });
      setItemOptionsBySourceId((prev) => ({
        ...prev,
        [sourceItemId]: fetchedItems.map(toItemOption),
      }));

      return fetchedItems;
    },
    []
  );

  const autoLinkItems = React.useCallback(
    async (vendorId: string) => {
      setIsAutoLinkingItems(true);
      try {
        const formItems = getValues("items");

        for (let index = 0; index < formItems.length; index += 1) {
          const formRow = formItems[index];
          const source = findSourceItem(formRow.id);
          if (!source) continue;

          const searchValue = String(source.collectionBrand || source.itemName || "").trim();
          if (!searchValue) continue;

          const fetched = await fetchItemsForRow(formRow.id, searchValue, vendorId);
          if (!fetched.length) continue;

          const query = searchValue.toLowerCase();
          const exactSku = fetched.find((item) => String(item.sku || "").toLowerCase() === query);
          const startsWithSku = fetched.find((item) => String(item.sku || "").toLowerCase().startsWith(query));
          const containsName = fetched.find((item) => String(item.name || "").toLowerCase().includes(query));
          const bestMatch = exactSku || startsWithSku || containsName || fetched[0];

          if (!bestMatch) continue;

          const rowPath = `items.${index}` as const;
          setValue(`${rowPath}.zohoItemId`, bestMatch.id, { shouldValidate: true });
          setValue(`${rowPath}.zohoItemName`, bestMatch.name || "");
          setValue(`${rowPath}.zohoSku`, bestMatch.sku || "");
          setValue(`${rowPath}.zohoTaxId`, bestMatch.taxId || "");
          setValue(`${rowPath}.zohoTaxExemptionId`, bestMatch.taxExemptionId || "");
          setValue(`${rowPath}.zohoReverseChargeTaxId`, bestMatch.reverseChargeTaxId || "");
          setValue(`${rowPath}.zohoReverseChargeVatId`, bestMatch.reverseChargeVatId || "");

          const bestRate =
            bestMatch.purchaseRate === undefined || bestMatch.purchaseRate === null
              ? bestMatch.rate
              : bestMatch.purchaseRate;
          if (bestRate !== undefined && Number.isFinite(Number(bestRate))) {
            setValue(`${rowPath}.zohoRate`, Number(bestRate));
          }
        }
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Auto-link failed",
          description: error?.message || "Could not auto-map BCN to Zoho items.",
        });
      } finally {
        setIsAutoLinkingItems(false);
      }
    },
    [fetchItemsForRow, findSourceItem, getValues, setValue, toast]
  );

  const fetchZohoPoNumber = React.useCallback(
    async (vendorId: string) => {
      setIsPoNumberLoading(true);
      try {
        const response = await fetch(
          `/api/zoho/purchase-orders/next-number?vendorId=${encodeURIComponent(vendorId)}`,
          { cache: "no-store" }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error || "Unable to fetch Zoho PO number."));
        }

        const next = String(payload?.nextNumber || "").trim();
        if (!next) {
          form.clearErrors("zohoPoNumber");
          setValue("zohoPoNumber", "", { shouldValidate: true });
          return;
        }

        form.clearErrors("zohoPoNumber");
        setValue("zohoPoNumber", next, { shouldValidate: true });
      } catch (error: any) {
        form.clearErrors("zohoPoNumber");
        setValue("zohoPoNumber", "", { shouldValidate: true });
        toast({
          variant: "destructive",
          title: "Zoho PO number failed",
          description: `${error?.message || "Could not fetch Zoho PO number."} Zoho will auto-generate the number on create.`,
        });
      } finally {
        setIsPoNumberLoading(false);
      }
    },
    [form, setValue, toast]
  );

  const searchVendors = React.useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setVendorOptions([]);
      return;
    }

    const response = await fetch(`/api/zoho/vendors?search=${encodeURIComponent(trimmed)}`, {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(String(payload?.error || "Could not load Zoho vendors."));
    }

    const vendors = (Array.isArray(payload.vendors) ? payload.vendors : []) as ZohoVendor[];
    setVendorById((prev) => {
      const next = { ...prev };
      vendors.forEach((vendor) => {
        next[vendor.id] = vendor;
      });
      return next;
    });
    setVendorOptions(vendors.map(toVendorOption));
  }, []);

  const handleVendorSelect = React.useCallback(
    async (vendorId: string) => {
      const selectedId = String(vendorId || "").trim();
      setValue("zohoVendorId", selectedId, { shouldValidate: true });

      const vendor = vendorById[selectedId];
      setValue("vendorName", vendor?.name || selectedId, { shouldValidate: true });

      if (!selectedId) {
        setValue("zohoPoNumber", "", { shouldValidate: true });
        return;
      }

      await fetchZohoPoNumber(selectedId);
      await autoLinkItems(selectedId);
    },
    [autoLinkItems, fetchZohoPoNumber, setValue, vendorById]
  );

  React.useEffect(() => {
    if (!items.length) return;

    form.reset({
      vendorName: items[0].vendorName || "",
      zohoVendorId: "",
      zohoPoNumber: "",
      courier: "",
      mode: "SURFACE",
      tallyPoNumber: items[0]?.originalRequest?.tallyPoNumber || "",
      items: items.map((item) => ({
        id: item.id,
        purchaseQty: getNumeric(item.neededQty, 0),
        zohoItemId: "",
        zohoItemName: "",
        zohoSku: "",
        zohoRate: undefined,
        zohoTaxId: "",
        zohoTaxExemptionId: "",
        zohoReverseChargeTaxId: "",
        zohoReverseChargeVatId: "",
      })),
      promiseDeliveryDate: undefined,
    });

    setVendorOptions([]);
    setVendorById({});
    setItemOptionsBySourceId({});
    setItemById({});
  }, [form, items, isOpen]);

  const onSubmit = async (values: CreatePoFormValues) => {
    if (!creator || items.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Missing required data." });
      return;
    }
    if (zohoBotEnabled && !String(values.zohoVendorId || "").trim()) {
      form.setError("zohoVendorId", { message: "Select a Zoho vendor." });
      return;
    }
    if (zohoBotEnabled) {
      const missingZohoItem = values.items.find((entry) => !String(entry.zohoItemId || "").trim());
      if (missingZohoItem) {
        toast({
          variant: "destructive",
          title: "Zoho item required",
          description: "Select Zoho item for every purchase row before creating PO.",
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const poData: PoCreationData = {
        vendor: values.vendorName,
        zohoVendorId: values.zohoVendorId,
        zohoPoNumber: values.zohoPoNumber,
        courier: values.courier,
        mode: values.mode,
        items: items.map((originalItem) => {
          const formItem = values.items.find((entry) => entry.id === originalItem.id);
          return {
            ...originalItem,
            neededQty: formItem?.purchaseQty || originalItem.neededQty,
          };
        }),
        zohoLineItems: zohoBotEnabled
          ? values.items.map((itemRow) => ({
              sourceItemId: itemRow.id,
              zohoItemId: itemRow.zohoItemId || "",
              zohoSku: itemRow.zohoSku,
              zohoItemName: itemRow.zohoItemName,
              rate: itemRow.zohoRate,
              taxId: itemRow.zohoTaxId?.trim() || undefined,
              taxExemptionId: itemRow.zohoTaxExemptionId?.trim() || undefined,
              reverseChargeTaxId: itemRow.zohoReverseChargeTaxId?.trim() || undefined,
              reverseChargeVatId: itemRow.zohoReverseChargeVatId?.trim() || undefined,
            }))
          : undefined,
        isNewVendor,
        promiseDeliveryDate: values.promiseDeliveryDate?.toISOString(),
        tallyPoNumber: values.tallyPoNumber?.trim() || undefined,
      };

      const executeSubmit = submitAction || createPurchaseOrderAction;
      const result = await executeSubmit(poData, creator);
      if (result.success) {
        toast({ title: "PO Created", description: result.message });
        onSuccess();
        onClose();
      } else {
        toast({ variant: "destructive", title: "Error", description: result.message });
      }
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.message || "An unexpected error occurred.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!items.length) return null;

  const totalQty = items.reduce((sum, item) => sum + getNumeric(item.neededQty), 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-screen h-screen max-w-none rounded-none p-0 gap-0 overflow-hidden border-0">
        <div className="flex h-full flex-col bg-background">
          <DialogHeader className="border-b px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-2xl font-bold tracking-tight">Create Purchase Order</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-muted-foreground">
                  {items.length} item{items.length > 1 ? "s" : ""} - Local vendor:{" "}
                  <span className="font-semibold text-foreground">{items[0].vendorName || "Unknown"}</span>
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                {isNewVendor ? (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-xs">
                    <AlertCircle className="mr-1 h-3 w-3" /> New Vendor
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-xs">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Existing Vendor
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs">Total: {totalQty.toFixed(2)}</Badge>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto p-6">
            <Form {...form}>
              <form onSubmit={handleSubmit(onSubmit)} id="create-po-form" className="space-y-6">
                <div className="rounded-xl border bg-card p-4 md:p-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
                    {zohoBotEnabled ? (
                      <>
                        <FormField
                          name="zohoVendorId"
                          control={control}
                          render={({ field }) => (
                            <FormItem className="xl:col-span-2">
                              <FormLabel>Vendor (Zoho) *</FormLabel>
                              <FormControl>
                                <Combobox
                                  options={vendorOptions}
                                  value={field.value || ""}
                                  onSelect={(value) => {
                                    field.onChange(value);
                                    handleVendorSelect(value);
                                  }}
                                  onSearch={searchVendors}
                                  placeholder="Search vendor in Zoho"
                                  searchPlaceholder="Type vendor name"
                                  emptyPlaceholder="No vendor found."
                                  showClear
                                  className="h-9"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          name="zohoPoNumber"
                          control={control}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Zoho PO No. *</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  className="h-9"
                                  placeholder={isPoNumberLoading ? "Fetching..." : "Auto from Zoho"}
                                  readOnly
                                  disabled
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    ) : (
                      <FormField
                        name="vendorName"
                        control={control}
                        render={({ field }) => (
                          <FormItem className="xl:col-span-2">
                            <FormLabel>Vendor *</FormLabel>
                            <FormControl>
                              <Input {...field} className="h-9" readOnly />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      name="courier"
                      control={control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Courier *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
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
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="AIR">AIR</SelectItem>
                              <SelectItem value="SURFACE">SURFACE</SelectItem>
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
                          <FormControl>
                            <Input {...field} placeholder="Optional" className="h-9" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name="promiseDeliveryDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Delivery Date *</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              min={new Date().toISOString().slice(0, 10)}
                              value={formatDateForInput(field.value)}
                              onChange={(event) =>
                                field.onChange(event.target.value ? new Date(event.target.value) : undefined)
                              }
                              className="h-9"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-semibold">Items to Purchase</p>
                    {isAutoLinkingItems ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Auto-linking BCN to Zoho items
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs uppercase">#</TableHead>
                          <TableHead className="text-xs uppercase">BCN / Item</TableHead>
                          <TableHead className="text-xs uppercase">Order Qty</TableHead>
                          <TableHead className="text-xs uppercase">In Stock</TableHead>
                          {zohoBotEnabled ? (
                            <TableHead className="text-xs uppercase min-w-[280px]">Zoho SKU / Item *</TableHead>
                          ) : null}
                          <TableHead className="text-xs uppercase">Rate</TableHead>
                          <TableHead className="text-xs uppercase">Purchase Qty</TableHead>
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
                              <span className="text-sm font-medium">{getNumeric(item.neededQty).toFixed(2)}</span>
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
                                {getNumeric(item.stock).toFixed(2)}
                              </Badge>
                            </TableCell>
                            {zohoBotEnabled ? (
                              <TableCell>
                                <FormField
                                  name={`items.${index}.zohoItemId` as const}
                                  control={control}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormControl>
                                        <Combobox
                                          options={itemOptionsBySourceId[item.id] || []}
                                          value={field.value || ""}
                                          onSelect={(value) => {
                                            field.onChange(value);
                                            const selected = itemById[value];
                                            if (!selected) {
                                              setValue(`items.${index}.zohoItemName`, "");
                                              setValue(`items.${index}.zohoSku`, "");
                                              setValue(`items.${index}.zohoRate`, undefined);
                                              setValue(`items.${index}.zohoTaxId`, "");
                                              setValue(`items.${index}.zohoTaxExemptionId`, "");
                                              setValue(`items.${index}.zohoReverseChargeTaxId`, "");
                                              setValue(`items.${index}.zohoReverseChargeVatId`, "");
                                              return;
                                            }

                                            setValue(`items.${index}.zohoItemName`, selected.name || "");
                                            setValue(`items.${index}.zohoSku`, selected.sku || "");
                                            setValue(`items.${index}.zohoTaxId`, selected.taxId || "");
                                            setValue(`items.${index}.zohoTaxExemptionId`, selected.taxExemptionId || "");
                                            setValue(`items.${index}.zohoReverseChargeTaxId`, selected.reverseChargeTaxId || "");
                                            setValue(`items.${index}.zohoReverseChargeVatId`, selected.reverseChargeVatId || "");

                                            const rate =
                                              selected.purchaseRate === undefined || selected.purchaseRate === null
                                                ? selected.rate
                                                : selected.purchaseRate;
                                            if (rate !== undefined && Number.isFinite(Number(rate))) {
                                              setValue(`items.${index}.zohoRate`, Number(rate));
                                            }
                                          }}
                                          onSearch={async (query) => {
                                            const selectedVendorId =
                                              String(form.getValues("zohoVendorId") || "").trim() || undefined;
                                            try {
                                              await fetchItemsForRow(item.id, query, selectedVendorId);
                                            } catch (error: any) {
                                              toast({
                                                variant: "destructive",
                                                title: "Zoho item search failed",
                                                description: error?.message || "Unable to search Zoho items.",
                                              });
                                            }
                                          }}
                                          placeholder="Search by BCN/SKU"
                                          searchPlaceholder="Type BCN or SKU"
                                          emptyPlaceholder="No Zoho item found"
                                          showClear
                                          className="h-9"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </TableCell>
                            ) : null}
                            <TableCell className="w-[120px]">
                              <FormField
                                name={`items.${index}.zohoRate` as const}
                                control={control}
                                render={({ field }) => (
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="h-8 text-sm"
                                    value={field.value ?? ""}
                                    onChange={(event) => {
                                      const next = event.target.value;
                                      field.onChange(next === "" ? undefined : Number(next));
                                    }}
                                  />
                                )}
                              />
                            </TableCell>
                            <TableCell className="w-[130px]">
                              <FormField
                                name={`items.${index}.purchaseQty` as const}
                                control={control}
                                render={({ field }) => (
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="h-8 text-sm"
                                    value={field.value}
                                    onChange={(event) => field.onChange(getNumeric(event.target.value, 0))}
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

          <div className="border-t bg-muted/20 px-6 py-4 flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-po-form"
              disabled={isSubmitting || isPoNumberLoading || isAutoLinkingItems}
              className="min-w-[160px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating PO...
                </>
              ) : (
                <>
                  <ShoppingCart className="mr-2 h-4 w-4" /> Create PO
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EditPoDialog({
  isOpen,
  onClose,
  creator,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  creator: { id: string; name: string } | null;
  onSuccess: () => void;
}) {
  const [poNumber, setPoNumber] = React.useState("");
  const [purchaseOrder, setPurchaseOrder] = React.useState<EditablePurchaseOrder | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    if (!isOpen) {
      setPoNumber("");
      setPurchaseOrder(null);
      setIsLoading(false);
      setIsSaving(false);
    }
  }, [isOpen]);

  const loadPurchaseOrder = async () => {
    const trimmed = poNumber.trim();
    if (!trimmed || !creator) return;
    setIsLoading(true);
    try {
      const result = await getPurchaseOrderForEditAction(trimmed, creator);
      if (!result.success || !result.purchaseOrder) {
        toast({
          variant: "destructive",
          title: "Unable to edit PO",
          description: result.message,
        });
        return;
      }
      setPurchaseOrder(result.purchaseOrder);
    } finally {
      setIsLoading(false);
    }
  };

  const savePurchaseOrder = async () => {
    if (!purchaseOrder || !creator) return;
    if (
      !purchaseOrder.courier.trim() ||
      !purchaseOrder.promiseDeliveryDate ||
      purchaseOrder.lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)
    ) {
      toast({
        variant: "destructive",
        title: "Check PO details",
        description: "Courier, delivery date, and quantities greater than zero are required.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const result = await updatePurchaseOrderAction(
        {
          poNumber: purchaseOrder.poNumber,
          courier: purchaseOrder.courier,
          mode: purchaseOrder.mode,
          tallyPoNumber: purchaseOrder.tallyPoNumber,
          promiseDeliveryDate: purchaseOrder.promiseDeliveryDate,
          lines: purchaseOrder.lines.map((line) => ({
            key: line.key,
            quantity: line.quantity,
          })),
        },
        creator
      );
      if (!result.success) {
        toast({ variant: "destructive", title: "PO update failed", description: result.message });
        return;
      }

      toast({
        title: result.message.includes("Zoho update failed") ? "PO saved with sync warning" : "PO updated",
        description: result.message,
      });
      onSuccess();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSaving) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="rounded-full bg-blue-100 p-2">
              <Pencil className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <DialogTitle>Edit Purchase Order</DialogTitle>
              <DialogDescription>
                Edit PO details before receiving starts. Changes are saved in Mo Track and then synced to Zoho.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!purchaseOrder ? (
          <div className="py-3 space-y-2">
            <Label htmlFor="edit-po-number">PO Number</Label>
            <div className="flex gap-2">
              <Input
                id="edit-po-number"
                value={poNumber}
                onChange={(event) => setPoNumber(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void loadPurchaseOrder();
                  }
                }}
                placeholder="Enter generated PO number"
                disabled={isLoading}
              />
              <Button onClick={loadPurchaseOrder} disabled={!poNumber.trim() || isLoading || !creator}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load PO"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>PO Number</Label>
                <Input value={purchaseOrder.poNumber} disabled />
              </div>
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Input value={purchaseOrder.vendor} disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-po-courier">Courier</Label>
                <Input
                  id="edit-po-courier"
                  value={purchaseOrder.courier}
                  onChange={(event) =>
                    setPurchaseOrder((current) =>
                      current ? { ...current, courier: event.target.value } : current
                    )
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <Select
                  value={purchaseOrder.mode}
                  onValueChange={(value: "AIR" | "SURFACE") =>
                    setPurchaseOrder((current) => current ? { ...current, mode: value } : current)
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AIR">Air</SelectItem>
                    <SelectItem value="SURFACE">Surface</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-po-date">Promise Delivery Date</Label>
                <Input
                  id="edit-po-date"
                  type="date"
                  value={purchaseOrder.promiseDeliveryDate}
                  onChange={(event) =>
                    setPurchaseOrder((current) =>
                      current ? { ...current, promiseDeliveryDate: event.target.value } : current
                    )
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-po-tally">Tally / Reference Number</Label>
                <Input
                  id="edit-po-tally"
                  value={purchaseOrder.tallyPoNumber}
                  onChange={(event) =>
                    setPurchaseOrder((current) =>
                      current ? { ...current, tallyPoNumber: event.target.value } : current
                    )
                  }
                />
              </div>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="w-36">Quantity</TableHead>
                    <TableHead className="w-24">Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrder.lines.map((line, index) => (
                    <TableRow key={line.key}>
                      <TableCell>
                        <p className="font-medium">{line.itemName}</p>
                        {line.itemCode ? (
                          <p className="text-xs text-muted-foreground">{line.itemCode}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.quantity}
                          onChange={(event) => {
                            const quantity = Number(event.target.value);
                            setPurchaseOrder((current) => {
                              if (!current) return current;
                              const lines = [...current.lines];
                              lines[index] = { ...lines[index], quantity };
                              return { ...current, lines };
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell>{line.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {purchaseOrder.zohoPurchaseOrderNumber ? (
              <p className="text-xs text-muted-foreground">
                Linked Zoho PO: <strong>{purchaseOrder.zohoPurchaseOrderNumber}</strong>
              </p>
            ) : (
              <p className="text-xs text-amber-700">
                This PO is not linked to Zoho yet. The local edit will be used on the next sync.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {purchaseOrder ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPurchaseOrder(null)}
              disabled={isSaving}
            >
              Change PO
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          {purchaseOrder ? (
            <Button type="button" onClick={savePurchaseOrder} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          ) : null}
        </DialogFooter>
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
