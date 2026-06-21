"use client";

import { useState, useEffect, useMemo, useCallback, memo, useTransition, useRef } from "react";
import { useForm, useFieldArray, useWatch, Control, UseFormReturn, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Customer, Deal, DealProduct, Quotation, VasDetail, Stock, User } from "@/lib/types";
import { Loader2, Trash2, CalendarIcon, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Separator } from "@/components/ui/separator";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import {
  createQuotationAction,
  updateConvertedQuotationAction,
} from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { roomOptions, vasOptions, storeOptions } from "@/lib/constants";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  searchStockByBcn,
  searchVasStockServicesAction,
  upsertVasStockItemsAction,
} from "@/app/dashboard/inventory/actions";

// ═══════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════

type BcnType = "fabric" | "foam" | "tassel" | "hardware";
type QuotationDialogMode = "create" | "clone" | "edit";

interface CreateQuotationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  deal: Deal;
  customer: Customer;
  initialItems: DealProduct[];
  initialVasDetails: VasDetail[];
  initialQuotation?: Quotation | null;
  mode?: QuotationDialogMode;
}

const DEFAULT_ADD_ITEM_STATE = {
  bcn: "",
  description: "",
  quantity: "1",
  rate: "",
  discountPercent: "0",
  room: "",
  noOfPcs: "1",
  remark: "",
  gstMode: "INCL" as "EXCL" | "INCL",
  categoryGroup: "", // ✅ ADDED
};

const DESCRIPTION_OPTIONS: ComboboxOption[] = [
  { value: 'Curtain', label: 'Curtain' },
  { value: 'Sofa', label: 'Sofa' },
  { value: 'Wallpaper', label: 'Wallpaper' },
  { value: 'Blinds', label: 'Blinds' },
];

// ═══════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════

export const itemDetailSchema = z.object({
  id: z.string().optional(),
  collectionBrand: z.string().min(1, "Collection/Brand is required"),
  serialNo: z.string().optional(),
  salesDescription: z.string().min(1, "Description is required"),
  unit: z.string().optional(),
  stockUnit: z.string().optional(),
  quantity: z.preprocess(
    (val) => val === '' || val == null ? 0 : (typeof val === "string" ? parseFloat(val) : Number(val)),
    z.number().min(0, "Quantity must be non-negative")
  ),
  rate: z.preprocess(
    (val) => val === '' || val == null ? 0 : (typeof val === "string" ? parseFloat(val) : Number(val)),
    z.number().min(0, "Rate must be non-negative")
  ),
  exclusiveRate: z.number().optional(),
  originalMrp: z.number().optional(),
  subtotal: z.number().optional(),
  discountPercent: z.preprocess(
    (val) => val === '' || val == null ? 0 : (typeof val === "string" ? parseFloat(val) : Number(val)),
    z.number().min(0).max(100).optional()
  ),
  discount: z.number().optional(),
  taxableAmt: z.number().optional(),
  gstAmount: z.number().optional(),
  totalAmount: z.number().optional(),
  bcnType: z.enum(["fabric", "foam", "tassel", "hardware"]).optional(),
  gstPercent: z.preprocess(
    (val) => val === "" || val == null ? 0 : (typeof val === "string" ? parseFloat(val) : Number(val)),
    z.number().min(0).max(100).optional()
  ),
  gstMode: z.enum(["EXCL", "INCL"]),
  cgst: z.number().optional(),
  sgst: z.number().optional(),
  igst: z.number().optional(),
  room: z.string().optional(),
  noOfPcs: z.string().optional(),
  remark: z.string().optional(),
  stitchingType: z.string().optional(),
  categoryGroup: z.string().optional().default(""), // ✅ ADDED
});

export const vasDetailSchema = z.object({
  vasName: z.string().min(1, "VAS name is required"),
  rate: z.string().min(1, "Rate is required"),
  quantity: z.string().min(1, "Quantity is required"),
  room: z.string().optional(),
  gstPercent: z.preprocess(
    (val) => val === "" || val == null ? 0 : (typeof val === "string" ? parseFloat(val) : Number(val)),
    z.number().min(0).max(100)
  ),
  taxableAmt: z.number().optional(),
  cgst: z.number().optional(),
  sgst: z.number().optional(),
  igst: z.number().optional(),
});

const createQuotationFormSchema = z.object({
  company: z.string().optional(),
  store: z.string().min(1, "Store is required"),
  date: z.date({ required_error: "Date is required." }),
  validTillDate: z.date().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  billingName: z.string().optional(),
  billingAddress: z.string().optional(),
  dealName: z.string().min(1, "Deal name is required"),
  items: z.array(itemDetailSchema),
  vasDetails: z.array(vasDetailSchema).optional(),
  sendEmail: z.boolean().default(false),
  sendSms: z.boolean().default(false),
  representativeId: z.string().optional(),
  advance: z.coerce.number().min(0).optional(),
});

export type FormValues = z.infer<typeof createQuotationFormSchema>;

// ═══════════════════════════════════════════════════════════
// PURE HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

function normalizeBcnType(input: unknown): BcnType | undefined {
  const t = String(input || "").trim().toLowerCase();
  if (["fabric", "fabrics"].includes(t)) return "fabric";
  if (["foam", "foams"].includes(t)) return "foam";
  if (["tassel", "tassels", "fringe", "fringes"].includes(t)) return "tassel";
  if (["hardware", "hardwares"].includes(t)) return "hardware";
  return undefined;
}

function gstPercentForBcnType(bcnType?: string): number {
  if (bcnType === "foam" || bcnType === "hardware") return 18;
  if (bcnType === "fabric" || bcnType === "tassel") return 5;
  return 5;
}

function normalizeStockUnit(value: unknown, fallback = ""): string {
  const raw = String(value || fallback).trim();
  if (!raw) return "";
  
  const normalized = raw.toUpperCase();
  if (["M", "MTR", "METER", "METRE", "METERS", "METRES"].includes(normalized)) return "Mtr";
  if (["PC", "PCS", "PIECE", "PIECES"].includes(normalized)) return "Pcs";
  return raw;
}

function resolveStockRate(stock?: Stock | null): number {
  if (!stock) return 0;
  
  const rrp = Number((stock as any).rrpWithGstRs);
  if (Number.isFinite(rrp) && rrp > 0) return rrp;
  
  const mrp = Number(stock.mrp);
  if (Number.isFinite(mrp) && mrp > 0) return mrp;
  
  const clPrice = Number(stock.clPrice);
  if (Number.isFinite(clPrice) && clPrice > 0) return clPrice;
  
  const rlPrice = Number(stock.rlPrice);
  if (Number.isFinite(rlPrice) && rlPrice > 0) return rlPrice;
  
  return 0;
}

