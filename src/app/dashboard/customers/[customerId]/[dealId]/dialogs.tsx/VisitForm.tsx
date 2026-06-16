"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Textarea } from "@/components/ui/textarea";
import {
  User,
  DealOrder,
  DealVisit,
  Selection,
  Customer,
} from "@/lib/types";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { addVisitAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import {
  subDeliveryInstallationItems,
  FittingInstallationItems,
} from "@/lib/visit-options";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/firebase";
import { collection, doc as docRef, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { Switch } from "@/components/ui/switch";
import { getSalesmen } from "../../../actions";

/* ================= SCHEMA ================= */

export const deliveryInstallationItemSchema = z.object({
  id: z.string(),
  noOfPcs: z.string().optional(),
});

const visitSchema = z.object({
  representative: z.string().min(1, "Representative is required."),
  selectionId: z.string().optional(),
  measurements: z.array(z.string()).optional(),
  blinds: z.array(z.string()).optional(),
  curtain: z.array(z.string()).optional(),
  otherCurtain: z.string().optional(),
  customerAddress: z.string().optional(),
  customerLandmark: z.string().optional(),
  
  // Delivery fields
  deliveryInstallations: z
    .array(deliveryInstallationItemSchema.nullable().optional())
    .optional(),
  subDeliveryInstallations: z
    .array(deliveryInstallationItemSchema.nullable().optional())
    .optional(),
  otherDelivery: z.string().optional(),
  
  // Fitting fields
  fittingInstallations: z
    .array(deliveryInstallationItemSchema.nullable().optional())
    .optional(),
  subFittingInstallations: z
    .array(deliveryInstallationItemSchema.nullable().optional())
    .optional(),
  otherFitting: z.string().optional(),
  
  // Complaint fields
  complaintType: z.string().optional(),
  complaintDescription: z.string().optional(),
  complaintPriority: z.string().optional(),
  
  // Sample Showing fields
  sampleShowingItems: z.array(z.string()).optional(),
  sampleShowingNotes: z.string().optional(),
  
  // Collection fields
  collectionItems: z.string().optional(),
  collectionNotes: z.string().optional(),
  
  orderId: z.string().optional(),
  remark: z.string().optional(),
  dueDate: z.string().min(1, "Due Date is required."),
  enableOrder: z.boolean().default(true),
});

export type VisitFormValues = z.infer<typeof visitSchema>;

/* ================= OPTIONS ================= */

export const measurementItems = [
  { id: "curtain-measurement", label: "Curtain Measurement" },
  { id: "sofa-measurement", label: "Sofa Measurement" },
  { id: "wallpaper-measurement", label: "Wallpaper Measurement" },
  { id: "flooring-measurement", label: "Flooring Measurement" },
  { id: "blinds-measurement", label: "Blinds Measurement" },
  { id: "mattress-measurement", label: "Mattress Measurement" },
  { id: "other-measurement", label: "Other Measurement" },
];

export const subMeasurementBlinds = [
  { id: "roman-blind", label: "Roman Blind" },
  { id: "roller-blind", label: "Roller Blind" },
  { id: "zebra-blind", label: "Zebra Blind" },
  { id: "wooden-blind", label: "Wooden Blind" },
];

export const complaintTypes = [
  { id: "product-defect", label: "Product Defect" },
  { id: "installation-issue", label: "Installation Issue" },
  { id: "measurement-error", label: "Measurement Error" },
  { id: "color-mismatch", label: "Color Mismatch" },
  { id: "damaged-delivery", label: "Damaged During Delivery" },
  { id: "delay-complaint", label: "Delay Complaint" },
  { id: "other-complaint", label: "Other" },
];

export const sampleShowingCategories = [
  { id: "curtain-fabric", label: "Curtain Fabric" },
  { id: "sofa-fabric", label: "Sofa Fabric" },
  { id: "wallpaper-samples", label: "Wallpaper Samples" },
  { id: "flooring-samples", label: "Flooring Samples" },
  { id: "blinds-samples", label: "Blinds Samples" },
  { id: "mattress-samples", label: "Mattress Samples" },
  { id: "cushion-fabric", label: "Cushion Fabric" },
  { id: "other-samples", label: "Other Samples" },
];

const subDeliveryInstallationOptions = subDeliveryInstallationItems;
const fittingInstallationOptions = FittingInstallationItems;

const VISIT_TYPES = [
  { value: "measurement", label: "Measurements" },
  { value: "delivery", label: "Delivery" },
  { value: "fittings", label: "Fittings" },
  { value: "complaint", label: "Complaint" },
  { value: "Collection", label: "Collection" },
  { value: "Sample Showing", label: "Sample Showing" },
  { value: "other", label: "Other" },
] as const;

const NO_ORDER_VALUE = "__none__";

const extractDeliveryItemsFromOrder = (order: any) => {
  if (!order) return [] as Array<{ id: string; label: string; qty: number }>;

  const rawItems = [
    ...(Array.isArray(order?.sections?.NORMAL?.items) ? order.sections.NORMAL.items : []),
    ...(Array.isArray(order?.sections?.VAS?.items) ? order.sections.VAS.items : []),
  ];

  const byKey = new Map<string, { id: string; label: string; qty: number }>();
  rawItems.forEach((item: any, index: number) => {
    const label = String(
      item?.salesDescription ||
        item?.description ||
        item?.itemName ||
        item?.collectionBrand ||
        item?.serialNo ||
        item?.bcn ||
        item?.fabricName ||
        item?.furnitureName ||
        item?.name ||
        item?.id ||
        `Item ${index + 1}`
    ).trim();
    if (!label) return;

    const qtyRaw = Number(item?.quantity ?? item?.qty ?? item?.noOfPcs ?? item?.fabricQty ?? 1);
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;

    const key = label.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, { ...existing, qty: existing.qty + qty });
      return;
    }
    byKey.set(key, { id: label, label, qty });
  });

  return Array.from(byKey.values());
};

