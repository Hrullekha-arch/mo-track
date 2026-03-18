"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, PlusCircle, Trash2, UserPlus } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
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
import { roomOptions, storeOptions } from "@/lib/constants";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type SalesmanOption = {
  id: string;
  name: string;
  salesmanCode?: string;
};

type DraftCustomer = {
  name: string;
  mobile: string;
  email: string;
  addressLine1: string;
  pincode: string;
};

type DraftItem = {
  bcn: string;
  description: string;
  quantity: string;
  rate: string;
  discountPercent: string;
  gstPercent: string;
  gstMode: "EXCL" | "INCL";
  room: string;
  remark: string;
  stockId?: string;
};

type DraftVas = {
  vasName: string;
  quantity: string;
  rate: string;
  gstPercent: string;
  room: string;
  hsnCode: string;
};

const defaultDraftCustomer: DraftCustomer = {
  name: "",
  mobile: "",
  email: "",
  addressLine1: "",
  pincode: "",
};

const defaultDraftItem: DraftItem = {
  bcn: "",
  description: "",
  quantity: "1",
  rate: "",
  discountPercent: "0",
  gstPercent: "5",
  gstMode: "INCL",
  room: "",
  remark: "",
  stockId: undefined,
};

const defaultDraftVas: DraftVas = {
  vasName: "",
  quantity: "1",
  rate: "",
  gstPercent: "0",
  room: "",
  hsnCode: "",
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getStockRate = (stock?: Stock | null) => {
  if (!stock) return 0;
  const rrp = Number((stock as { rrpWithGstRs?: number }).rrpWithGstRs);
  if (Number.isFinite(rrp) && rrp > 0) return rrp;
  const mrp = Number(stock.mrp);
  if (Number.isFinite(mrp) && mrp > 0) return mrp;
  const cl = Number(stock.clPrice);
  if (Number.isFinite(cl) && cl > 0) return cl;
  const rl = Number(stock.rlPrice);
  if (Number.isFinite(rl) && rl > 0) return rl;
  return 0;
};

const lineAmount = (item: InstantItemInput) => {
  const qty = Math.max(0, toNumber(item.quantity));
  const rate = Math.max(0, toNumber(item.rate));
  const discountPercent = Math.max(0, Math.min(100, toNumber(item.discountPercent)));
  const gstPercent = Math.max(0, toNumber(item.gstPercent || 0));
  const gstMode = item.gstMode === "EXCL" ? "EXCL" : "INCL";

  const gross = qty * rate;
  const afterDiscount = gross * (1 - discountPercent / 100);
  return gstMode === "EXCL" ? afterDiscount * (1 + gstPercent / 100) : afterDiscount;
};

const vasLineAmount = (vas: InstantVasInput) => {
  const qty = Math.max(0, toNumber(vas.quantity));
  const rate = Math.max(0, toNumber(vas.rate));
  return qty * rate;
};

export default function QuotationBuilderPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading...</div>}>
      <QuotationBuilderInner />
    </Suspense>
  );
}

