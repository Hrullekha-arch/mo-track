"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2, PlusCircle, UserPlus, ChevronRight,
  Search, Package, Wrench, FileText, CheckCircle2, X, User,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  searchStockByBcn,
  searchVasStockServicesAction,
  upsertVasStockItemsAction,
} from "@/app/dashboard/inventory/actions";
import {
  createInstantCustomerAction,
  createInstantQuotationOrderAction,
  getInstantQuotationBootstrapAction,
  InstantCustomerOption,
  InstantItemInput,
  InstantVasInput,
  searchInstantCustomersAction,
} from "./actions";

import { Stock, Walkin_Customer } from "@/lib/types";
import { roomOptions, storeOptions, vasOptions } from "@/lib/constants";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

/* ─────────────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────────────── */
type SalesmanOption = { id: string; name: string; salesmanCode?: string };
type DraftCustomer = {
  name: string; mobile: string; email: string; addressLine1: string; pincode: string;
};
type DraftItem = {
  bcn: string; description: string; quantity: string; rate: string;
  discountPercent: string; gstPercent: string; gstMode: "EXCL" | "INCL";
  room: string; remark: string; stockId?: string; unit?: string; stockUnit?: string;
};
type DraftVas = {
  vasName: string; quantity: string; rate: string;
  gstPercent: string; room: string; hsnCode: string;
};