/* ================= COMPONENT ================= */

// Add to the VisitForm props interface:
export function VisitForm({
  customer,
  customerId,
  dealId,
  onVisitAdded,
  visits,
  orders,            // existing — may be empty initially
  selections,        // existing — may be empty initially    // ✅ NEW: callback to trigger lazy fetch
  autoOpen = false,
  hideCreateButton = false,
}: {
  customer?: Customer;
  customerId: string;
  dealId: string;
  onVisitAdded: (visit: DealVisit) => void;
  visits: DealVisit[];
  orders: DealOrder[];
  selections: Selection[];
  onOpenDialog?: () => Promise<void>;   // ✅ NEW
  formDataLoading?: boolean;             // ✅ NEW
  autoOpen?: boolean;
  hideCreateButton?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(!!autoOpen);
  const [salesman, setSalesman] = useState<User[]>([]);

  //=================log
  console.log("VisitForm props - customer:", customer);
  console.log("VisitForm props - orders:", orders);
  console.log("VisitForm props - selections:", selections);

  //======================fetch Sales Persons for dropdown========================
  useEffect(()=>{
    const fetchSalesPersons = async () => {
      try {
        const salesPersonsData = await getSalesmen();
        setSalesman(salesPersonsData);
      } catch (error) {
        console.error("Error fetching sales persons:", error);
      }
    };
    fetchSalesPersons();
  }, []);

  React.useEffect(() => {
    if (autoOpen) setCreateOpen(true);
  }, [autoOpen]);

  const savedAddresses = useMemo(() => {
    const list = Array.isArray(customer?.savedAddresses)
      ? customer.savedAddresses.filter((addr) => addr?.address)
      : [];
    if (list.length > 0) return list;
    if (customer?.billingAddress?.line1 || customer?.addressPinCode) {
      return [{ address: customer?.billingAddress?.line1 || customer.addressPinCode, landmark: customer.landmark }];
    }
    return [];
  }, [customer]);

  const [addressMode, setAddressMode] = useState<"saved" | "new">(
    savedAddresses.length > 0 ? "saved" : "new"
  );
  const [selectedAddressIndex, setSelectedAddressIndex] = useState("0");
  const [addressDraft, setAddressDraft] = useState({ address: "", landmark: "" });

  React.useEffect(() => {
    if (!createOpen) return;
    const hasSaved = savedAddresses.length > 0;
    setAddressMode(hasSaved ? "saved" : "new");
    setSelectedAddressIndex("0");
    setAddressDraft({
      address: customer?.billingAddress?.line1 || customer?.addressPinCode || "",
      landmark: customer?.landmark || "",
    });
  }, [createOpen, savedAddresses, customer]);

  const [activeTab, setActiveTab] = useState<
    "measurement" | "delivery" | "fittings" | "complaint" | "Collection" | "Sample Showing" | "other"
  >("measurement");

  const { toast } = useToast();
  const { user } = useAuth();

  const hasMeasurementVisit = useMemo(
    () => visits.some((v) => v.typeOfVisit === "measurement"),
    [visits]
  );

  const form = useForm<VisitFormValues>({
    resolver: zodResolver(visitSchema),
    defaultValues: {
      enableOrder: true,
      representative: "",
      selectionId: "none",
      measurements: [],
      blinds: [],
      curtain: [],
      otherCurtain: "",
      deliveryInstallations: [],
      subDeliveryInstallations: [],
      otherDelivery: "",
      fittingInstallations: fittingInstallationOptions.map(() => null),
      subFittingInstallations: subDeliveryInstallationOptions.map(() => null),
      otherFitting: "",
      complaintType: "",
      complaintDescription: "",
      complaintPriority: "medium",
      sampleShowingItems: [],
      sampleShowingNotes: "",
      collectionItems: "",
      collectionNotes: "",
      orderId: "",
      remark: "",
      dueDate: "",
    },
  });

  const watchedMeasurements = form.watch("measurements");
  const watchedFittingInstallations = form.watch("fittingInstallations");
  const watchedDeliveryInstallationsRaw = form.watch("deliveryInstallations");
  const selectedOrderNo = form.watch("orderId");
  const enableOrder = form.watch("enableOrder");
  const [resolvedOrderForDelivery, setResolvedOrderForDelivery] = useState<any | null>(null);
  const [deliveryItemsLoading, setDeliveryItemsLoading] = useState(false);

 const selectedOrderForDelivery = useMemo(() => {
  if (!Array.isArray(orders)) return null;
  if (!selectedOrderNo) return null;

  return (
    orders.find(
      (order) =>
        order?.orderNo?.trim() === selectedOrderNo?.trim()
    ) || null
  );
}, [orders, selectedOrderNo]);

  React.useEffect(() => {
    let cancelled = false;

    const fetchFallbackOrder = async () => {
      if (activeTab !== "delivery") return;
      const selected = String(selectedOrderNo || "").trim();
      if (!selected) {
        setResolvedOrderForDelivery(null);
        setDeliveryItemsLoading(false);
        return;
      }

      const localItems = extractDeliveryItemsFromOrder(selectedOrderForDelivery);
      if (localItems.length > 0) {
        setResolvedOrderForDelivery(selectedOrderForDelivery || null);
        setDeliveryItemsLoading(false);
        return;
      }

      setDeliveryItemsLoading(true);
      try {
        const withPrefix = /^MOTRACK-/i.test(selected) ? selected : `MOTRACK-${selected}`;
        const compact = withPrefix.replace(/^MOTRACK-/i, "");
        const candidates: any[] = [];

        const tryPushDoc = (snap: any) => {
          if (!snap?.exists()) return;
          const data = { id: snap.id, ...snap.data() };
          if (!candidates.some((c) => c.id === data.id)) {
            candidates.push(data);
          }
        };

        const byDocIdPrefixed = await getDoc(docRef(db, "orders", withPrefix));
        tryPushDoc(byDocIdPrefixed);

        if (candidates.length === 0) {
          const byDocIdRaw = await getDoc(docRef(db, "orders", selected));
          tryPushDoc(byDocIdRaw);
        }

        const pushQueryResult = async (field: string, value: string) => {
          if (candidates.length > 0 || !value) return;
          const snapshot = await getDocs(
            query(collection(db, "orders"), where(field, "==", value), limit(1))
          );
          snapshot.docs.forEach((docSnap) => {
            const data = { id: docSnap.id, ...docSnap.data() };
            if (!candidates.some((c) => c.id === data.id)) {
              candidates.push(data);
            }
          });
        };

        await pushQueryResult("orderNo", withPrefix);
        await pushQueryResult("orderNo", selected);
        await pushQueryResult("crmOrderNo", withPrefix);
        await pushQueryResult("crmOrderNo", compact);

        if (!cancelled) {
          setResolvedOrderForDelivery(candidates[0] || selectedOrderForDelivery || null);
        }
      } catch (error) {
        console.error("Failed to fetch full order items for delivery:", error);
        if (!cancelled) setResolvedOrderForDelivery(selectedOrderForDelivery || null);
      } finally {
        if (!cancelled) setDeliveryItemsLoading(false);
      }
    };

    void fetchFallbackOrder();
    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedOrderNo, selectedOrderForDelivery]);

  const deliveryOrderItems = useMemo(() => {
    return extractDeliveryItemsFromOrder(resolvedOrderForDelivery || selectedOrderForDelivery);
  }, [resolvedOrderForDelivery, selectedOrderForDelivery]);

  const selectedDeliveryRows = useMemo(
    () =>
      ((watchedDeliveryInstallationsRaw || []).filter(Boolean) as Array<{
        id: string;
        noOfPcs?: string;
      }>),
    [watchedDeliveryInstallationsRaw]
  );

  const selectedDeliveryMap = useMemo(() => {
    const map = new Map<string, { id: string; noOfPcs?: string }>();
    selectedDeliveryRows.forEach((row) => {
      if (!row?.id) return;
      map.set(String(row.id), row);
    });
    return map;
  }, [selectedDeliveryRows]);

  React.useEffect(() => {
    if (activeTab !== "delivery") return;
    const allowedIds = new Set(deliveryOrderItems.map((item) => item.id));
    const current = (form.getValues("deliveryInstallations") || []).filter(Boolean) as Array<{
      id: string;
      noOfPcs?: string;
    }>;
    const pruned = current.filter((row) => allowedIds.has(String(row.id || "")));
    if (pruned.length !== current.length) {
      form.setValue("deliveryInstallations", pruned, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    if (!selectedOrderNo && current.length > 0) {
      form.setValue("deliveryInstallations", [], {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [activeTab, deliveryOrderItems, form, selectedOrderNo]);

  React.useEffect(() => {
    if (!enableOrder) {
      form.setValue("orderId", "");
      form.setValue("deliveryInstallations", []);
    }
  }, [enableOrder]);

  const toggleDeliveryItem = (
    itemId: string,
    defaultQty: number,
    checked: boolean
  ) => {
    const current = (form.getValues("deliveryInstallations") || []).filter(
      Boolean
    ) as Array<{ id: string; noOfPcs?: string }>;
    const next = current.filter((row) => String(row.id) !== itemId);
    if (checked) {
      next.push({ id: itemId, noOfPcs: String(defaultQty) });
    }
    form.setValue("deliveryInstallations", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const updateDeliveryItemQty = (itemId: string, qty: string) => {
    const current = (form.getValues("deliveryInstallations") || []).filter(
      Boolean
    ) as Array<{ id: string; noOfPcs?: string }>;
    const next = current.map((row) =>
      String(row.id) === itemId ? { ...row, noOfPcs: qty } : row
    );
    form.setValue("deliveryInstallations", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  async function onSubmit(data: VisitFormValues) {

    if (!user) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "You must be logged in.",
      });
      return;
    }
    if (activeTab === "delivery" && enableOrder && !data.orderId) {
        toast({
          variant: "destructive",
          title: "Order Required",
          description: "Please select an order",
        });
        return;
      }

    setLoading(true);
    try {
      const savedIndex = Number(selectedAddressIndex);
      const savedAddress =
        addressMode === "saved" && savedAddresses[savedIndex]
          ? savedAddresses[savedIndex]
          : null;
      const nextAddress =
        addressMode === "new"
          ? {
              address: addressDraft.address.trim(),
              landmark: addressDraft.landmark.trim(),
            }
          : savedAddress;

      if (!nextAddress?.address) {
        toast({
          variant: "destructive",
          title: "Missing Address",
          description: "Please select or add a customer address.",
        });
        setLoading(false);
        return;
      }

      const clean = (arr?: any[]) => (arr || []).filter(Boolean);
      const visitDataForDb = {
        ...data,
        typeOfVisit: activeTab,
        selectionId: data.selectionId === "none" ? undefined : data.selectionId,
        deliveryInstallations: clean(data.deliveryInstallations),
        subDeliveryInstallations: clean(data.subDeliveryInstallations),
        fittingInstallations: clean(data.fittingInstallations),
        subFittingInstallations: clean(data.subFittingInstallations),
        customerAddress: nextAddress.address,
        customerLandmark: nextAddress.landmark || "",
      };

      console.log("📦 [VISIT->BACKEND] payload =", visitDataForDb);
      console.log("📦 [VISIT->BACKEND] payload (pretty) =\n", JSON.stringify(visitDataForDb, null, 2));

      localStorage.setItem("LAST_VISIT_PAYLOAD", JSON.stringify(visitDataForDb));

      const result = await addVisitAction(
        customerId,
        dealId,
        visitDataForDb,
        user.name
      );

      if (result.success && result.visit) {
        toast({
          title: "Visit Request Created",
          description: "The visit has been successfully created.",
        });

        onVisitAdded(result.visit);
        setCreateOpen(false);
        form.reset();
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message,
        });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred.",
      });
    } finally {
      setLoading(false);
    }
  }

  /* ================= CONTENT BLOCKS ================= */

  const MeasurementVisitContent = (
    <div className="space-y-6">
      <FormField
        control={form.control}
        name="selectionId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Link to Selection (Optional)</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || "none"}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a pre-made selection..." />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {selections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    Selection #{s.id} ({s.totalPcs} pcs)
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
        name="measurements"
        render={() => (
          <FormItem>
            <FormLabel>Type of Measurement</FormLabel>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {measurementItems.map((item) => (
                <FormField
                  key={item.id}
                  control={form.control}
                  name="measurements"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value?.includes(item.id)}
                          onCheckedChange={(checked) =>
                            checked
                              ? field.onChange([...(field.value || []), item.id])
                              : field.onChange(
                                  field.value?.filter((v) => v !== item.id)
                                )
                          }
                        />
                      </FormControl>
                      <FormLabel className="font-normal">
                        {item.label}
                      </FormLabel>
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {watchedMeasurements?.includes("blinds-measurement") && (
        <FormField
          control={form.control}
          name="blinds"
          render={() => (
            <FormItem>
              <FormLabel>Select Blinds</FormLabel>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {subMeasurementBlinds.map((item) => (
                  <FormField
                    key={item.id}
                    control={form.control}
                    name="blinds"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(item.id)}
                            onCheckedChange={(checked) =>
                              checked
                                ? field.onChange([
                                    ...(field.value || []),
                                    item.id,
                                  ])
                                : field.onChange(
                                    field.value?.filter((v) => v !== item.id)
                                  )
                            }
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          {item.label}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );

  const DeliveryVisitContent = (
    <div className="space-y-6 overflow-auto">
    <FormField
        control={form.control}
        name="enableOrder"
        render={({ field }) => (
          <FormItem className="flex items-center justify-between rounded-md border p-3">
            <div>
              <FormLabel>Attach Order</FormLabel>
              <p className="text-xs text-muted-foreground">
                Enable to select order & delivery items
              </p>
            </div>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="orderId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Select Order Number</FormLabel>
            <Select
              onValueChange={(value) => {
                field.onChange(value);
                form.setValue("deliveryInstallations", [], {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
              value={field.value || ""}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select an order to associate with this visit" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {orders.map((order) => (
                  <SelectItem key={order.id} value={order.orderNo}>
                    {order.orderNo}
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
        name="deliveryInstallations"
        render={() => (
          <FormItem>
            <FormLabel>Delivery Items</FormLabel>
            {!selectedOrderNo ? (
              <p className="text-sm text-muted-foreground">
                Select an order number to load item list.
              </p>
            ) : deliveryItemsLoading ? (
              <p className="text-sm text-muted-foreground">Loading order items...</p>
            ) : deliveryOrderItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No items found in selected order.
              </p>
            ) : (
              <div className="space-y-3 grid grid-cols-3 justify-between items-center gap-2">
                {deliveryOrderItems.map((item) => {
                  const selected = selectedDeliveryMap.get(item.id);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-md border p-3"
                    >
                      <Checkbox
                        checked={!!selected}
                        onCheckedChange={(checked) =>
                          toggleDeliveryItem(item.id, item.qty, !!checked)
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          Order Qty: {item.qty}
                        </p>
                      </div>
                      {selected ? (
                        <Input
                          type="number"
                          min="1"
                          step="any"
                          inputMode="decimal"
                          className="h-8 w-20"
                          value={selected.noOfPcs || String(item.qty)}
                          onChange={(e) =>
                            updateDeliveryItemQty(item.id, e.target.value)
                          }
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      {selectedDeliveryRows.length > 0 ? (
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="mb-2 text-sm font-semibold">Selected Delivery Items</p>
          <div className="space-y-1">
            {selectedDeliveryRows.map((row, index) => (
              <div
                key={`${row.id}-${index}`}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate pr-2">{row.id}</span>
                <span className="font-medium">{row.noOfPcs || "1"} pcs</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <FormField
        control={form.control}
        name="otherDelivery"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <Input placeholder="Other delivery item..." {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );

  const FittingVisitContent = (
    <div className="space-y-6">
      <FormField
        control={form.control}
        name="orderId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Select Order Number</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || ""}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select an order to associate with this visit" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {orders.map((order) => (
                  <SelectItem key={order.id} value={order.orderNo}>
                    {order.orderNo}
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
        name="fittingInstallations"
        render={() => (
          <FormItem>
            <FormLabel>Type of Fitting/Installation</FormLabel>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {fittingInstallationOptions.map((opt, index) => (
                <Controller
                  key={opt.id}
                  control={form.control}
                  name={`fittingInstallations.${index}`}
                  render={({ field }) => (
                    <div className="flex items-center gap-2 p-2 border rounded-md">
                      <Checkbox
                        checked={!!field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(
                            checked ? { id: opt.id, noOfPcs: "1" } : null
                          );
                        }}
                      />
                      <Label className="flex-grow">{opt.label}</Label>

                      {field.value && (
                        <Input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          className="w-16 h-8"
                          placeholder="Pcs"
                          value={field.value.noOfPcs || "1"}
                          onChange={(e) =>
                            field.onChange({
                              ...field.value,
                              noOfPcs: e.target.value,
                            })
                          }
                        />
                      )}
                    </div>
                  )}
                />
              ))}

              <FormField
                control={form.control}
                name="otherFitting"
                render={({ field }) => (
                  <FormItem className="col-span-full">
                    <FormControl>
                      <Input placeholder="Other fitting type..." {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </FormItem>
        )}
      />

      {watchedFittingInstallations?.some(
        (d) => d?.id === "blind-installation"
      ) && (
        <FormField
          control={form.control}
          name="subFittingInstallations"
          render={() => (
            <FormItem>
              <FormLabel>Select Sub Fitting Installation</FormLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {subDeliveryInstallationOptions.map((opt, index) => (
                  <Controller
                    key={opt.id}
                    control={form.control}
                    name={`subFittingInstallations.${index}`}
                    render={({ field }) => (
                      <div className="flex items-center gap-2 p-2 border rounded-md">
                        <Checkbox
                          checked={!!field.value}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked ? { id: opt.id, noOfPcs: "1" } : null
                            )
                          }
                        />
                        <Label className="flex-grow">{opt.label}</Label>

                        {field.value && (
                          <Input
                            type="number"
                            step="any"
                            inputMode="decimal"
                            className="w-16 h-8"
                            placeholder="Pcs"
                            value={field.value.noOfPcs || "1"}
                            onChange={(e) =>
                              field.onChange({
                                ...field.value,
                                noOfPcs: e.target.value,
                              })
                            }
                          />
                        )}
                      </div>
                    )}
                  />
                ))}
              </div>
            </FormItem>
          )}
        />
      )}
    </div>
  );

  const ComplaintVisitContent = (
    <div className="space-y-6">
      <FormField
        control={form.control}
        name="orderId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Related Order Number (Optional)</FormLabel>
            <Select
              onValueChange={(value) =>
                field.onChange(value === NO_ORDER_VALUE ? "" : value)
              }
              value={field.value || NO_ORDER_VALUE}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select related order if applicable" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={NO_ORDER_VALUE}>No related order</SelectItem>
                {orders.map((order) => (
                  <SelectItem key={order.id} value={order.orderNo}>
                    {order.orderNo}
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
        name="complaintType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Type of Complaint *</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || ""}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select complaint type" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {complaintTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.label}
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
        name="complaintPriority"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Priority Level</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || "medium"}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="complaintDescription"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Complaint Details *</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Describe the complaint in detail..."
                className="min-h-[120px]"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );

  const SampleShowingContent = (
  <div className="space-y-6">
    <FormField
      control={form.control}
      name="sampleShowingItems"
      render={() => (
        <FormItem>
          <FormLabel>Sample Categories to Show</FormLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sampleShowingCategories.map((item) => (
              <FormField
                key={item.id}
                control={form.control}
                name="sampleShowingItems"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value?.includes(item.id)}
                        onCheckedChange={(checked) =>
                          checked
                            ? field.onChange([...(field.value || []), item.id])
                            : field.onChange(
                                field.value?.filter((v) => v !== item.id)
                              )
                        }
                      />
                    </FormControl>
                    <FormLabel className="font-normal">
                      {item.label}
                    </FormLabel>
                  </FormItem>
                )}
              />
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />

    <FormField
      control={form.control}
      name="sampleShowingNotes"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Additional Notes</FormLabel>
          <FormControl>
            <Textarea
              placeholder="Specify particular designs, colors, or styles to show..."
              className="min-h-[100px]"
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </div>
);

const CollectionContent = (
  <div className="space-y-6">
    <FormField
      control={form.control}
      name="orderId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Related Order Number (Optional)</FormLabel>
          <Select
            onValueChange={(value) =>
              field.onChange(value === NO_ORDER_VALUE ? "" : value)
            }
            value={field.value || NO_ORDER_VALUE}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select related order if applicable" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NO_ORDER_VALUE}>No related order</SelectItem>
              {orders.map((order) => (
                <SelectItem key={order.id} value={order.orderNo}>
                  {order.orderNo}
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
      name="collectionItems"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Items to Collect</FormLabel>
          <FormControl>
            <Textarea
              placeholder="List items to be collected from customer..."
              className="min-h-[100px]"
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />

    <FormField
      control={form.control}
      name="collectionNotes"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Collection Notes</FormLabel>
          <FormControl>
            <Textarea
              placeholder="Any special instructions for collection..."
              className="min-h-[80px]"
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </div>
);

const OtherVisitContent = (
  <div className="space-y-6">
    <FormField
      control={form.control}
      name="remark"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Visit Purpose & Details *</FormLabel>
          <FormControl>
            <Textarea
              placeholder="Describe the purpose and details of this visit..."
              className="min-h-[150px]"
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </div>
);

  /* ================= UI ================= */

  return (
    <>
      {/* Trigger button */}
      {!hideCreateButton && (
        <div className="mt-6 flex justify-end">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Visit
          </Button>
        </div>
      )}

      {/* Create Visit Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-auto">  
          <DialogHeader>
            <DialogTitle>Create New Visit</DialogTitle>
            <DialogDescription>
              Fill visit details and submit. Payload/save logic remains unchanged.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Top grid */}
              <div className="grid grid-cols-3 gap-4">
                {/* Due Date */}
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem className="col-span-2 sm:col-span-1">
                      <FormLabel>Visit Day / Due Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Representative */}
                <FormField
                  control={form.control}
                  name="representative"
                  render={({ field }) => (
                    <FormItem className="col-span-2 sm:col-span-1">
                      <FormLabel>Representative *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select representative" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {salesman.map((s) => (
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

                {/* Category */}
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <Label>Category *</Label>
                  <Select
                    value={activeTab}
                    onValueChange={(val) => {
                      if (val === "measurement" && hasMeasurementVisit) return;
                      setActiveTab(val as any);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Category *" />
                    </SelectTrigger>
                    <SelectContent>
                      {VISIT_TYPES.map((t) => (
                        <SelectItem
                          key={t.value}
                          value={t.value}
                          disabled={t.value === "measurement" && hasMeasurementVisit}
                        >
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hasMeasurementVisit && (
                    <p className="text-xs text-muted-foreground">
                      Measurement visit already exists for this deal.
                    </p>
                  )}
                </div>

                {/* Address Source */}
                <div>
                  {savedAddresses.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Address Source
                      </Label>
                      <Select
                        value={addressMode}
                        onValueChange={(val) =>
                          setAddressMode(val as "saved" | "new")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose address source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="saved">Saved address</SelectItem>
                          <SelectItem value="new">Add new address</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Address Selection/Input */}
                {addressMode === "saved" && savedAddresses.length > 0 ? (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Saved Addresses
                    </Label>
                    <Select
                      value={selectedAddressIndex}
                      onValueChange={setSelectedAddressIndex}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select saved address" />
                      </SelectTrigger>
                      <SelectContent>
                        {savedAddresses.map((addr, index) => {
                          const addressText = addr.address || `Address ${index + 1}`;
                          const landmarkText = addr.landmark
                            ? ` - ${addr.landmark}`
                            : "";
                          return (
                            <SelectItem
                              key={`${addressText}-${index}`}
                              value={`${index}`}
                            >
                              {`Address ${index + 1}: ${addressText}${landmarkText}`}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="Full address"
                      value={addressDraft.address}
                      onChange={(e) =>
                        setAddressDraft((prev) => ({
                          ...prev,
                          address: e.target.value,
                        }))
                      }
                    />
                    <Input
                      placeholder="Landmark (optional)"
                      value={addressDraft.landmark}
                      onChange={(e) =>
                        setAddressDraft((prev) => ({
                          ...prev,
                          landmark: e.target.value,
                        }))
                      }
                    />
                  </div>
                )}
                <div></div>
              </div>

              <Separator />

              {/* Dynamic section based on category */}
              {activeTab === "measurement" && MeasurementVisitContent}
              {activeTab === "delivery" && DeliveryVisitContent}
              {activeTab === "fittings" && FittingVisitContent}
              {activeTab === "complaint" && ComplaintVisitContent}
              {activeTab === "Collection" && CollectionContent}
              {activeTab === "Sample Showing" && SampleShowingContent}
              {activeTab === "other" && OtherVisitContent}

              {/* Remark field (only show if not "other" since other has its own remark) */}
              {activeTab !== "other" && (
                <FormField
                  control={form.control}
                  name="remark"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remark / Additional Note</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any special instruction, note, landmark, etc..."
                          className="min-h-[90px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreateOpen(false);
                    form.reset();
                  }}
                >
                  Cancel
                </Button>

                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Visit
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