function QuotationBuilderInner() {

const searchParams = useSearchParams();

  const payload = searchParams.get("payload");

  const leaddata = useMemo<Walkin_Customer | null>(() => {
    if (!payload) return null;
    try {
      console.log("payload Data :",JSON.parse(decodeURIComponent(payload)) as Walkin_Customer);
      return JSON.parse(decodeURIComponent(payload)) as Walkin_Customer;
    } catch (e) {
      console.error("Payload parse failed:", e);
      return null;
    }
  }, [payload]);

  const leadAppliedRef = useRef(false);

  useEffect(() => {
    console.log("payload raw:", payload);
    console.log("lead Data:", leaddata);
  }, [payload, leaddata]);

  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [salesmen, setSalesmen] = useState<SalesmanOption[]>([]);
  const [nextDealIdPreview, setNextDealIdPreview] = useState("INQ-001");

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOptions, setCustomerOptions] = useState<InstantCustomerOption[]>([]);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<InstantCustomerOption | null>(null);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [draftCustomer, setDraftCustomer] = useState<DraftCustomer>(defaultDraftCustomer);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const [salesmanId, setSalesmanId] = useState("");
  const [dealName, setDealName] = useState<"Cashsale" | "Walkin-sale">("Walkin-sale");
  const [store, setStore] = useState("");
  const [orderType, setOrderType] = useState<"delivery" | "stitching" | "stitching+installation">("delivery");

  const [items, setItems] = useState<InstantItemInput[]>([]);
  const [draftItem, setDraftItem] = useState<DraftItem>(defaultDraftItem);
  const [vasItems, setVasItems] = useState<InstantVasInput[]>([]);
  const [draftVas, setDraftVas] = useState<DraftVas>(defaultDraftVas);
  const [stockSuggestions, setStockSuggestions] = useState<Stock[]>([]);
  const [stockSuggestionOpen, setStockSuggestionOpen] = useState(false);
  const [isSearchingStock, setIsSearchingStock] = useState(false);

  const goodsTotalAmount = useMemo(
    () => items.reduce((sum, item) => sum + lineAmount(item), 0),
    [items]
  );
  const vasTotalAmount = useMemo(
    () => vasItems.reduce((sum, vas) => sum + vasLineAmount(vas), 0),
    [vasItems]
  );
  const totalAmount = goodsTotalAmount + vasTotalAmount;

  useEffect(() => {
    let active = true;
    const loadBootstrap = async () => {
      setIsBootLoading(true);
      try {
        const [boot, customerSeed] = await Promise.all([
          getInstantQuotationBootstrapAction(),
          searchInstantCustomersAction(""),
        ]);
        if (!active) return;
        setSalesmen(boot.salesmen);
        setNextDealIdPreview(boot.nextDealId);
        setCustomerOptions(customerSeed);
        if (boot.salesmen.length > 0) {
          setSalesmanId(boot.salesmen[0].id);
        }
      } catch (error) {
        console.error("Failed to load quotation-builder bootstrap:", error);
      } finally {
        if (active) setIsBootLoading(false);
      }
    };

    loadBootstrap();
    return () => {
      active = false;
    };
  }, []);

  // Pre-fill form from payload sent by salesman dashboard (runs once after bootstrap)
  useEffect(() => {
    if (!leaddata || isBootLoading || leadAppliedRef.current) return;
    leadAppliedRef.current = true;

    const fullName = `${leaddata.firstName} ${leaddata.familyName}`.trim();
    const synthetic: InstantCustomerOption = {
      id: leaddata.id,
      name: fullName,
      mobile: leaddata.mobile,
      email: leaddata.email,
    };

    setSelectedCustomer(synthetic);
    setCustomerQuery(`${fullName} (${leaddata.mobile})`);
    setDealName("Cashsale");

    if (leaddata.salesmanId) {
      setSalesmanId(leaddata.salesmanId);
    }
  }, [leaddata, isBootLoading]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const options = await searchInstantCustomersAction(customerQuery.trim());
        setCustomerOptions(options);
      } catch (error) {
        console.error("Failed to search customers:", error);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [customerQuery]);

  useEffect(() => {
    const term = draftItem.bcn.trim();
    if (term.length < 2) {
      setStockSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingStock(true);
      try {
        const rows = await searchStockByBcn(term);
        setStockSuggestions(rows || []);
      } catch (error) {
        console.error("Failed to search stock:", error);
      } finally {
        setIsSearchingStock(false);
      }
    }, 240);

    return () => clearTimeout(timer);
  }, [draftItem.bcn]);

  const selectedSalesman = useMemo(
    () => salesmen.find((row) => row.id === salesmanId) || null,
    [salesmen, salesmanId]
  );
  const isCashsale = dealName === "Cashsale";

  useEffect(() => {
    if (!isCashsale) return;

    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        gstPercent: 0,
        gstMode: "INCL",
      }))
    );
    setVasItems((prev) =>
      prev.map((vas) => ({
        ...vas,
        gstPercent: 0,
      }))
    );
    setDraftItem((prev) => ({
      ...prev,
      gstPercent: "0",
      gstMode: "INCL",
    }));
    setDraftVas((prev) => ({
      ...prev,
      gstPercent: "0",
    }));
  }, [isCashsale]);

  const handleSelectCustomer = (customer: InstantCustomerOption) => {
    setSelectedCustomer(customer);
    setCustomerQuery(`${customer.name} (${customer.mobile})`);
    setCustomerDropdownOpen(false);
  };

  const handleCreateCustomer = async () => {
    if (!draftCustomer.name.trim() || !draftCustomer.mobile.trim()) {
      toast({
        variant: "destructive",
        title: "Missing details",
        description: "Customer name and mobile are required.",
      });
      return;
    }

    setIsCreatingCustomer(true);
    try {
      const result = await createInstantCustomerAction({
        name: draftCustomer.name,
        mobile: draftCustomer.mobile,
        email: draftCustomer.email || undefined,
        addressLine1: draftCustomer.addressLine1 || undefined,
        pincode: draftCustomer.pincode || undefined,
        createdBy: user?.name,
      });

      if (!result.success || !result.customer) {
        toast({
          variant: "destructive",
          title: "Failed to create customer",
          description: result.message,
        });
        return;
      }

      setSelectedCustomer(result.customer);
      setCustomerQuery(`${result.customer.name} (${result.customer.mobile})`);
      setDraftCustomer(defaultDraftCustomer);
      setIsCustomerDialogOpen(false);
      setCustomerDropdownOpen(false);

      toast({
        title: "Customer created",
        description: `${result.customer.name} is selected for this quotation.`,
      });
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  const handleSelectStock = (stock: Stock) => {
    const name = String(stock.name || stock.itemName || stock.bcn || "").trim();
    const gst = toNumber((stock as any).gstPercent, 5);
    setDraftItem((prev) => ({
      ...prev,
      bcn: String(stock.bcn || prev.bcn),
      description: name || prev.description,
      rate: String(getStockRate(stock) || prev.rate || ""),
      gstPercent: isCashsale ? "0" : String(gst > 0 ? gst : 5),
      stockId: stock.id,
    }));
    setStockSuggestionOpen(false);
  };

  const handleAddItem = () => {
    const bcn = draftItem.bcn.trim();
    const description = draftItem.description.trim();
    const quantity = Math.max(0, toNumber(draftItem.quantity));
    const rate = Math.max(0, toNumber(draftItem.rate));

    if (!bcn || !description || quantity <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid item",
        description: "BCN, description and quantity are required.",
      });
      return;
    }

    const row: InstantItemInput = {
      bcn,
      description,
      quantity,
      rate,
      discountPercent: Math.max(0, Math.min(100, toNumber(draftItem.discountPercent))),
      gstPercent: isCashsale ? 0 : Math.max(0, toNumber(draftItem.gstPercent, 5)),
      gstMode: isCashsale ? "INCL" : draftItem.gstMode,
      room: draftItem.room || undefined,
      remark: draftItem.remark || undefined,
      stockId: draftItem.stockId,
    };

    setItems((prev) => [...prev, row]);
    setDraftItem(defaultDraftItem);
    setStockSuggestions([]);
    setStockSuggestionOpen(false);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddVas = () => {
    const vasName = draftVas.vasName.trim();
    const quantity = Math.max(0, toNumber(draftVas.quantity));
    const rate = Math.max(0, toNumber(draftVas.rate));

    if (!vasName || quantity <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid VAS",
        description: "VAS name and quantity are required.",
      });
      return;
    }

    const row: InstantVasInput = {
      vasName,
      quantity,
      rate,
      gstPercent: isCashsale ? 0 : Math.max(0, toNumber(draftVas.gstPercent, 0)),
      room: draftVas.room || undefined,
      hsnCode: draftVas.hsnCode.trim() || undefined,
    };

    setVasItems((prev) => [...prev, row]);
    setDraftVas(defaultDraftVas);
  };

  const handleRemoveVas = (index: number) => {
    setVasItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async () => {
    if (!user?.id || !user?.name) {
      toast({
        variant: "destructive",
        title: "Login required",
        description: "Please login again before creating instant quotation.",
      });
      return;
    }
    if (!selectedCustomer) {
      toast({
        variant: "destructive",
        title: "Customer required",
        description: "Select an existing customer or create a new one.",
      });
      return;
    }
    if (!salesmanId) {
      toast({
        variant: "destructive",
        title: "Sales representative required",
        description: "Select the salesman handling this instant quotation.",
      });
      return;
    }
    if (!store) {
      toast({
        variant: "destructive",
        title: "Store required",
        description: "Select a store before creating order.",
      });
      return;
    }
    if (items.length === 0 && vasItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Lines missing",
        description: "Add at least one item or one VAS line.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const normalizedItems =
        dealName === "Cashsale"
          ? items.map((item) => ({ ...item, gstPercent: 0, gstMode: "INCL" as const }))
          : items;
      const normalizedVas =
        dealName === "Cashsale"
          ? vasItems.map((vas) => ({ ...vas, gstPercent: 0 }))
          : vasItems;

      const result = await createInstantQuotationOrderAction({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        mobile: selectedCustomer.mobile,
        email: selectedCustomer.email,
        addressLine1: selectedCustomer.addressLine1,
        pincode: selectedCustomer.pincode,
        salesmanId,
        dealName,
        store,
        orderType: dealName === "Cashsale" ? "delivery" : orderType,
        items: normalizedItems,
        vasDetails: normalizedVas,
        creator: {
          id: user.id,
          name: user.name,
        },
      });

      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Creation failed",
          description: result.message,
        });
        return;
      }

      toast({
        title: "Instant quotation created",
        description: result.message,
      });

      if (result.orderId) {
        router.push(`/dashboard/orders/${result.orderId}`);
        return;
      }

      const boot = await getInstantQuotationBootstrapAction();
      setNextDealIdPreview(boot.nextDealId);
      setItems([]);
      setVasItems([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Instant Quotation</h1>
        <p className="text-sm text-muted-foreground">
          Single-page flow: customer selection, item entry, quotation creation and instant order creation.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Basic Details</CardTitle>
          <CardDescription>Customer, sales representative, deal metadata and store.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-md border p-3 space-y-2 relative">
              <div className="flex items-center justify-between gap-2">
                <Label>Customer Name</Label>
                <Button variant="outline" size="sm" onClick={() => setIsCustomerDialogOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  New
                </Button>
              </div>
              <Input
                placeholder="Search customer by name or mobile..."
                value={customerQuery}
                onFocus={() => setCustomerDropdownOpen(true)}
                onChange={(event) => {
                  setSelectedCustomer(null);
                  setCustomerQuery(event.target.value);
                  setCustomerDropdownOpen(true);
                }}
              />
              {customerDropdownOpen && customerOptions.length > 0 && (
                <div className="absolute z-20 mt-1 w-[calc(100%-1.5rem)] rounded-md border bg-background shadow-sm max-h-56 overflow-auto">
                  {customerOptions.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-muted text-sm"
                      onClick={() => handleSelectCustomer(customer)}
                    >
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">{customer.mobile}</p>
                    </button>
                  ))}
                </div>
              )}
              {selectedCustomer ? (
                <p className="text-xs text-emerald-700">
                  Selected: {selectedCustomer.name} | {selectedCustomer.mobile}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Select a customer to continue.</p>
              )}
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <Label>Salesman</Label>
              <Select value={salesmanId} onValueChange={setSalesmanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select salesman" />
                </SelectTrigger>
                <SelectContent>
                  {salesmen.map((salesman) => (
                    <SelectItem key={salesman.id} value={salesman.id}>
                      {salesman.name}
                      {salesman.salesmanCode ? ` (${salesman.salesmanCode})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Deal ID</p>
                  <p className="font-medium">{nextDealIdPreview}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Deal Name</p>
                  <Select value={dealName} onValueChange={(value: "Cashsale" | "Walkin-sale") => setDealName(value)}>
                    <SelectTrigger className="h-8 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cashsale">Cashsale</SelectItem>
                      <SelectItem value="Walkin-sale">Walkin-sale</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Order ID</p>
                <p className="font-medium">Auto generated (MOTRACK-QuotationNo)</p>
              </div>
              <div>
                <Label>Store</Label>
                <Select value={store} onValueChange={setStore}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOptions.map((storeOption) => (
                      <SelectItem key={storeOption.value} value={storeOption.value}>
                        {storeOption.label as string}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Order Type</Label>
                <Select
                  value={isCashsale ? "delivery" : orderType}
                  onValueChange={(value: "delivery" | "stitching" | "stitching+installation") => setOrderType(value)}
                  disabled={isCashsale}
                >
                  <SelectTrigger className="mt-1">
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
                    Cashsale forces order type to delivery and bypasses invoicing.
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Previously Selected Items</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items added yet.</p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Discount %</TableHead>
                    {!isCashsale && <TableHead>GST Mode</TableHead>}
                    {!isCashsale && <TableHead>GST %</TableHead>}
                    <TableHead>Amount</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead className="text-right">Delete</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={`${item.bcn}-${index}`}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        <p className="font-medium">{item.bcn}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.rate}</TableCell>
                      <TableCell>{item.discountPercent || 0}</TableCell>
                      {!isCashsale && (
                        <TableCell>
                          <Badge variant="outline">{item.gstMode || "INCL"}</Badge>
                        </TableCell>
                      )}
                      {!isCashsale && <TableCell>{item.gstPercent || 0}</TableCell>}
                      <TableCell>{lineAmount(item).toFixed(2)}</TableCell>
                      <TableCell>{item.room || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={isCashsale ? 5 : 7} className="text-right font-semibold">
                      Total
                    </TableCell>
                    <TableCell className="font-semibold">{goodsTotalAmount.toFixed(2)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
          {isCashsale && (
            <p className="mt-2 text-xs text-muted-foreground">
              GST fields are disabled for Cashsale.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Add More Items</CardTitle>
          <CardDescription>Search BCN, auto-fill details from stock, then add to list.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="space-y-1 relative lg:col-span-2">
              <Label>BCN</Label>
              <Input
                placeholder="Search BCN..."
                value={draftItem.bcn}
                onFocus={() => setStockSuggestionOpen(true)}
                onChange={(event) => {
                  setDraftItem((prev) => ({ ...prev, bcn: event.target.value, stockId: undefined }));
                  setStockSuggestionOpen(true);
                }}
              />
              {stockSuggestionOpen && draftItem.bcn.trim().length >= 2 && (
                <div className="absolute z-20 mt-1 w-full rounded-md border bg-background shadow-sm max-h-56 overflow-auto">
                  {isSearchingStock ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching stock...
                    </div>
                  ) : stockSuggestions.length > 0 ? (
                    stockSuggestions.map((stock) => (
                      <button
                        key={stock.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted"
                        onClick={() => handleSelectStock(stock)}
                      >
                        <p className="font-medium text-sm">{stock.bcn}</p>
                        <p className="text-xs text-muted-foreground">{stock.name || stock.itemName || "-"}</p>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No stock found.</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1 lg:col-span-2">
              <Label>Description</Label>
              <Input
                placeholder="Item description"
                value={draftItem.description}
                onChange={(event) => setDraftItem((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input
                type="number"
                step="0.01"
                value={draftItem.quantity}
                onChange={(event) => setDraftItem((prev) => ({ ...prev, quantity: event.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Rate</Label>
              <Input
                type="number"
                step="0.01"
                value={draftItem.rate}
                onChange={(event) => setDraftItem((prev) => ({ ...prev, rate: event.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Discount %</Label>
              <Input
                type="number"
                step="0.01"
                value={draftItem.discountPercent}
                onChange={(event) => setDraftItem((prev) => ({ ...prev, discountPercent: event.target.value }))}
              />
            </div>

            {!isCashsale && (
              <div className="space-y-1">
                <Label>GST Mode</Label>
                <Select
                  value={draftItem.gstMode}
                  onValueChange={(value: "EXCL" | "INCL") => setDraftItem((prev) => ({ ...prev, gstMode: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCL">INCL</SelectItem>
                    <SelectItem value="EXCL">EXCL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isCashsale && (
              <div className="space-y-1">
                <Label>GST %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={draftItem.gstPercent}
                  onChange={(event) => setDraftItem((prev) => ({ ...prev, gstPercent: event.target.value }))}
                />
              </div>
            )}

            <div className="space-y-1">
              <Label>Room</Label>
              <Select value={draftItem.room} onValueChange={(value) => setDraftItem((prev) => ({ ...prev, room: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="--SELECT--" />
                </SelectTrigger>
                <SelectContent>
                  {roomOptions.map((room) => (
                    <SelectItem key={room.value} value={room.value}>
                      {room.label as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 lg:col-span-2">
              <Label>Remark</Label>
              <Input
                placeholder="Optional remark"
                value={draftItem.remark}
                onChange={(event) => setDraftItem((prev) => ({ ...prev, remark: event.target.value }))}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={handleAddItem}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">VAS Details</CardTitle>
          <CardDescription>These lines are included in quotation and pushed to stock verification/purchase flow.</CardDescription>
        </CardHeader>
        <CardContent>
          {vasItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No VAS added yet.</p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>VAS</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Rate</TableHead>
                    {!isCashsale && <TableHead>GST %</TableHead>}
                    <TableHead>Room</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Delete</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vasItems.map((vas, index) => (
                    <TableRow key={`${vas.vasName}-${index}`}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        <p className="font-medium">{vas.vasName}</p>
                        <p className="text-xs text-muted-foreground">{vas.hsnCode || "-"}</p>
                      </TableCell>
                      <TableCell>{vas.quantity}</TableCell>
                      <TableCell>{vas.rate}</TableCell>
                      {!isCashsale && <TableCell>{vas.gstPercent || 0}</TableCell>}
                      <TableCell>{vas.room || "-"}</TableCell>
                      <TableCell>{vasLineAmount(vas).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveVas(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={isCashsale ? 5 : 6} className="text-right font-semibold">
                      VAS Total
                    </TableCell>
                    <TableCell className="font-semibold">{vasTotalAmount.toFixed(2)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Add VAS</CardTitle>
          <CardDescription>Add value-added service/material lines.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="space-y-1 lg:col-span-2">
              <Label>VAS Name</Label>
              <Input
                placeholder="Enter VAS name"
                value={draftVas.vasName}
                onChange={(event) => setDraftVas((prev) => ({ ...prev, vasName: event.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input
                type="number"
                step="0.01"
                value={draftVas.quantity}
                onChange={(event) => setDraftVas((prev) => ({ ...prev, quantity: event.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Rate</Label>
              <Input
                type="number"
                step="0.01"
                value={draftVas.rate}
                onChange={(event) => setDraftVas((prev) => ({ ...prev, rate: event.target.value }))}
              />
            </div>

            {!isCashsale && (
              <div className="space-y-1">
                <Label>GST %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={draftVas.gstPercent}
                  onChange={(event) => setDraftVas((prev) => ({ ...prev, gstPercent: event.target.value }))}
                />
              </div>
            )}

            <div className="space-y-1">
              <Label>Room</Label>
              <Select value={draftVas.room} onValueChange={(value) => setDraftVas((prev) => ({ ...prev, room: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="--SELECT--" />
                </SelectTrigger>
                <SelectContent>
                  {roomOptions.map((room) => (
                    <SelectItem key={room.value} value={room.value}>
                      {room.label as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>HSN (Optional)</Label>
              <Input
                placeholder="HSN code"
                value={draftVas.hsnCode}
                onChange={(event) => setDraftVas((prev) => ({ ...prev, hsnCode: event.target.value }))}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={handleAddVas}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add VAS
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {selectedSalesman ? `Salesman: ${selectedSalesman.name}` : "Select salesman"} |{" "}
          {selectedCustomer ? `Customer: ${selectedCustomer.name}` : "Select customer"} | Goods: Rs {goodsTotalAmount.toFixed(2)} | VAS: Rs {vasTotalAmount.toFixed(2)} | Total: Rs {totalAmount.toFixed(2)}
        </div>
        <Button onClick={handleSubmit} disabled={isBootLoading || isSubmitting}>
          {(isBootLoading || isSubmitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Instant Quotation + Order
        </Button>
      </div>

      <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Customer</DialogTitle>
            <DialogDescription>
              Fill minimum details and continue with instant quotation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Customer Name</Label>
              <Input
                value={draftCustomer.name}
                onChange={(event) => setDraftCustomer((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Mobile</Label>
              <Input
                value={draftCustomer.mobile}
                onChange={(event) => setDraftCustomer((prev) => ({ ...prev, mobile: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Email (Optional)</Label>
              <Input
                value={draftCustomer.email}
                onChange={(event) => setDraftCustomer((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Address (Optional)</Label>
              <Input
                value={draftCustomer.addressLine1}
                onChange={(event) => setDraftCustomer((prev) => ({ ...prev, addressLine1: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Pincode (Optional)</Label>
              <Input
                value={draftCustomer.pincode}
                onChange={(event) => setDraftCustomer((prev) => ({ ...prev, pincode: event.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCustomerDialogOpen(false)} disabled={isCreatingCustomer}>
              Cancel
            </Button>
            <Button onClick={handleCreateCustomer} disabled={isCreatingCustomer}>
              {isCreatingCustomer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