/* ─────────────────────────────────────────────────────────────────────────────
   Defaults
───────────────────────────────────────────────────────────────────────────── */
const defaultDraftCustomer: DraftCustomer = {
  name: "", mobile: "", email: "", addressLine1: "", pincode: "",
};
const defaultDraftItem: DraftItem = {
  bcn: "", description: "", quantity: "1", rate: "",
  discountPercent: "0", gstPercent: "5", gstMode: "INCL",
  room: "", remark: "", stockId: undefined, unit: undefined, stockUnit: undefined,
};
const defaultDraftVas: DraftVas = {
  vasName: "", quantity: "1", rate: "", gstPercent: "0", room: "", hsnCode: "",
};

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */
const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const getStockRate = (stock?: Stock | null) => {
  if (!stock) return 0;
  for (const key of ["rrpWithGstRs", "mrp", "clPrice", "rlPrice"] as const) {
    const v = Number((stock as any)?.[key]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 0;
};

const getVasGstPercent = (stock?: Stock | null) => {
  if (!stock) return 0;
  const gst = Number((stock as any)?.gstPercent);
  return Number.isFinite(gst) && gst >= 0 ? gst : 0;
};

const normalizeUnit = (value: unknown, fallback = "Mtr") => {
  const raw = String(value || "").trim();
  const normalized = raw.toUpperCase();
  if (["M", "MTR", "METER", "METRE", "METERS", "METRES"].includes(normalized)) return "Mtr";
  if (["PC", "PCS", "PIECE", "PIECES"].includes(normalized)) return "Pcs";
  return raw || fallback;
};

const lineAmount = (item: InstantItemInput) => {
  const qty  = Math.max(0, toNumber(item.quantity));
  const rate = Math.max(0, toNumber(item.rate));
  const disc = Math.max(0, Math.min(100, toNumber(item.discountPercent)));
  const gst  = Math.max(0, toNumber(item.gstPercent ?? 0));
  const after = qty * rate * (1 - disc / 100);
  return item.gstMode === "EXCL" ? after * (1 + gst / 100) : after;
};

const vasLineAmount = (v: InstantVasInput) =>
  Math.max(0, toNumber(v.quantity)) * Math.max(0, toNumber(v.rate));

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/* ─────────────────────────────────────────────────────────────────────────────
   Small layout primitives
───────────────────────────────────────────────────────────────────────────── */
function FormField({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function SectionIcon({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
      <Icon className="h-4 w-4" />
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <p className="rounded-md border bg-muted/20 py-6 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Page export
───────────────────────────────────────────────────────────────────────────── */
export default function QuotationBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <QuotationBuilderInner />
    </Suspense>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Inner component
───────────────────────────────────────────────────────────────────────────── */
function QuotationBuilderInner() {
  const searchParams = useSearchParams();
  const payload = searchParams.get("payload");

  const leaddata = useMemo<Walkin_Customer | null>(() => {
    if (!payload) return null;
    try { return JSON.parse(decodeURIComponent(payload)) as Walkin_Customer; }
    catch (e) { console.error("Payload parse failed:", e); return null; }
  }, [payload]);

  const leadAppliedRef = useRef(false);
  const router         = useRouter();
  const { toast }      = useToast();
  const { user }       = useAuth();

  /* ── State ─────────────────────────────────────────────────── */
  const [isBootLoading, setIsBootLoading]         = useState(true);
  const [isSubmitting, setIsSubmitting]           = useState(false);
  const [salesmen, setSalesmen]                   = useState<SalesmanOption[]>([]);
  const [nextDealIdPreview, setNextDealIdPreview] = useState("INQ-001");
  const [invoiceNo, setInvoiceNo] = useState("");

  const [customerQuery, setCustomerQuery]               = useState("");
  const [customerOptions, setCustomerOptions]           = useState<InstantCustomerOption[]>([]);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer]         = useState<InstantCustomerOption | null>(null);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [draftCustomer, setDraftCustomer]               = useState<DraftCustomer>(defaultDraftCustomer);
  const [isCreatingCustomer, setIsCreatingCustomer]     = useState(false);

  const [salesmanId, setSalesmanId] = useState("");
  const [dealName, setDealName]     = useState<"Cashsale" | "Walkin-sale">("Walkin-sale");
  const [store, setStore]           = useState("");
  const [orderType, setOrderType]   = useState<"delivery" | "stitching" | "stitching+installation">("delivery");

  const [items, setItems]                             = useState<InstantItemInput[]>([]);
  const [draftItem, setDraftItem]                     = useState<DraftItem>(defaultDraftItem);
  const [stockSuggestions, setStockSuggestions]       = useState<Stock[]>([]);
  const [stockSuggestionOpen, setStockSuggestionOpen] = useState(false);
  const [isSearchingStock, setIsSearchingStock]       = useState(false);

  const [vasItems, setVasItems] = useState<InstantVasInput[]>([]);
  const [draftVas, setDraftVas] = useState<DraftVas>(defaultDraftVas);
  const [vasSuggestions, setVasSuggestions] = useState<ComboboxOption[]>([]);
  const [vasStockMap, setVasStockMap] = useState<Record<string, Stock>>({});

  const defaultVasComboboxOptions = useMemo<ComboboxOption[]>(() => {
    const seen = new Set<string>();
    const options: ComboboxOption[] = [];
    vasOptions.forEach((option) => {
      const label =
        typeof option.label === "string"
          ? option.label.trim()
          : String(option.value || "").trim();
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      options.push({ value: label, label });
    });
    return options;
  }, []);

  const vasSeedRows = useMemo(
    () =>
      defaultVasComboboxOptions.map((option) => ({
        vasName: String(option.value),
        rate: 0,
        gstPercent: 0,
      })),
    [defaultVasComboboxOptions]
  );

  /* ── Computed ───────────────────────────────────────────────── */
  const goodsTotal = useMemo(() => items.reduce((s, i) => s + lineAmount(i), 0), [items]);
  const vasTotal   = useMemo(() => vasItems.reduce((s, v) => s + vasLineAmount(v), 0), [vasItems]);
  const grandTotal = goodsTotal + vasTotal;
  const isCashsale = dealName === "Cashsale";
  const selectedSalesman = useMemo(
    () => salesmen.find((s) => s.id === salesmanId) ?? null,
    [salesmen, salesmanId],
  );

  /* ── Bootstrap ──────────────────────────────────────────────── */
  useEffect(() => {
    let active = true;
    (async () => {
      setIsBootLoading(true);
      try {
        const [boot, seed] = await Promise.all([
          getInstantQuotationBootstrapAction(),
          searchInstantCustomersAction(""),
        ]);
        if (!active) return;
        setSalesmen(boot.salesmen);
        setNextDealIdPreview(boot.nextDealId);
        setCustomerOptions(seed);
        if (boot.salesmen.length > 0) setSalesmanId(boot.salesmen[0].id);
      } catch (e) { console.error(e); }
      finally { if (active) setIsBootLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setVasSuggestions(defaultVasComboboxOptions);
  }, [defaultVasComboboxOptions]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await upsertVasStockItemsAction(vasSeedRows);
      } catch (error) {
        console.error("Failed to sync VAS catalog:", error);
      }

      if (!active) return;
      try {
        const initial = await searchVasStockServicesAction("st");
        if (!initial.length) return;

        const mapByValue: Record<string, Stock> = {};
        const options: ComboboxOption[] = [];
        const seen = new Set<string>();

        initial.forEach((stock) => {
          const displayName = String(stock.itemName || stock.name || stock.bcn || stock.id || "").trim();
          if (!displayName) return;
          const key = displayName.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          options.push({ value: displayName, label: displayName });
          mapByValue[displayName] = stock;
        });

        setVasSuggestions(options);
        setVasStockMap((prev) => ({ ...prev, ...mapByValue }));
      } catch (error) {
        console.error("Failed to preload VAS suggestions:", error);
      }
    })();

    return () => {
      active = false;
    };
  }, [vasSeedRows]);

  /* ── Lead prefill ───────────────────────────────────────────── */
  useEffect(() => {
    if (!leaddata || isBootLoading || leadAppliedRef.current) return;
    leadAppliedRef.current = true;
    const fullName = `${leaddata.firstName} ${leaddata.familyName}`.trim();
    setSelectedCustomer({ id: leaddata.id, name: fullName, mobile: leaddata.mobile, email: leaddata.email });
    setCustomerQuery(`${fullName} (${leaddata.mobile})`);
    setDealName("Cashsale");
    if (leaddata.salesmanId) setSalesmanId(leaddata.salesmanId);
  }, [leaddata, isBootLoading]);

  /* ── Customer search ────────────────────────────────────────── */
  useEffect(() => {
    const t = setTimeout(async () => {
      try { setCustomerOptions(await searchInstantCustomersAction(customerQuery.trim())); }
      catch (e) { console.error(e); }
    }, 220);
    return () => clearTimeout(t);
  }, [customerQuery]);

  /* ── Stock search ───────────────────────────────────────────── */
  useEffect(() => {
    const term = draftItem.bcn.trim();
    if (term.length < 2) { setStockSuggestions([]); return; }
    const t = setTimeout(async () => {
      setIsSearchingStock(true);
      try { setStockSuggestions((await searchStockByBcn(term)) || []); }
      catch (e) { console.error(e); }
      finally { setIsSearchingStock(false); }
    }, 240);
    return () => clearTimeout(t);
  }, [draftItem.bcn]);

  /* ── Cashsale GST reset ─────────────────────────────────────── */
  useEffect(() => {
    if (!isCashsale) return;
    setItems((p) => p.map((i) => ({ ...i, gstPercent: 0, gstMode: "INCL" as const })));
    setVasItems((p) => p.map((v) => ({ ...v, gstPercent: 0 })));
    setDraftItem((p) => ({ ...p, gstPercent: "0", gstMode: "INCL" }));
    setDraftVas((p) => ({ ...p, gstPercent: "0" }));
  }, [isCashsale]);

  /* ── Handlers ───────────────────────────────────────────────── */
  const handleSelectCustomer = (c: InstantCustomerOption) => {
    setSelectedCustomer(c);
    setCustomerQuery(`${c.name} (${c.mobile})`);
    setCustomerDropdownOpen(false);
  };

  const handleCreateCustomer = async () => {
    if (!draftCustomer.name.trim() || !draftCustomer.mobile.trim()) {
      toast({ variant: "destructive", title: "Missing details", description: "Name and mobile are required." });
      return;
    }
    setIsCreatingCustomer(true);
    try {
      const res = await createInstantCustomerAction({
        name: draftCustomer.name, mobile: draftCustomer.mobile,
        email: draftCustomer.email || undefined,
        addressLine1: draftCustomer.addressLine1 || undefined,
        pincode: draftCustomer.pincode || undefined,
        createdBy: user?.name, leadId: undefined,
      });
      if (!res.success || !res.customer) {
        toast({ variant: "destructive", title: "Failed", description: res.message }); return;
      }
      setSelectedCustomer(res.customer);
      setCustomerQuery(`${res.customer.name} (${res.customer.mobile})`);
      setDraftCustomer(defaultDraftCustomer);
      setIsCustomerDialogOpen(false);
      toast({ title: "Customer created", description: `${res.customer.name} selected.` });
    } finally { setIsCreatingCustomer(false); }
  };

  const handleSelectStock = (stock: Stock) => {
    const name = String(stock.name || stock.itemName || stock.bcn || "").trim();
    const gst  = toNumber((stock as any)?.gstPercent, 5);
    const stockUnit = normalizeUnit(stock.unit, "Mtr");
    setDraftItem((p) => ({
      ...p,
      bcn: String(stock.bcn || p.bcn),
      description: name || p.description,
      rate: String(getStockRate(stock) || p.rate || ""),
      gstPercent: isCashsale ? "0" : String(gst > 0 ? gst : 5),
      stockId: stock.id,
      unit: stockUnit,
      stockUnit,
    }));
    setStockSuggestionOpen(false);
  };

  const handleVasSearch = async (queryText: string) => {
    const query = String(queryText || "").trim();
    if (query.length < 2) {
      setVasSuggestions(defaultVasComboboxOptions);
      return;
    }

    const results = await searchVasStockServicesAction(query);
    if (!results.length) {
      const lowered = query.toLowerCase();
      const filtered = defaultVasComboboxOptions
        .filter((option) => option.value.toLowerCase().includes(lowered))
        .slice(0, 60);
      const hasExact = filtered.some((option) => option.value.toLowerCase() === lowered);
      setVasSuggestions(
        hasExact
          ? filtered
          : [{ value: query, label: `Use "${query}"` }, ...filtered]
      );
      return;
    }

    const mapByValue: Record<string, Stock> = {};
    const options: ComboboxOption[] = [];
    const seen = new Set<string>();

    results.forEach((stock) => {
      const displayName = String(stock.itemName || stock.name || stock.bcn || stock.id || "").trim();
      if (!displayName) return;

      const key = displayName.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      const rate = getStockRate(stock);
      const gstPercent = getVasGstPercent(stock);
      const rateLabel = Number.isFinite(rate) && rate > 0 ? ` - Rs ${rate}` : "";
      const gstLabel = gstPercent > 0 ? ` (${gstPercent}% GST)` : "";

      options.push({
        value: displayName,
        label: `${displayName}${rateLabel}${gstLabel}`,
      });
      mapByValue[displayName] = stock;
    });

    if (!seen.has(query.toLowerCase())) {
      options.unshift({ value: query, label: `Use "${query}"` });
    }

    setVasSuggestions(options);
    setVasStockMap((prev) => ({ ...prev, ...mapByValue }));
  };

  const handleSelectVas = (value: string) => {
    const stock = vasStockMap[value];
    if (!stock) {
      setDraftVas((prev) => ({ ...prev, vasName: value }));
      return;
    }

    setDraftVas((prev) => ({
      ...prev,
      vasName: value,
      rate: String(getStockRate(stock) || prev.rate || ""),
      gstPercent: isCashsale ? "0" : String(getVasGstPercent(stock)),
      hsnCode: String((stock as any)?.hsnOrSac || (stock as any)?.hsnCode || ""),
    }));
  };

  const handleAddItem = () => {
    const bcn         = draftItem.bcn.trim();
    const description = draftItem.description.trim();
    const qty         = Math.max(0, toNumber(draftItem.quantity));
    if (!bcn || !description || qty <= 0) {
      toast({ variant: "destructive", title: "Invalid item", description: "BCN, description and quantity required." });
      return;
    }
    setItems((p) => [
      ...p,
      {
        bcn, description, quantity: qty,
        rate: Math.max(0, toNumber(draftItem.rate)),
        unit: normalizeUnit(draftItem.unit || draftItem.stockUnit, "Mtr"),
        stockUnit: normalizeUnit(draftItem.stockUnit || draftItem.unit, "Mtr"),
        discountPercent: Math.max(0, Math.min(100, toNumber(draftItem.discountPercent))),
        gstPercent: isCashsale ? 0 : Math.max(0, toNumber(draftItem.gstPercent, 5)),
        gstMode: isCashsale ? "INCL" : draftItem.gstMode,
        room: draftItem.room || undefined,
        remark: draftItem.remark || undefined,
        stockId: draftItem.stockId,
      },
    ]);
    setDraftItem(defaultDraftItem);
    setStockSuggestions([]);
    setStockSuggestionOpen(false);
  };

  const handleAddVas = () => {
    const vasName = draftVas.vasName.trim();
    const qty     = Math.max(0, toNumber(draftVas.quantity));
    if (!vasName || qty <= 0) {
      toast({ variant: "destructive", title: "Invalid VAS", description: "Name and quantity required." });
      return;
    }
    setVasItems((p) => [
      ...p,
      {
        vasName, quantity: qty,
        rate: Math.max(0, toNumber(draftVas.rate)),
        gstPercent: isCashsale ? 0 : Math.max(0, toNumber(draftVas.gstPercent, 0)),
        room: draftVas.room || undefined,
        hsnCode: draftVas.hsnCode.trim() || undefined,
      },
    ]);
    setDraftVas(defaultDraftVas);
    setVasSuggestions(defaultVasComboboxOptions);
  };

  const handleSubmit = async () => {
    if (!user?.id || !user?.name)       { toast({ variant: "destructive", title: "Login required" }); return; }
    if (!selectedCustomer)              { toast({ variant: "destructive", title: "Customer required" }); return; }
    if (!salesmanId)                    { toast({ variant: "destructive", title: "Salesman required" }); return; }
    if (!store)                         { toast({ variant: "destructive", title: "Store required" }); return; }
    const trimmedInvoiceNo = invoiceNo.trim();
    if (!trimmedInvoiceNo && dealName === "Walkin-sale") {
      toast({ variant: "destructive", title: "Invoice No required" });
      return;
    }
    if (!items.length && !vasItems.length) { toast({ variant: "destructive", title: "Add at least one line" }); return; }

    setIsSubmitting(true);
    try {
      const normItems = isCashsale ? items.map((i) => ({ ...i, gstPercent: 0, gstMode: "INCL" as const })) : items;
      const normVas   = isCashsale ? vasItems.map((v) => ({ ...v, gstPercent: 0 })) : vasItems;

      const res = await createInstantQuotationOrderAction({
        leadId: leaddata?.id,
        customerId: selectedCustomer.id, customerName: selectedCustomer.name,
        mobile: selectedCustomer.mobile, email: selectedCustomer.email,
        addressLine1: selectedCustomer.addressLine1, pincode: selectedCustomer.pincode,
        salesmanId, dealName, store,
        orderType: isCashsale ? "delivery" : orderType,
        invoiceNo: dealName === "Walkin-sale" ? trimmedInvoiceNo : undefined,
        items: normItems, vasDetails: normVas,
        creator: { id: user.id, name: user.name },
      });

      if (!res.success) {
        toast({ variant: "destructive", title: "Creation failed", description: res.message }); return;
      }
      toast({ title: "Quotation created!", description: res.message });
      if (res.orderId) { router.push(`/dashboard/orders/${res.orderId}`); return; }
      const boot = await getInstantQuotationBootstrapAction();
      setNextDealIdPreview(boot.nextDealId);
      setItems([]); setVasItems([]);
    } finally { setIsSubmitting(false); }
  };

  /* ─────────────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────────────────*/
  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 md:px-8 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-end justify-between gap-4 pb-4 border-b">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
            Sales / Quotation
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Instant Quotation</h1>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground font-mono">
          <span>Deal</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-semibold text-primary">{nextDealIdPreview}</span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          CARD 1 — Basic Details
      ══════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <SectionIcon icon={FileText} />
            <div>
              <CardTitle className="text-base">Basic Details</CardTitle>
              <CardDescription>Customer · Salesman · Store · Deal type</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

            {/* Customer picker */}
            <div className="relative space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Customer <span className="text-destructive">*</span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => setIsCustomerDialogOpen(true)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  New
                </Button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search by name or mobile…"
                  value={customerQuery}
                  onFocus={() => setCustomerDropdownOpen(true)}
                  onChange={(e) => {
                    setSelectedCustomer(null);
                    setCustomerQuery(e.target.value);
                    setCustomerDropdownOpen(true);
                  }}
                />
              </div>

              {customerDropdownOpen && customerOptions.length > 0 && (
                <div className="absolute z-30 top-[calc(100%-0.5rem)] w-full rounded-md border bg-popover shadow-md max-h-52 overflow-auto">
                  {customerOptions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full px-3 py-2.5 text-left hover:bg-accent transition-colors"
                      onClick={() => handleSelectCustomer(c)}
                    >
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{c.mobile}</p>
                    </button>
                  ))}
                </div>
              )}

              {selectedCustomer ? (
                <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span className="text-xs font-medium truncate">
                    {selectedCustomer.name} · {selectedCustomer.mobile}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Select or create a customer to continue.</p>
              )}
            </div>

            {/* Salesman + Deal ID / Type */}
            <div className="space-y-3">
              <FormField label="Salesman" required>
                <Select value={salesmanId} onValueChange={setSalesmanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select salesman" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesmen.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{s.salesmanCode ? ` (${s.salesmanCode})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Deal ID
                  </Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted px-3">
                    <span className="text-sm font-mono font-semibold text-primary">
                      {nextDealIdPreview}
                    </span>
                  </div>
                </div>
                <FormField label="Deal Type">
                  <Select value={dealName} onValueChange={(v) => setDealName(v as typeof dealName)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cashsale">Cashsale</SelectItem>
                      <SelectItem value="Walkin-sale">Walkin-sale</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                {dealName === "Walkin-sale" &&(
                  <FormField label="Invoice No">
                    <Input
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      placeholder="Enter Invoice Number"
                    />
                  </FormField>
                )}
              </div>
            </div>

            {/* Store + Order Type */}
            <div className="space-y-3">
              <FormField label="Store" required>
                <Select value={store} onValueChange={setStore}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOptions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label as string}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Order Type">
                <Select
                  value={isCashsale ? "delivery" : orderType}
                  onValueChange={(v) => setOrderType(v as typeof orderType)}
                  disabled={isCashsale}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="stitching">Stitching</SelectItem>
                    <SelectItem value="stitching+installation">Stitching + Installation</SelectItem>
                  </SelectContent>
                </Select>
                {isCashsale && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Forced to Delivery for Cashsale.
                  </p>
                )}
              </FormField>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════
          CARD 2 — Items
      ══════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <SectionIcon icon={Package} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Items</CardTitle>
                {items.length > 0 && (
                  <Badge variant="secondary" className="rounded-full h-5 min-w-5 px-1.5 text-xs">
                    {items.length}
                  </Badge>
                )}
              </div>
              <CardDescription>Add products from stock</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Add item form */}
          <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              Add New Item
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">

              {/* BCN */}
              <div className="relative lg:col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">BCN</Label>
                <Input
                  placeholder="Search BCN…"
                  value={draftItem.bcn}
                  onFocus={() => setStockSuggestionOpen(true)}
                  onChange={(e) => {
                    setDraftItem((p) => ({
                      ...p,
                      bcn: e.target.value,
                      stockId: undefined,
                      unit: undefined,
                      stockUnit: undefined,
                    }));
                    setStockSuggestionOpen(true);
                  }}
                />
                {stockSuggestionOpen && draftItem.bcn.trim().length >= 2 && (
                  <div className="absolute z-30 top-full mt-1 w-full rounded-md border bg-popover shadow-md max-h-52 overflow-auto">
                    {isSearchingStock ? (
                      <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                      </div>
                    ) : stockSuggestions.length > 0 ? (
                      stockSuggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors"
                          onClick={() => handleSelectStock(s)}
                        >
                          <p className="text-sm font-medium font-mono">{s.bcn}</p>
                          <p className="text-xs text-muted-foreground">{s.name || s.itemName || "—"}</p>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-2.5 text-xs text-muted-foreground">No stock found.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="lg:col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Input
                  placeholder="Item description"
                  value={draftItem.description}
                  onChange={(e) => setDraftItem((p) => ({ ...p, description: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Qty</Label>
                <Input type="number" step="0.01" value={draftItem.quantity}
                  onChange={(e) => setDraftItem((p) => ({ ...p, quantity: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Rate</Label>
                <Input type="number" step="0.01" value={draftItem.rate}
                  onChange={(e) => setDraftItem((p) => ({ ...p, rate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Disc %</Label>
                <Input type="number" step="0.01" value={draftItem.discountPercent}
                  onChange={(e) => setDraftItem((p) => ({ ...p, discountPercent: e.target.value }))} />
              </div>

              {!isCashsale && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">GST Mode</Label>
                    <Select
                      value={draftItem.gstMode}
                      onValueChange={(v) => setDraftItem((p) => ({ ...p, gstMode: v as "EXCL" | "INCL" }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INCL">INCL</SelectItem>
                        <SelectItem value="EXCL">EXCL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">GST %</Label>
                    <Input type="number" step="0.01" value={draftItem.gstPercent}
                      onChange={(e) => setDraftItem((p) => ({ ...p, gstPercent: e.target.value }))} />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Room</Label>
                <Select value={draftItem.room} onValueChange={(v) => setDraftItem((p) => ({ ...p, room: v }))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {roomOptions.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label as string}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="lg:col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Remark</Label>
                <Input placeholder="Optional" value={draftItem.remark}
                  onChange={(e) => setDraftItem((p) => ({ ...p, remark: e.target.value }))} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={handleAddItem} className="gap-1.5">
                <PlusCircle className="h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>
          </div>

          {/* Items table */}
          {items.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 text-xs">#</TableHead>
                    <TableHead className="text-xs">BCN / Description</TableHead>
                    <TableHead className="text-xs">Qty</TableHead>
                    <TableHead className="text-xs">Rate</TableHead>
                    <TableHead className="text-xs">Disc %</TableHead>
                    {!isCashsale && <TableHead className="text-xs">GST Mode</TableHead>}
                    {!isCashsale && <TableHead className="text-xs">GST %</TableHead>}
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Room</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={`${item.bcn}-${idx}`}>
                      <TableCell className="text-muted-foreground text-xs font-mono">{idx + 1}</TableCell>
                      <TableCell>
                        <p className="font-medium text-xs font-mono">{item.bcn}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{item.quantity}</TableCell>
                      <TableCell className="font-mono text-sm">{item.rate}</TableCell>
                      <TableCell>{item.discountPercent || 0}%</TableCell>
                      {!isCashsale && (
                        <TableCell>
                          <Badge
                            variant={item.gstMode === "EXCL" ? "secondary" : "outline"}
                            className="text-[10px] uppercase"
                          >
                            {item.gstMode || "INCL"}
                          </Badge>
                        </TableCell>
                      )}
                      {!isCashsale && (
                        <TableCell>{item.gstPercent || 0}%</TableCell>
                      )}
                      <TableCell className="font-semibold font-mono text-sm">
                        ₹{fmt(lineAmount(item))}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {item.room || "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50">
                    <TableCell
                      colSpan={isCashsale ? 5 : 7}
                      className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3"
                    >
                      Goods Total
                    </TableCell>
                    <TableCell className="font-semibold font-mono py-3">₹{fmt(goodsTotal)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyRow message="No items added yet. Use the form above to add products." />
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════
          CARD 3 — VAS
      ══════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <SectionIcon icon={Wrench} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Value Added Services</CardTitle>
                {vasItems.length > 0 && (
                  <Badge variant="secondary" className="rounded-full h-5 min-w-5 px-1.5 text-xs">
                    {vasItems.length}
                  </Badge>
                )}
              </div>
              <CardDescription>Stitching, installation &amp; other services</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Add VAS form */}
          <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              Add VAS Line
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div className="lg:col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">VAS Name</Label>
                <Combobox
                  options={vasSuggestions.length ? vasSuggestions : defaultVasComboboxOptions}
                  value={draftVas.vasName}
                  onSearch={handleVasSearch}
                  onSelect={handleSelectVas}
                  placeholder="Search service"
                  searchPlaceholder="Search VAS..."
                  emptyPlaceholder="No service found."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Qty</Label>
                <Input type="number" step="0.01" value={draftVas.quantity}
                  onChange={(e) => setDraftVas((p) => ({ ...p, quantity: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Rate</Label>
                <Input type="number" step="0.01" value={draftVas.rate}
                  onChange={(e) => setDraftVas((p) => ({ ...p, rate: e.target.value }))} />
              </div>
              {!isCashsale && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">GST %</Label>
                  <Input type="number" step="0.01" value={draftVas.gstPercent}
                    onChange={(e) => setDraftVas((p) => ({ ...p, gstPercent: e.target.value }))} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Room</Label>
                <Select value={draftVas.room} onValueChange={(v) => setDraftVas((p) => ({ ...p, room: v }))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {roomOptions.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label as string}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">HSN</Label>
                <Input placeholder="Optional" value={draftVas.hsnCode}
                  onChange={(e) => setDraftVas((p) => ({ ...p, hsnCode: e.target.value }))} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={handleAddVas} className="gap-1.5">
                <PlusCircle className="h-3.5 w-3.5" />
                Add VAS
              </Button>
            </div>
          </div>

          {/* VAS table */}
          {vasItems.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 text-xs">#</TableHead>
                    <TableHead className="text-xs">VAS / HSN</TableHead>
                    <TableHead className="text-xs">Qty</TableHead>
                    <TableHead className="text-xs">Rate</TableHead>
                    {!isCashsale && <TableHead className="text-xs">GST %</TableHead>}
                    <TableHead className="text-xs">Room</TableHead>
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vasItems.map((vas, idx) => (
                    <TableRow key={`${vas.vasName}-${idx}`}>
                      <TableCell className="text-muted-foreground text-xs font-mono">{idx + 1}</TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{vas.vasName}</p>
                        {vas.hsnCode && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{vas.hsnCode}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono">{vas.quantity}</TableCell>
                      <TableCell className="font-mono">{vas.rate}</TableCell>
                      {!isCashsale && <TableCell>{vas.gstPercent || 0}%</TableCell>}
                      <TableCell className="text-muted-foreground text-xs">{vas.room || "—"}</TableCell>
                      <TableCell className="font-semibold font-mono">₹{fmt(vasLineAmount(vas))}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setVasItems((p) => p.filter((_, i) => i !== idx))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50">
                    <TableCell
                      colSpan={isCashsale ? 5 : 6}
                      className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide py-3"
                    >
                      VAS Total
                    </TableCell>
                    <TableCell className="font-semibold font-mono py-3">₹{fmt(vasTotal)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyRow message="No VAS added yet." />
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════
          Sticky footer — Summary + Submit
      ══════════════════════════════════════════════════════════ */}
      <div className="sticky bottom-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 py-3 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-sm">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">

          <div className="flex flex-wrap items-center gap-3">
            {/* Context */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5 shrink-0" />
              {selectedSalesman
                ? <span className="font-medium text-foreground">{selectedSalesman.name}</span>
                : <span className="text-destructive">No salesman</span>
              }
              <Separator orientation="vertical" className="h-3" />
              {selectedCustomer
                ? <span className="font-medium text-foreground">{selectedCustomer.name}</span>
                : <span className="text-destructive">No customer</span>
              }
              <Separator orientation="vertical" className="h-3" />
              <Badge
                variant={isCashsale ? "default" : "secondary"}
                className="text-[10px] px-1.5 py-0"
              >
                {dealName}
              </Badge>
            </div>

            {/* Totals */}
            <div className="flex items-center gap-1.5">
              <div className="rounded-md border bg-muted px-3 py-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Goods</p>
                <p className="text-sm font-semibold font-mono">₹{fmt(goodsTotal)}</p>
              </div>
              <div className="rounded-md border bg-muted px-3 py-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">VAS</p>
                <p className="text-sm font-semibold font-mono">₹{fmt(vasTotal)}</p>
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5">
                <p className="text-[10px] text-primary/70 uppercase tracking-wide">Total</p>
                <p className="text-sm font-bold font-mono text-primary">₹{fmt(grandTotal)}</p>
              </div>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isBootLoading || isSubmitting}
            className="shrink-0 gap-2"
          >
            {(isBootLoading || isSubmitting)
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <CheckCircle2 className="h-4 w-4" />
            }
            Create Quotation + Order
          </Button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          Dialog — New Customer
      ══════════════════════════════════════════════════════════ */}
      <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
            <DialogDescription>
              Fill in minimum details to create and select a customer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {([
              { label: "Full Name", key: "name",        required: true,  placeholder: "Customer full name" },
              { label: "Mobile",    key: "mobile",       required: true,  placeholder: "+91 XXXXX XXXXX" },
              { label: "Email",     key: "email",        required: false, placeholder: "Optional" },
              { label: "Address",   key: "addressLine1", required: false, placeholder: "Optional" },
              { label: "Pincode",   key: "pincode",      required: false, placeholder: "Optional" },
            ] as const).map(({ label, key, required, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label>
                  {label}
                  {required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <Input
                  placeholder={placeholder}
                  value={draftCustomer[key]}
                  onChange={(e) => setDraftCustomer((p) => ({ ...p, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCustomerDialogOpen(false)}
              disabled={isCreatingCustomer}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateCustomer}
              disabled={isCreatingCustomer}
              className="gap-1.5"
            >
              {isCreatingCustomer && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