function resolveVasGst(stock?: Stock | null): number {
  const value = Number((stock as any)?.gstPercent);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function parseDateValue(value?: string | Date | null): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  
  if (typeof value === "object" && "_seconds" in (value as any)) {
    const seconds = (value as any)._seconds || 0;
    const nanos = (value as any)._nanoseconds || 0;
    const parsed = new Date(seconds * 1000 + nanos / 1e6);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  
  return undefined;
}

async function fetchStockTypeMapByBcn(bcns: string[]): Promise<Map<string, any>> {
  const uniqueBcns = Array.from(new Set(bcns.filter(Boolean)));
  const chunks: string[][] = [];
  
  for (let i = 0; i < uniqueBcns.length; i += 10) {
    chunks.push(uniqueBcns.slice(i, i + 10));
  }

  const map = new Map<string, any>();

  await Promise.all(
    chunks.map(async (chunk) => {
      const q = query(collection(db, "stocks"), where("bcn", "in", chunk));
      const snap = await getDocs(q);
      
      snap.forEach((doc) => {
        const data = doc.data();
        if (data?.bcn) map.set(String(data.bcn), data);
      });
    })
  );

  return map;
}

function calculateItemTotals(item: any) {
  const quantity = Number(item.quantity) || 0;
  const gstFromItem = Number(item.gstPercent);
  const resolvedGst = Number.isFinite(gstFromItem) && gstFromItem > 0
    ? gstFromItem
    : gstPercentForBcnType(item.bcnType);
  const gstMode = item.gstMode === "EXCL" ? "EXCL" : "INCL";
  const rawRate = Number(item.rate) || 0;
  const storedExclusiveRate = Number(item.exclusiveRate);
  const exclusiveRate =
    rawRate > 0
      ? gstMode === "EXCL" || resolvedGst <= 0
        ? rawRate
        : rawRate / (1 + resolvedGst / 100)
      : Number.isFinite(storedExclusiveRate) && storedExclusiveRate > 0
      ? storedExclusiveRate
      : 0;
  const subtotal = quantity * exclusiveRate;
  const discountPercent = Number(item.discountPercent) || 0;
  const discount = subtotal * (discountPercent / 100);
  const taxableAmt = subtotal - discount;
  const totalGst = taxableAmt * (resolvedGst / 100);
  const totalAmount = taxableAmt + totalGst;
  
  const cgst = totalGst / 2;
  const sgst = totalGst / 2;
  const igst = 0;
  
  return {
    ...item,
    gstPercent: resolvedGst,
    gstMode,
    quantity,
    rate: rawRate,
    exclusiveRate,
    discountPercent,
    subtotal,
    discount,
    taxableAmt,
    gstAmount: totalGst,
    totalAmount,
    cgst,
    sgst,
    igst,
  };
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export function CreateQuotationDialog({
  isOpen,
  onOpenChange,
  onSuccess,
  deal,
  customer,
  initialItems,
  initialVasDetails,
  initialQuotation,
  mode,
}: CreateQuotationDialogProps) {
  const { toast } = useToast();
  const { user, firebaseUser } = useAuth();
  const [isPending, startTransition] = useTransition();

  // ─── State ───────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [bcnOptions, setBcnOptions] = useState<{ value: string; label: string; stockItem: Stock }[]>([]);
  const [isSearchingBcn, setIsSearchingBcn] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [salesmen, setSalesmen] = useState<User[]>([]);
  const [addItem, setAddItem] = useState({ ...DEFAULT_ADD_ITEM_STATE });
  const initSignatureRef = useRef("");
  const dialogMode: QuotationDialogMode =
    mode || (initialQuotation ? "clone" : "create");
  const isCloneMode = dialogMode === "clone";
  const isEditMode = dialogMode === "edit";

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await getDocs(
          query(collection(db, "users"), where("role", "==", "salesman"))
        );
        if (cancelled) return;
        setSalesmen(
          snapshot.docs
            .map((docItem) => ({ id: docItem.id, ...docItem.data() } as User))
            .sort((left, right) => left.name.localeCompare(right.name))
        );
      } catch (error) {
        console.error("Failed to load SM options:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // ─── Form ────────────────────────────────────────────────
  const form = useForm<FormValues>({
    resolver: zodResolver(createQuotationFormSchema),
    defaultValues: {
      store: user?.store || "MO GCR BRANCH",
      company: 'MO DESIGNS PRIVATE LIMITED',
      date: new Date(),
      items: [],
      vasDetails: [],
      sendEmail: false,
      sendSms: false,
    },
  });

  useEffect(() => {
    if (!isOpen || form.getValues("representativeId")) return;
    const assignedId = String(
      deal.assignedSalesPerson?.id || deal.representativeId || ""
    ).trim();
    const assignedName = String(deal.assignedSalesPerson?.name || "")
      .trim()
      .toLowerCase();
    const matchingSalesman = assignedName
      ? salesmen.find(
          (salesman) => salesman.name.trim().toLowerCase() === assignedName
        )
      : undefined;
    const resolvedId = assignedId || matchingSalesman?.id || "";
    if (resolvedId) {
      form.setValue("representativeId", resolvedId, {
        shouldDirty: false,
        shouldValidate: true,
      });
    }
  }, [
    deal.assignedSalesPerson?.id,
    deal.assignedSalesPerson?.name,
    deal.representativeId,
    form,
    isOpen,
    salesmen,
  ]);

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // ─── BCN Search Handlers ─────────────────────────────────

  const handleBcnSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setBcnOptions([]);
      return;
    }
    
    setIsSearchingBcn(true);
    try {
      const results = await searchStockByBcn(query);
      const mapped = results.map(stock => ({
        value: stock.bcn || stock.id,
        label: `${stock.bcn || stock.id}${stock.itemName ? ` - ${stock.itemName}` : ""}`,
        stockItem: stock
      }));
      
      startTransition(() => {
        setBcnOptions(mapped);
      });
    } catch (error) {
      console.error("BCN search error:", error);
      toast({ variant: "destructive", title: "Search failed" });
    } finally {
      setIsSearchingBcn(false);
    }
  }, [toast]);

  const handleBcnSelect = useCallback((value: string) => {
    const selectedOption = bcnOptions.find(opt => opt.value === value);
    
    if (!selectedOption) {
      setSelectedStock(null);
      setAddItem((prev) => ({ ...prev, bcn: value, categoryGroup: "" }));
      return;
    }

    const stockItem = selectedOption.stockItem;
    console.log("Adding item with details:", stockItem);
    const resolvedRate = resolveStockRate(stockItem);
    
    // ✅ Extract Category Group intelligently
    let extractedCategory = "";
    if (stockItem.categoryGroup ) {
      extractedCategory = stockItem.categoryGroup || "-";
    }

    setSelectedStock(stockItem);
    setAddItem((prev) => ({
      ...prev,
      bcn: stockItem.bcn || stockItem.id,
      description: stockItem.itemName || prev.description,
      rate: String(resolvedRate),
      categoryGroup: extractedCategory, // ✅ ADDED
    }));
  }, [bcnOptions]);

  const handleAddItem = useCallback(() => {
    const quantity = Number(addItem.quantity) || 0;
    
    if (!addItem.bcn) {
      toast({ variant: "destructive", title: "Missing BCN", description: "Please select a BCN to add." });
      return;
    }
    
    if (quantity <= 0) {
      toast({ variant: "destructive", title: "Invalid Quantity", description: "Quantity must be greater than 0." });
      return;
    }

    const rateValue = Number(addItem.rate) || resolveStockRate(selectedStock);
    const discountPercent = Number(addItem.discountPercent) || 0;

    if (rateValue <= 0) {
      toast({
        variant: "destructive",
        title: "Missing Rate",
        description: "No stock rate is available. Please enter the rate manually.",
      });
      return;
    }

    const resolvedBcnType = normalizeBcnType(selectedStock?.type) || "fabric";
    const gstPercent = gstPercentForBcnType(resolvedBcnType);
    const fallbackUnit = resolvedBcnType === "fabric" ? "Mtr" : "Pcs";
    const resolvedStockUnit = normalizeStockUnit(selectedStock?.unit, fallbackUnit);
    

    appendItem({
      id: `manual-${Date.now()}`,
      collectionBrand: addItem.bcn,
      serialNo: selectedStock?.serialNo || "",
      salesDescription: addItem.description || selectedStock?.itemName || addItem.bcn,
      unit: resolvedStockUnit,
      stockUnit: resolvedStockUnit,
      quantity,
      rate: rateValue,
      originalMrp: rateValue,
      discountPercent,
      bcnType: resolvedBcnType,
      gstPercent,
      gstMode: addItem.gstMode as "EXCL" | "INCL",
      subtotal: 0,
      discount: 0,
      taxableAmt: 0,
      gstAmount: 0,
      totalAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      room: addItem.room || "",
      noOfPcs: addItem.noOfPcs || "1",
      remark: addItem.remark || "",
      stitchingType: "",
      categoryGroup: addItem.categoryGroup || "", // ✅ ADDED
    });

    setAddItem({ ...DEFAULT_ADD_ITEM_STATE });
    setSelectedStock(null);
    setBcnOptions([]);
  }, [addItem, selectedStock, appendItem, toast]);

  // ─── Form Initialization ─────────────────────────────────

  useEffect(() => {
    if (!isOpen) {
      setAddItem({ ...DEFAULT_ADD_ITEM_STATE });
      setSelectedStock(null);
      setBcnOptions([]);
      initSignatureRef.current = "";
      return;
    }

    const initSignature = JSON.stringify({
      dealId: deal?.id || "",
      customerId: customer?.id || "",
      quotationId: initialQuotation?.id || "",
      quotationUpdatedAt: (initialQuotation as any)?.updatedAt || "",
      dialogMode,
      userStore: user?.store || "",
      items: (initialItems || []).map((item: any) => [
        item.id || "",
        item.collectionBrand || "",
        item.salesDescription || "",
        item.quantity || "",
        item.rate || "",
        item.mrp || "",
        item.gstPercent || "",
        item.gstMode || "",
        item.room || "",
        item.categoryGroup || item.fabricCategoryGroup || "",
      ]),
      vasDetails: (initialVasDetails || []).map((vas: any) => [
        vas.vasName || "",
        vas.quantity || "",
        vas.rate || "",
        vas.gstPercent || "",
        vas.room || "",
      ]),
    });

    if (initSignatureRef.current === initSignature) {
      return;
    }

    let cancelled = false;
    (async () => {
      if (!deal || !customer) return;

      try {
        const bcns = initialItems
          .map((it: any) => String(it.collectionBrand || it.bcn || "").trim())
          .filter(Boolean);

        const stockMap = await fetchStockTypeMapByBcn(bcns);
        if (cancelled) return;

        const itemsForForm = initialItems.map((item: any, idx) => {
          const resolvedCollectionBrand = String(
            item.collectionBrand ||
            item.bcn ||
            item.itemName ||
            item.productCategory ||
            `Item ${idx + 1}`
          ).trim();
          const bcn = resolvedCollectionBrand;
          const stock = stockMap.get(bcn);

          let resolvedBcnType: BcnType | undefined;
          if (item.productType === 'Hardware') {
            resolvedBcnType = 'hardware';
          } else {
            resolvedBcnType = normalizeBcnType(stock?.type) || "fabric";
          }
          
          const storedGst = Number(item.gstPercent);
          const detectedGst =
            Number.isFinite(storedGst) && storedGst >= 0
              ? storedGst
              : gstPercentForBcnType(resolvedBcnType);
          const fallbackUnit = resolvedBcnType === "fabric" ? "Mtr" : "Pcs";
          const resolvedStockUnit = normalizeStockUnit(item.stockUnit || item.unit || stock?.unit, fallbackUnit);

          let effectiveRate = 0;
          if (item.rate != null && !isNaN(Number(item.rate))) effectiveRate = Number(item.rate);
          if (effectiveRate === 0 && item.mrp != null && !isNaN(Number(item.mrp))) effectiveRate = Number(item.mrp);

          const originalMrp = item.mrp != null ? Number(item.mrp) : effectiveRate;

          let description =
            item.salesDescription ||
            item.subCategory ||
            item.productCategory ||
            item.itemName ||
            resolvedCollectionBrand;
          if (item.productType === "Hardware") {
            const fallback = item.subCategory ? `${item.productCategory} → ${item.subCategory}` : item.productCategory;
            description = item.itemName || stock?.itemName || item.salesDescription || fallback || resolvedCollectionBrand;
          } else if (item.productType === "VAS") {
            description = item.subCategory ? `${item.productCategory} → ${item.subCategory}` : item.productCategory;
          }
          const normalizedDescription = String(description || resolvedCollectionBrand).trim() || `Item ${idx + 1}`;

          // ✅ Extract Category Group from various possible field names
          const catGroup = item.fabricCategoryGroup || item.categoryGroup || item.productCategory || "-";

          return {
            id: item.id || `item-${idx}`,
            collectionBrand: resolvedCollectionBrand,
            serialNo: item.serialNo || "",
            salesDescription: normalizedDescription,
            unit: resolvedStockUnit,
            stockUnit: resolvedStockUnit,
            quantity: Number(item.quantity) || 0,
            rate: effectiveRate,
            exclusiveRate:
              Number.isFinite(Number(item.exclusiveRate)) &&
              Number(item.exclusiveRate) >= 0
                ? Number(item.exclusiveRate)
                : undefined,
            originalMrp,
            discountPercent: Number(item.discountPercent) || 0,
            bcnType: resolvedBcnType,
            gstPercent: detectedGst,
            gstMode: item.gstMode || "INCL",
            subtotal: 0,
            discount: 0,
            taxableAmt: 0,
            gstAmount: 0,
            totalAmount: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            room: item.room || "",
            noOfPcs: item.noOfPcs || "1",
            remark: item.remarks || "",
            stitchingType: item.stitchingType || "",
            categoryGroup: catGroup, // ✅ ADDED
          };
        });

        const vasForForm = (initialVasDetails || []).map((vas: any) => ({
          vasName: vas.vasName,
          rate: String(vas.rate),
          quantity: String(vas.quantity),
          gstPercent: Number(vas.gstPercent ?? 0),
          room: vas.room || "",
          taxableAmt: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
        }));

        form.reset({
          store: initialQuotation?.store || user?.store || "MO GCR BRANCH",
          company: initialQuotation?.company || "MO DESIGNS PRIVATE LIMITED",
          date: parseDateValue(initialQuotation?.date) || new Date(),
          validTillDate: parseDateValue(initialQuotation?.validTillDate),
          customerName:
            initialQuotation?.customerName ||
            customer.name ||
            (customer as any).customerName ||
            customer.customerId ||
            "Customer",
          billingName:
            initialQuotation?.billingName ||
            customer.name ||
            (customer as any).customerName ||
            customer.customerId ||
            "Customer",
          billingAddress:
            (initialQuotation as any)?.billingAddress ||
            customer.billingAddress?.line1 ||
            customer.addressPinCode,
          dealName:
            initialQuotation?.dealName ||
            deal.title ||
            deal.dealName ||
            (deal as any).name ||
            deal.id ||
            "Deal",
          items: itemsForForm,
          vasDetails: vasForForm,
          sendEmail: false,
          sendSms: false,
          representativeId: initialQuotation?.representativeId || deal.assignedSalesPerson?.id || deal.representativeId,
        });
        if (cancelled) return;
        initSignatureRef.current = initSignature;

        setView("edit");
      } catch (error) {
        console.error("Failed to initialize quotation form:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    deal,
    customer,
    initialItems,
    initialVasDetails,
    initialQuotation,
    dialogMode,
    user,
    form,
  ]);

  // ─── Submission Handlers ─────────────────────────────────

  const handleCreateQuotation = useCallback(async () => {
    const values = form.getValues();
    
    if (!user) {
      toast({ variant: "destructive", title: "Not authenticated." });
      return;
    }
    
    setLoading(true);

    const normalizedItems = values.items.map((item) => {
      const itemBcnType = String(item.bcnType || "").toLowerCase();
      const fallbackUnit = itemBcnType && itemBcnType !== "fabric" ? "Pcs" : "Mtr";
      const resolvedStockUnit = normalizeStockUnit(item.stockUnit || item.unit, fallbackUnit);

      return calculateItemTotals({
        ...item,
        unit: resolvedStockUnit,
        stockUnit: resolvedStockUnit,
      });
    });

    const valuesForCreate = {
      ...values,
      items: normalizedItems,
      createdBy: user.name || user.id,
    };

    const totalAmount = normalizedItems.reduce((sum, item) => {
      return sum + (Number(item.totalAmount) || 0);
    }, 0);

    const vasTotal = (values.vasDetails || []).reduce((sum, vas) => {
      const taxableAmount = (Number(vas.rate) || 0) * (Number(vas.quantity) || 0);
      const gstPercent = Number(vas.gstPercent) || 0;
      return sum + taxableAmount + taxableAmount * (gstPercent / 100);
    }, 0);

    try {
      const quotationResult =
        isEditMode && initialQuotation
          ? await updateConvertedQuotationAction(
              customer.id,
              deal.id,
              initialQuotation.id,
              valuesForCreate,
              totalAmount + vasTotal,
              {
                id: user.id,
                name: user.name || user.email || user.id,
                role: user.role,
                designation: user.designation,
                authToken: await firebaseUser?.getIdToken(),
              }
            )
          : await createQuotationAction(
              customer.id,
              deal.id,
              valuesForCreate,
              totalAmount + vasTotal
            );

      if (quotationResult.success) {
        toast({
          title: isEditMode
            ? "Quotation Updated"
            : isCloneMode
              ? "Quotation Cloned"
              : "Quotation Created",
          description: quotationResult.message,
        });
        form.reset();
        onSuccess();
        onOpenChange(false);
      } else {
        toast({
          variant: "destructive",
          title: isEditMode
            ? "Quotation Update Failed"
            : isCloneMode
              ? "Quotation Clone Failed"
              : "Quotation Creation Failed",
          description: quotationResult.message,
        });
      }
    } catch (error) {
      console.error("Quotation creation error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: isEditMode
          ? "Failed to update the converted quotation."
          : isCloneMode
            ? "Failed to clone the quotation."
            : "Failed to create the quotation.",
      });
    } finally {
      setLoading(false);
    }
  }, [
    form,
    user,
    customer.id,
    deal.id,
    initialQuotation,
    isCloneMode,
    isEditMode,
    toast,
    onSuccess,
    onOpenChange,
  ]);

  const handleProceed = useCallback(async () => {
    const isValid = await form.trigger();
    if (isValid) {
      setView('preview');
      return;
    }

    const errors = form.formState.errors as any;
    const itemErrors = Array.isArray(errors?.items) ? errors.items.filter(Boolean).length : 0;
    const headerKeys = ["store", "date", "customerName", "dealName"]
      .filter((key) => Boolean(errors?.[key]))
      .join(", ");

    const description =
      itemErrors > 0
        ? `Please complete ${itemErrors} item row(s).`
        : headerKeys
          ? `Missing/invalid: ${headerKeys}.`
          : "Please fill in all required fields before proceeding.";

    toast({
      variant: 'destructive',
      title: 'Validation Error',
      description,
    });
  }, [form, toast]);

  const handleBack = useCallback(() => {
    setView('edit');
  }, []);

  // ─── Render ──────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {view === 'edit'
              ? isEditMode
                ? `Edit Converted Quotation #${initialQuotation?.quotationNo}`
                : isCloneMode
                  ? `Clone Quotation #${initialQuotation?.quotationNo}`
                  : 'Create Quotation'
              : isEditMode
                ? 'Preview Quotation Correction'
                : isCloneMode
                  ? 'Preview Cloned Quotation'
                  : 'Preview Quotation'}
          </DialogTitle>
          <DialogDescription>
            {view === 'edit'
              ? isEditMode
                ? 'Update the converted quotation. Its linked order will be synchronized when saved.'
                : isCloneMode
                  ? 'Review and update the copied quotation before creating the new quotation.'
                  : 'Fill in the quotation details and add items.'
              : isEditMode
                ? 'Confirm the corrected quotation and linked order values.'
                : isCloneMode
                  ? 'Review the cloned quotation before creating it.'
                  : 'Review the quotation details before creating.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-y-auto pr-4">
          {view === 'edit' ? (
            <QuotationEditForm
              form={form}
              deal={deal}
              salesmen={salesmen}
              itemFields={itemFields}
              removeItem={removeItem}
              addItem={addItem}
              setAddItem={setAddItem}
              bcnOptions={bcnOptions}
              isSearchingBcn={isSearchingBcn}
              onBcnSearch={handleBcnSearch}
              onBcnSelect={handleBcnSelect}
              onAddItem={handleAddItem}
              mode={dialogMode}
            />
          ) : (
            <QuotationPreview
              form={form}
              onBack={handleBack}
              onSubmit={handleCreateQuotation}
              loading={loading}
              mode={dialogMode}
            />
          )}
        </div>

        {view === 'edit' && (
          <DialogFooter className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleProceed}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              Proceed to Preview
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTS (Memoized)
// ═══════════════════════════════════════════════════════════

interface QuotationEditFormProps {
  form: UseFormReturn<FormValues>;
  deal: Deal;
  salesmen: User[];
  itemFields: any[];
  removeItem: (index: number) => void;
  addItem: typeof DEFAULT_ADD_ITEM_STATE;
  setAddItem: React.Dispatch<React.SetStateAction<typeof DEFAULT_ADD_ITEM_STATE>>;
  bcnOptions: { value: string; label: string; stockItem: Stock }[];
  isSearchingBcn: boolean;
  onBcnSearch: (query: string) => void;
  onBcnSelect: (value: string) => void;
  onAddItem: () => void;
  mode: QuotationDialogMode;
}

const QuotationEditForm = memo(function QuotationEditForm({
  form,
  deal,
  salesmen,
  itemFields,
  removeItem,
  addItem,
  setAddItem,
  bcnOptions,
  isSearchingBcn,
  onBcnSearch,
  onBcnSelect,
  onAddItem,
  mode,
}: QuotationEditFormProps) {
  const hasSourceQuotation = mode !== "create";
  return (
    <FormProvider {...form}>
      <form className="space-y-6 py-4">
        <QuotationHeader form={form} deal={deal} salesmen={salesmen} />
        
        <Separator />
        
        <PreviouslySelectedItems
          control={form.control}
          fields={itemFields}
          remove={removeItem}
          isEditing={false}
          isCloning={mode === "clone"}
          isCorrection={mode === "edit"}
        />
        
        <Separator />
        
        <AddItemSection
          addItem={addItem}
          setAddItem={setAddItem}
          bcnOptions={bcnOptions}
          isSearchingBcn={isSearchingBcn}
          onBcnSearch={onBcnSearch}
          onBcnSelect={onBcnSelect}
          onAddItem={onAddItem}
          isEditing={hasSourceQuotation}
        />
        
        <Separator />
        
        <VasForm form={form} />
      </form>
    </FormProvider>
  );
});

const QuotationHeader = memo(function QuotationHeader({
  form,
  deal,
  salesmen,
}: {
  form: UseFormReturn<FormValues>;
  deal: Deal;
  salesmen: User[];
}) {
  const dealNameOption = String(
    deal.title ||
    deal.dealName ||
    (deal as any).name ||
    deal.id ||
    "Deal"
  );
  const assignedSmId = String(
    deal.assignedSalesPerson?.id || deal.representativeId || ""
  ).trim();
  const assignedSmName = String(deal.assignedSalesPerson?.name || "").trim();
  const smOptions = [
    ...(assignedSmId && !salesmen.some((salesman) => salesman.id === assignedSmId)
      ? [{ id: assignedSmId, name: assignedSmName || "Assigned SM" } as User]
      : []),
    ...salesmen,
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <FormField
        control={form.control}
        name="store"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Store*</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a store" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {storeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
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
        name="date"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Date*</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={field.value}
                  onSelect={field.onChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="validTillDate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Valid Till Date</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={field.value}
                  onSelect={field.onChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="customerName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Customer Name*</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} readOnly />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="dealName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Deal Name*</FormLabel>
            <Combobox
              options={[{
                value: dealNameOption,
                label: dealNameOption
              }]}
              value={field.value}
              onSelect={field.onChange}
              placeholder="--SELECT--"
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="representativeId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>SM / Sales Representative</FormLabel>
            <Select
              value={field.value || assignedSmId}
              onValueChange={field.onChange}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select SM" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {smOptions.map((salesman) => (
                  <SelectItem key={salesman.id} value={salesman.id}>
                    {salesman.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignedSmName && (
              <p className="text-xs text-muted-foreground">
                Auto-selected from deal: {assignedSmName}
              </p>
            )}
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
});

const PreviouslySelectedItems = memo(function PreviouslySelectedItems({
  control,
  fields,
  remove,
  isEditing,
  isCloning = false,
  isCorrection = false,
}: {
  control: Control<FormValues>;
  fields: any[];
  remove: (index: number) => void;
  isEditing: boolean;
  isCloning?: boolean;
  isCorrection?: boolean;
}) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-4">
      {isCorrection ? (
        <div className="border-b pb-2">
          <h3 className="text-lg font-semibold">Converted Quotation Items</h3>
          <p className="text-sm text-muted-foreground">
            Changes saved here will also update the linked order.
          </p>
        </div>
      ) : isCloning ? (
        <div className="border-b pb-2">
          <h3 className="text-lg font-semibold">Cloned Items</h3>
          <p className="text-sm text-muted-foreground">
            Update the copied item details before creating the new quotation.
          </p>
        </div>
      ) : (
        <h3 className="text-lg font-semibold border-b pb-2">Previously Selected Items</h3>
      )}
      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-28">Category</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead className="w-32">Rate</TableHead>
              <TableHead>Discount %</TableHead>
              <TableHead>GST Mode</TableHead>
              <TableHead className="w-24">GST %</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Room</TableHead>
              <TableHead className="w-10">Delete</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
              <ItemRow
                key={field.id}
                control={control}
                index={index}
                onRemove={remove}
                isEditing={isEditing}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
});

const ItemRow = memo(function ItemRow({
  control,
  index,
  onRemove,
  isEditing,
}: {
  control: Control<FormValues>;
  index: number;
  onRemove: (index: number) => void;
  isEditing: boolean;
}) {
  const handleRemove = useCallback(() => onRemove(index), [index, onRemove]);
  
  const currentItem = useWatch({ control, name: `items.${index}` });
  const calculatedItem = useMemo(
    () => calculateItemTotals(currentItem || {}),
    [currentItem]
  );
  const rateIsLower = currentItem &&
    typeof currentItem.originalMrp === "number" &&
    typeof currentItem.rate === "number" &&
    currentItem.rate < currentItem.originalMrp;

  return (
    <TableRow>
      <TableCell>{index + 1}</TableCell>
      <TableCell>
        <div>
          <p className="font-medium text-primary">
            {currentItem?.collectionBrand || "-"}
          </p>
          <p className="text-xs text-muted-foreground">
            {currentItem?.salesDescription || "-"}
          </p>
        </div>
        {!isEditing && (
          <FormField
            control={control}
            name={`items.${index}.salesDescription`}
            render={({ field }) => (
              <Combobox
                options={DESCRIPTION_OPTIONS}
                value={field.value}
                onSelect={field.onChange}
                placeholder="--SELECT--"
              />
            )}
          />
        )}
      </TableCell>
      <TableCell>
        <div className="text-sm font-medium text-blue-600">
          {currentItem?.categoryGroup || "-"}
        </div>
      </TableCell>
      <TableCell>
        {isEditing ? (
          Number(currentItem?.quantity || 0)
        ) : (
          <FormField
            control={control}
            name={`items.${index}.quantity`}
            render={({ field }) => (
              <Input
                type="number"
                value={field.value || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  field.onChange(val === "" ? 0 : parseFloat(val));
                }}
                onBlur={field.onBlur}
                className="w-24"
              />
            )}
          />
        )}
      </TableCell>
      <TableCell>
        {isEditing ? (
          Number(currentItem?.rate || 0).toFixed(2)
        ) : (
          <FormField
            control={control}
            name={`items.${index}.rate`}
            render={({ field }) => (
              <Input
                type="number"
                step="0.01"
                value={field.value || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  field.onChange(val === "" ? 0 : parseFloat(val));
                }}
                onBlur={field.onBlur}
                className={rateIsLower ? "border-red-500 ring-2 ring-red-200 w-28" : "w-28"}
              />
            )}
          />
        )}
      </TableCell>
      <TableCell>
        {isEditing ? (
          Number(currentItem?.discountPercent || 0).toFixed(2)
        ) : (
          <FormField
            control={control}
            name={`items.${index}.discountPercent`}
            render={({ field }) => (
              <Input
                type="number"
                step="0.01"
                value={field.value || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  field.onChange(val === "" ? 0 : parseFloat(val));
                }}
                onBlur={field.onBlur}
                className="w-20"
              />
            )}
          />
        )}
      </TableCell>
      <TableCell>
        {isEditing ? (
          currentItem?.gstMode === "EXCL" ? "Excl GST" : "Incl GST"
        ) : (
          <FormField
            control={control}
            name={`items.${index}.gstMode`}
            render={({ field }) => (
              <div className="flex flex-col gap-2 text-xs">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={field.value === "EXCL"}
                    onCheckedChange={() => field.onChange("EXCL")}
                  />
                  <span>Excl GST</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={field.value === "INCL"}
                    onCheckedChange={() => field.onChange("INCL")}
                  />
                  <span>Incl GST</span>
                </label>
              </div>
            )}
          />
        )}
      </TableCell>
      <TableCell>
        {isEditing ? (
          Number(currentItem?.gstPercent || 0).toFixed(2)
        ) : (
          <FormField
            control={control}
            name={`items.${index}.gstPercent`}
            render={({ field }) => (
              <Input
                type="number"
                step="0.01"
                value={field.value ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  field.onChange(val === "" ? 0 : parseFloat(val));
                }}
                onBlur={field.onBlur}
                className="w-20"
              />
            )}
          />
        )}
      </TableCell>
      <TableCell>
        {isEditing ? (
          Number(calculatedItem.taxableAmt || 0).toFixed(2)
        ) : (
          <Input
            readOnly
            disabled
            value={Number(calculatedItem.taxableAmt || 0).toFixed(2)}
            className="w-24 bg-gray-50"
          />
        )}
      </TableCell>
      <TableCell>
        {isEditing ? (
          currentItem?.room || "-"
        ) : (
          <FormField
            control={control}
            name={`items.${index}.room`}
            render={({ field }) => (
              <Combobox
                options={roomOptions}
                value={field.value || ""}
                onSelect={field.onChange}
                placeholder="--SELECT--"
              />
            )}
          />
        )}
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="destructive"
          size="icon"
          onClick={handleRemove}
          title="Delete item"
          aria-label={`Delete item ${index + 1}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
});

const AddItemSection = memo(function AddItemSection({
  addItem,
  setAddItem,
  bcnOptions,
  isSearchingBcn,
  onBcnSearch,
  onBcnSelect,
  onAddItem,
  isEditing,
}: {
  addItem: typeof DEFAULT_ADD_ITEM_STATE;
  setAddItem: React.Dispatch<React.SetStateAction<typeof DEFAULT_ADD_ITEM_STATE>>;
  bcnOptions: { value: string; label: string }[];
  isSearchingBcn: boolean;
  onBcnSearch: (query: string) => void;
  onBcnSelect: (value: string) => void;
  onAddItem: () => void;
  isEditing: boolean;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold border-b pb-2">Add More Items</h3>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="md:col-span-2 space-y-2">
          <FormLabel>BCN</FormLabel>
          <Combobox
            options={bcnOptions}
            value={addItem.bcn}
            onSelect={onBcnSelect}
            onSearch={onBcnSearch}
            placeholder="Search BCN..."
            searchPlaceholder="Type to search BCN..."
            emptyPlaceholder={isSearchingBcn ? "Searching..." : "No BCN found."}
          />
        </div>
        <div className="space-y-2">
          <FormLabel>Description</FormLabel>
          <Combobox
            options={DESCRIPTION_OPTIONS}
            value={addItem.description}
            onSelect={(value) => setAddItem((prev) => ({ ...prev, description: value }))}
            placeholder="--SELECT--"
          />
        </div>
        <div className="space-y-2">
          <FormLabel>Quantity</FormLabel>
          <Input
            type="number"
            step="0.01"
            value={addItem.quantity}
            onChange={(e) => setAddItem((prev) => ({ ...prev, quantity: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <FormLabel>Rate</FormLabel>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={addItem.rate}
            onChange={(e) => setAddItem((prev) => ({ ...prev, rate: e.target.value }))}
            placeholder="Enter rate"
          />
        </div>
        <div className="space-y-2">
          <FormLabel>Discount %</FormLabel>
          <Input
            type="number"
            step="0.01"
            value={addItem.discountPercent}
            onChange={(e) => setAddItem((prev) => ({ ...prev, discountPercent: e.target.value }))}
          />
        </div>
        {isEditing && (
          <div className="space-y-2">
            <FormLabel>GST Mode</FormLabel>
            <div className="flex min-h-10 items-center gap-4 rounded-md border px-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={addItem.gstMode === "EXCL"}
                  onCheckedChange={() =>
                    setAddItem((prev) => ({ ...prev, gstMode: "EXCL" }))
                  }
                />
                <span>Excl GST</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={addItem.gstMode === "INCL"}
                  onCheckedChange={() =>
                    setAddItem((prev) => ({ ...prev, gstMode: "INCL" }))
                  }
                />
                <span>Incl GST</span>
              </label>
            </div>
          </div>
        )}
        <div className="space-y-2">
          <FormLabel>Room</FormLabel>
          <Combobox
            options={roomOptions}
            value={addItem.room}
            onSelect={(value) => setAddItem((prev) => ({ ...prev, room: value }))}
            placeholder="--SELECT--"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onAddItem}>
          Add Item
        </Button>
      </div>
    </div>
  );
});

const VasForm = memo(function VasForm({ form }: { form: UseFormReturn<FormValues> }) {
  const { control, setValue } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "vasDetails" });
  const [vasSearchOptions, setVasSearchOptions] = useState<ComboboxOption[]>([]);
  const [vasStockByValue, setVasStockByValue] = useState<Record<string, Stock>>({});
  const [isSearchingVas, setIsSearchingVas] = useState(false);

  const handleVasSearch = useCallback(async (queryText: string) => {
    const query = String(queryText || "").trim();
    if (query.length < 2) {
      setVasSearchOptions([]);
      return;
    }

    setIsSearchingVas(true);
    try {
      // Use the same BCN search action
      const results = await searchStockByBcn(query);
      
      // ✅ Filter only services
      const serviceStocks = results.filter((stock: any) => stock.isService === true);

      const mappedOptions: ComboboxOption[] = [];
      const mapByValue: Record<string, Stock> = {};
      const seen = new Set<string>();

      serviceStocks.forEach((stock: any) => {
        const displayName = String(stock.itemName || stock.name || stock.bcn || stock.id || "").trim();
        if (!displayName) return;

        const key = displayName.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        const rate = resolveStockRate(stock);
        const gst = resolveVasGst(stock);
        const rateLabel = Number.isFinite(rate) && rate > 0 ? ` - Rs ${rate}` : "";
        const gstLabel = gst > 0 ? ` (${gst}% GST)` : "";

        mappedOptions.push({
          value: displayName,
          label: `${displayName}${rateLabel}${gstLabel}`,
        });
        mapByValue[displayName] = stock;
      });

      // Fallback for custom/manual entry if no matches
      if (mappedOptions.length === 0 && query.length >= 2) {
        mappedOptions.push({ value: query, label: `Use "${query}" (Custom Service)` });
      }

      setVasSearchOptions(mappedOptions);
      setVasStockByValue((prev) => ({ ...prev, ...mapByValue }));
    } catch (error) {
      console.error("VAS search error:", error);
      setVasSearchOptions([]);
    } finally {
      setIsSearchingVas(false);
    }
  }, []);

  const handleVasSelect = useCallback(
    (index: number, onChange: (value: string) => void, value: string) => {
      onChange(value);
      if (!value) return;

      const stock = vasStockByValue[value];
      if (stock) {
        setValue(`vasDetails.${index}.rate`, String(resolveStockRate(stock)), {
          shouldDirty: true,
          shouldValidate: true,
        });
        setValue(`vasDetails.${index}.gstPercent`, resolveVasGst(stock), {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    },
    [vasStockByValue, setValue]
  );

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold border-b pb-2">
        Add VAS Details (Value Added Services)
      </h3>
      
      {fields.map((field, index) => (
        <div key={field.id} className="p-4 border rounded-lg flex items-end gap-4">
          <FormField
            control={control}
            name={`vasDetails.${index}.vasName`}
            render={({ field }) => (
              <FormItem className="flex-grow">
                <FormLabel>VAS*</FormLabel>
                <Combobox
                  options={vasSearchOptions}
                  value={field.value}
                  onSearch={handleVasSearch}
                  onSelect={(value) => handleVasSelect(index, field.onChange, value)}
                  placeholder="--SELECT--"
                  searchPlaceholder="Search VAS/Service..."
                  emptyPlaceholder={isSearchingVas ? "Searching services..." : "No services found. Type to create custom."}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={control}
            name={`vasDetails.${index}.quantity`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity*</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={control}
            name={`vasDetails.${index}.rate`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rate*</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={control}
            name={`vasDetails.${index}.gstPercent`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>GST %</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={control}
            name={`vasDetails.${index}.room`}
            render={({ field }) => (
              <FormItem className="flex-grow">
                <FormLabel>Room</FormLabel>
                <Combobox
                  options={roomOptions}
                  value={field.value}
                  onSelect={field.onChange}
                  placeholder="--SELECT--"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={() => remove(index)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      
      <div className="flex gap-2">
        <Button
          type="button"
          variant="default"
          onClick={() => append({
            vasName: "",
            quantity: "1",
            rate: "0",
            gstPercent: 0,
            room: "",
          })}
        >
          Add
        </Button>
        <Button type="button" variant="outline" onClick={() => remove()}>
          Reset
        </Button>
      </div>
    </div>
  );
});

const QuotationPreview = memo(function QuotationPreview({
  form,
  onBack,
  onSubmit,
  loading,
  mode,
}: {
  form: UseFormReturn<FormValues>;
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
  mode: QuotationDialogMode;
}) {
  const values = form.getValues();
  const isCloning = mode === "clone";
  const isEditing = mode === "edit";

  const calculatedItems = useMemo(
    () => values.items.map(calculateItemTotals),
    [values.items]
  );

  const vasWithCalculations = useMemo(() => {
    return (values.vasDetails || []).map(vas => {
      const quantity = Number(vas.quantity) || 0;
      const rate = Number(vas.rate) || 0;
      const taxableAmt = quantity * rate;
      const gstPercent = Number(vas.gstPercent) || 0;
      const tax = taxableAmt * (gstPercent / 100);
      
      return {
        ...vas,
        gstPercent,
        taxableAmt,
        cgst: tax / 2,
        sgst: tax / 2,
        igst: 0,
      };
    });
  }, [values.vasDetails]);

  const totals = useMemo(() => {
    const itemTotals = calculatedItems.reduce(
      (acc, item) => {
        acc.quantity += item.quantity;
        acc.subtotal += item.subtotal;
        acc.discount += item.discount;
        acc.taxableAmt += item.taxableAmt;
        acc.cgst += item.cgst;
        acc.sgst += item.sgst;
        acc.igst += item.igst;
        acc.gstAmount += item.gstAmount;
        acc.totalAmount += item.totalAmount;
        return acc;
      },
      {
        quantity: 0,
        subtotal: 0,
        discount: 0,
        taxableAmt: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        gstAmount: 0,
        totalAmount: 0,
      }
    );

    const vasTotals = vasWithCalculations.reduce(
      (acc, vas) => {
        acc.quantity += Number(vas.quantity);
        acc.taxableAmt += vas.taxableAmt;
        acc.cgst += vas.cgst;
        acc.sgst += vas.sgst;
        acc.igst += vas.igst;
        return acc;
      },
      { quantity: 0, taxableAmt: 0, cgst: 0, sgst: 0, igst: 0 }
    );

    const quotationAmount =
      itemTotals.totalAmount +
      (vasTotals.taxableAmt + vasTotals.cgst + vasTotals.sgst + vasTotals.igst);

    return { itemTotals, vasTotals, quotationAmount };
  }, [calculatedItems, vasWithCalculations]);

  return (
    <FormProvider {...form}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">
            {isEditing
              ? "Confirm Quotation Correction"
              : isCloning
                ? "Confirm Cloned Quotation"
                : "Confirm & Create Quotation"}
          </h2>
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-x-8 gap-y-4 text-sm">
          <div className="space-y-1">
            <p className="text-muted-foreground">Company</p>
            <p className="font-semibold">{values.company || 'MO DESIGNS PRIVATE LIMITED'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Store</p>
            <p className="font-semibold">{values.store}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Quotation Date</p>
            <p className="font-semibold">{format(values.date, 'dd/MM/yyyy')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Valid Till Date</p>
            <p className="font-semibold">
              {values.validTillDate ? format(values.validTillDate, 'dd/MM/yyyy') : '-'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Customer Name</p>
            <p className="font-semibold">{values.customerName}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Billing Name</p>
            <p className="font-semibold">{values.billingName || values.customerName}</p>
          </div>
          <div className="space-y-1 col-span-2">
            <p className="text-muted-foreground">Billing Address</p>
            <p className="font-semibold">{values.billingAddress || '-'}</p>
          </div>
        </div>

        {/* Item Details Table */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Item Details</h3>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Collection / Brand</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Serial No</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Taxable Amt</TableHead>
                  <TableHead>CGST</TableHead>
                  <TableHead>SGST</TableHead>
                  <TableHead>IGST</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calculatedItems.map((item, index) => (
                  <TableRow key={item.id || index}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{item.collectionBrand}</TableCell>
                    <TableCell className="font-medium text-blue-600">{item.categoryGroup || "-"}</TableCell>
                    <TableCell>{item.serialNo}</TableCell>
                    <TableCell>{item.quantity.toFixed(2)}</TableCell>
                    <TableCell>{item.rate.toFixed(2)}</TableCell>
                    <TableCell>{item.subtotal.toFixed(2)}</TableCell>
                    <TableCell>
                      {item.discount.toFixed(2)}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        @{item.discountPercent.toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell>{item.room}</TableCell>
                    <TableCell>{item.taxableAmt.toFixed(2)}</TableCell>
                    <TableCell>
                      {item.cgst.toFixed(2)}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        @{(Number(item.gstPercent || 0) / 2).toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.sgst.toFixed(2)}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        @{(Number(item.gstPercent || 0) / 2).toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.igst.toFixed(2)}
                      <br />
                      <span className="text-xs text-muted-foreground">@0.00%</span>
                    </TableCell>
                    <TableCell>{item.salesDescription}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-bold text-right">
                    Total
                  </TableCell>
                  <TableCell className="font-bold">
                    {totals.itemTotals.quantity.toFixed(2)}
                  </TableCell>
                  <TableCell></TableCell>
                  <TableCell className="font-bold">
                    {totals.itemTotals.subtotal.toFixed(2)}
                  </TableCell>
                  <TableCell className="font-bold">
                    {totals.itemTotals.discount.toFixed(2)}
                  </TableCell>
                  <TableCell colSpan={2}></TableCell>
                  <TableCell className="font-bold">
                    {totals.itemTotals.taxableAmt.toFixed(2)}
                  </TableCell>
                  <TableCell className="font-bold">
                    {totals.itemTotals.cgst.toFixed(2)}
                  </TableCell>
                  <TableCell className="font-bold">
                    {totals.itemTotals.sgst.toFixed(2)}
                  </TableCell>
                  <TableCell className="font-bold">
                    {totals.itemTotals.igst.toFixed(2)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>

        {/* VAS Details Table */}
        {vasWithCalculations.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">VAS Details (Value Added Services)</h3>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Vas Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Taxable Amt</TableHead>
                    <TableHead>CGST</TableHead>
                    <TableHead>SGST</TableHead>
                    <TableHead>IGST</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vasWithCalculations.map((vas, index) => (
                    <TableRow key={`vas-${index}`}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{vas.vasName}</TableCell>
                      <TableCell>{Number(vas.quantity).toFixed(2)}</TableCell>
                      <TableCell>{Number(vas.rate).toFixed(2)}</TableCell>
                      <TableCell>{vas.room || '-'}</TableCell>
                      <TableCell>{vas.taxableAmt.toFixed(2)}</TableCell>
                      <TableCell>
                        {vas.cgst.toFixed(2)}
                        <br />
                        <span className="text-xs text-muted-foreground">
                          @{(Number(vas.gstPercent || 0) / 2).toFixed(2)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        {vas.sgst.toFixed(2)}
                        <br />
                        <span className="text-xs text-muted-foreground">
                          @{(Number(vas.gstPercent || 0) / 2).toFixed(2)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        {vas.igst.toFixed(2)}
                        <br />
                        <span className="text-xs text-muted-foreground">@0.00%</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="font-bold text-right">
                      Total
                    </TableCell>
                    <TableCell className="font-bold">
                      {totals.vasTotals.quantity.toFixed(2)}
                    </TableCell>
                    <TableCell colSpan={2}></TableCell>
                    <TableCell className="font-bold">
                      {totals.vasTotals.taxableAmt.toFixed(2)}
                    </TableCell>
                    <TableCell className="font-bold">
                      {totals.vasTotals.cgst.toFixed(2)}
                    </TableCell>
                    <TableCell className="font-bold">
                      {totals.vasTotals.sgst.toFixed(2)}
                    </TableCell>
                    <TableCell className="font-bold">
                      {totals.vasTotals.igst.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 border-t pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-end gap-4 sm:gap-8">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Quotation Amount</p>
              <p className="font-bold text-2xl text-primary">
                ₹{totals.quotationAmount.toFixed(2)}
              </p>
            </div>

            <FormField
              control={form.control}
              name="advance"
              render={({ field }) => (
                <FormItem className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <FormLabel className="text-sm font-semibold text-amber-900">Advance Received (₹)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      placeholder="Enter advance"
                      className="w-40 bg-white"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                    />
                  </FormControl>
                  <p className="text-[11px] text-amber-800">Enter the customer advance before creating the quotation.</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sendEmail"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="cursor-pointer">Send Email</FormLabel>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="sendSms"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="cursor-pointer">Send SMS</FormLabel>
                </FormItem>
              )}
            />
          </div>
          
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onBack}>
              Back to Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  disabled={loading}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditing
                    ? "Update Quotation & Order"
                    : isCloning
                      ? "Create Cloned Quotation"
                      : "Create Quotation"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {isEditing
                      ? "Confirm Converted Quotation Update"
                      : isCloning
                        ? "Confirm Quotation Clone"
                        : "Confirm Quotation Creation"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {isEditing
                      ? `This will update the converted quotation and synchronize its linked order for Rs. ${totals.quotationAmount.toFixed(2)}.`
                      : isCloning
                      ? `This will create a new quotation with a new quotation number for Rs. ${totals.quotationAmount.toFixed(2)}.`
                      : `This will create a quotation with status 'Pending Approval' for an amount of Rs. ${totals.quotationAmount.toFixed(2)}.`}
                    {" Are you sure you want to continue?"}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onSubmit}>
                    {isEditing
                      ? "Continue & Update"
                      : isCloning
                        ? "Continue & Clone"
                        : "Continue & Create"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </FormProvider>
  );
});
