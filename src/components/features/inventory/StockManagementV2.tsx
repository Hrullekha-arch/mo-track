"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { 
  searchStockByBcn, 
  getStockById, 
  createStockItemAction, 
  updateStockQuantityAction, 
  reserveStockQuantityAction,
  updateStockBatchAction, 
  getSupplierCompanyOptionsAction, 
  getStockTransactions 
} from "@/app/dashboard/inventory/actions";
import { Stock, StockTransaction } from "@/lib/types";
import { 
  Loader2, 
  PlusCircle, 
  Package, 
  History, 
  TrendingUp, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  BarChart3,
  Box,
  DollarSign,
  Tags,
  Building2,
  Ruler,
  ArrowUpCircle,
  Trash,
  InfoIcon,
  CircleAlert,
  SquarePen,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getStockCategoryOptions,
  getStockSubcategories,
  resolveStockCategory,
  resolveStockCategoryGroup,
} from "@/lib/stock-category-rules";
import { db } from "@/lib/firebase";
import { deleteDoc, doc } from "firebase/firestore";
import { useRouter } from "next/navigation";


// ==================== HELPERS ====================
const toNumber = (value: any) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatDate = (date: string | Date | null | undefined) => {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const formatQty = (value?: number | string | null) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
};

// ==================== CONSTANTS ====================
const CATEGORY_OPTIONS = getStockCategoryOptions();
const UNIT_OPTIONS = ["PCS", "MTR", "SET"];
const SUPPLIER_OTHER = "__OTHER_SUPPLIER__";

// ==================== MAIN COMPONENT ====================
export function StockManagementV2() {
  const { toast } = useToast();
  const { user } = useAuth();

  // ========== STATE: Search & Selection ==========
  const [bcnOptions, setBcnOptions] = React.useState<ComboboxOption[]>([]);
  const [selected, setSelected] = React.useState<Stock | null>(null);
  const [isSearching, setIsSearching] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  // ========== STATE: Transactions ==========
  const [transactions, setTransactions] = React.useState<StockTransaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = React.useState(false);

  // ========== STATE: Add Length Dialog ==========
  const [isAddLengthOpen, setIsAddLengthOpen] = React.useState(false);
  const [isEditName, setIsEditName] = React.useState(false);
  const [deleteStockOpen, setDeleteStockOpen] = React.useState(false);
  const [addLengthQty, setAddLengthQty] = React.useState("");
  const [addLengthUnit, setAddLengthUnit] = React.useState("MTR");
  const [addBatchNo, setAddBatchNo] = React.useState("");
  const [addRack, setAddRack] = React.useState("");
  const [addWarehouseId, setAddWarehouseId] = React.useState("");
  const [isAdding, setIsAdding] = React.useState(false);
  // ========== STATE: reserved lenght ==========
  // ========== STATE: Reserve Stock Dialog ==========
  const [isReserveOpen, setIsReserveOpen] = React.useState(false);
  const [reserveQty, setReserveQty] = React.useState("");
  const [reserveOrderId, setReserveOrderId] = React.useState("");
  const [reserveCustomer, setReserveCustomer] = React.useState("");
  const [reserveNotes, setReserveNotes] = React.useState("");
  const [isReserving, setIsReserving] = React.useState(false);
  const [reserveAction, setReserveAction] = React.useState<"reserve" | "release">("reserve");


  // ========== STATE: Create Dialog ==========
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [supplierOptions, setSupplierOptions] = React.useState<ComboboxOption[]>([]);
  const [useCustomSupplierCompany, setUseCustomSupplierCompany] = React.useState(false);
  const [customSupplierCompany, setCustomSupplierCompany] = React.useState("");
  const [draft, setDraft] = React.useState({
    bcn: "",
    productId: "",
    name: "",
    category: "FABRIC",
    categoryGroup: "MAIN",
    unit: "MTR",
    isService: false,
    hsnOrSac: "",
    gstPercent: "",
    costPriceRs: "",
    costMultiplierRs: "",
    rrpWithGstRs: "",
    supplierCompanyName: "",
    supplierCollectionName: "",
    supplierCollectionCode: "",
    verticalRepeatCms: "",
    horizontalRepeatCms: "",
    totalQty: "",
    rack: "",
    isActive: true,
  });
  
const router = useRouter();

  // ========== LOAD OPTIONS FOR CREATE FORM ==========
  React.useEffect(() => {
    if (!isCreateOpen) return;
    const loadOptions = async () => {
      try {
        const supplierValues = await getSupplierCompanyOptionsAction();

        const uniqueSuppliers = Array.from(
          new Set((supplierValues || []).map((v) => String(v).trim()).filter(Boolean))
        );
        setSupplierOptions([
          ...uniqueSuppliers.map((v) => ({ value: v, label: v })),
          { value: SUPPLIER_OTHER, label: "➕ Add New" },
        ]);
      } catch (error) {
        console.error(error);
      }
    };
    loadOptions();
  }, [isCreateOpen]);

  // ========== HANDLERS ==========
  const handleSearch = async (query: string) => {
  const q = query?.trim();

  if (!q || q.length < 2) {
    return; // do NOT clear options
  }

  setIsSearching(true);

  try {
    const results = await searchStockByBcn(q);

    const mappedOptions = results.map((stock) => ({
      value: stock.id,
      label: `${stock.bcn} - ${stock.name || stock.itemName || "Unnamed"}`,
      stockItem: stock,
    }));

    setBcnOptions(mappedOptions as any);

    console.log(`Search for "${q}" returned ${results.length} results.`);
    console.table(
      mappedOptions.map((o) => ({
        value: o.value,
        label: o.label,
      }))
    );

  } catch (error) {
    console.error(error);
    toast({ variant: "destructive", title: "Search failed" });
  } finally {
    setIsSearching(false);
  }
};

React.useEffect(() => {
  console.log("Updated BCN options:", bcnOptions);
}, [bcnOptions]);


  const handleSelectStock = async (stock: Stock) => {
    setSelected(stock);
    setIsLoading(true);
    setIsLoadingTransactions(true);
    try {
      const stockId = stock.id || stock.bcn;
      const [refreshed, tx] = await Promise.all([
        getStockById(stockId),
        getStockTransactions(stockId),
      ]);
      if (refreshed) setSelected(refreshed);
      setTransactions(tx || []);
    } finally {
      setIsLoading(false);
      setIsLoadingTransactions(false);
    }
  };

  const handleQuickUpdate = async () => {
    if (!selected) return;
    const resolvedCategory = resolveStockCategory(selected.category) || selected.category || "FABRIC";
    const allowedGroups = getStockSubcategories(resolvedCategory);
    const resolvedGroup =
      resolveStockCategoryGroup(selected.categoryGroup, resolvedCategory) ||
      (allowedGroups.length ? allowedGroups[0] : selected.categoryGroup);
    const updates: Record<string, any> = {
      name: selected.name,
      category: resolvedCategory,
      categoryGroup: resolvedGroup,
      unit: selected.unit,
      isActive: selected.isActive,
      hsnOrSac: selected.hsnOrSac,
      gstPercent: selected.gstPercent,
      costPriceRs: selected.costPriceRs,
      rrpWithGstRs: selected.rrpWithGstRs,
      supplierCompanyName: selected.supplierCompanyName,
      supplierCollectionName: selected.supplierCollectionName,
      supplierCollectionCode: selected.supplierCollectionCode,
      verticalRepeatCms: selected.verticalRepeatCms,
      horizontalRepeatCms: selected.horizontalRepeatCms,
      productId: selected.productId,
      rack: selected.rack,
      updatedAt: new Date().toISOString(),
    };

    const result = await updateStockBatchAction([{ id: selected.id || selected.bcn, ...updates }]);
    if (!result.success) {
      toast({ variant: "destructive", title: "Update failed", description: result.message });
      return;
    }
    toast({ title: "✅ Updated", description: result.message });
    setIsEditName(false);
  };

  const handleAddLength = async () => {
    if (!selected) return;
    const qty = toNumber(addLengthQty);
    if (!qty || qty <= 0) {
      toast({ variant: "destructive", title: "Enter a valid quantity" });
      return;
    }
    setIsAdding(true);
    try {
      const result = await updateStockQuantityAction(selected.id || selected.bcn, {
        stockId: selected.id || selected.bcn,
        bcn: selected.bcn,
        type: "addition",
        quantityChange: qty,
        createdAt: new Date().toISOString(),
        createdBy: user?.name || "System",
        unit: addLengthUnit,
        batchNo: addBatchNo.trim() || undefined,
        rack: addRack.trim() || undefined,
        warehouseId: addWarehouseId.trim() || undefined,
      });

      if (!result.success) {
        toast({ variant: "destructive", title: "Failed", description: result.message });
        return;
      }
      toast({ title: "✅ Length added", description: `${qty} ${addLengthUnit} added successfully` });
      setIsAddLengthOpen(false);
      setAddLengthQty("");
      setAddBatchNo("");
      setAddRack("");
      setAddWarehouseId("");
      const [refreshed, tx] = await Promise.all([
        getStockById(selected.id || selected.bcn),
        getStockTransactions(selected.id || selected.bcn),
      ]);
      if (refreshed) setSelected(refreshed);
      setTransactions(tx || []);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Add length failed" });
    } finally {
      setIsAdding(false);
    }
  };
  
  const handledeleteStock = async (docId: string) => {
    setIsAdding(true);
    try {
      
      const docRef = doc(db, "stocks", docId);
      await deleteDoc(docRef);
      toast({ title: "✅ Stock Deleted", description: `Stock deleted successfully` });
      router.refresh();
      setIsAddLengthOpen(false);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "stock delete Failed" });
    } finally {
      setIsAdding(false);
    }
  };
  
  


  const handleCreateItem = async () => {
    const resolvedCategory = resolveStockCategory(draft.category) || "FABRIC";
    const resolvedCategoryGroup =
      resolveStockCategoryGroup(draft.categoryGroup, resolvedCategory) ||
      (getStockSubcategories(resolvedCategory)[0] || "");
    const resolvedSupplierCompany = useCustomSupplierCompany ? customSupplierCompany.trim() : draft.supplierCompanyName.trim();

    if (!draft.bcn.trim() || !draft.name.trim()) {
      toast({ variant: "destructive", title: "BCN and Item Name are required" });
      return;
    }
    if (!resolvedSupplierCompany || !draft.supplierCollectionName.trim() || !draft.supplierCollectionCode.trim()) {
      toast({ variant: "destructive", title: "Supplier details are required" });
      return;
    }
    function buildSearchTokens(value: string): string[] {
      return value
        .toLowerCase()
        .split(/\s+/)
        .map(w => w.replace(/[^a-z0-9]/g, ''))
        .filter(Boolean);
    }


    try {
      const result = await createStockItemAction({
        bcn: draft.bcn.trim(),
        name: draft.name.trim(),
        itemNameTokens: buildSearchTokens(draft.name),
        productId: draft.productId.trim() || null,
        category: resolvedCategory,
        categoryGroup: resolvedCategoryGroup || undefined,
        unit: draft.unit.trim(),
        isService: draft.isService,
        hsnOrSac: draft.hsnOrSac.trim() || null,
        gstPercent: toNumber(draft.gstPercent),
        costPriceRs: toNumber(draft.costPriceRs),
        costMultiplierRs: toNumber(draft.costMultiplierRs),
        rrpWithGstRs: toNumber(draft.rrpWithGstRs),
        supplierCompanyName: resolvedSupplierCompany,
        supplierCollectionName: draft.supplierCollectionName.trim(),
        supplierCollectionCode: draft.supplierCollectionCode.trim(),
        verticalRepeatCms: toNumber(draft.verticalRepeatCms),
        horizontalRepeatCms: toNumber(draft.horizontalRepeatCms),
        totalQty: toNumber(draft.totalQty) ?? 0,
        availableQty: toNumber(draft.totalQty) ?? 0,
        reservedQty: 0,
        damagedQty: 0,
        cutQty: 0,
        rack: draft.rack.trim() || null,
      });

      if (!result.success) {
        toast({ variant: "destructive", title: "Create failed", description: result.message });
        return;
      }
      toast({ title: "✅ Item created", description: result.message });
      setDraft({
        bcn: "",
        productId: "",
        name: "",
        category: "FABRIC",
        categoryGroup: "MAIN",
        unit: "MTR",
        isService: false,
        hsnOrSac: "",
        gstPercent: "",
        costPriceRs: "",
        costMultiplierRs: "",
        rrpWithGstRs: "",
        supplierCompanyName: "",
        supplierCollectionName: "",
        supplierCollectionCode: "",
        verticalRepeatCms: "",
        horizontalRepeatCms: "",
        totalQty: "",
        rack: "",
        isActive: true,
      });
      setUseCustomSupplierCompany(false);
      setCustomSupplierCompany("");
      setIsCreateOpen(false);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Create failed" });
    } finally {
      setIsCreating(false);
    }
  };

  // ========== COMPUTED ==========
  const metrics = selected
    ? [
        { label: "Total", value: formatQty(selected.totalQty), icon: Box, color: "text-blue-600" },
        { label: "Available", value: formatQty(selected.availableQty), icon: CheckCircle2, color: "text-green-600" },
        { label: "Reserved", value: formatQty(selected.reservedQty), icon: AlertCircle, color: "text-orange-600" },
        { label: "Damaged", value: formatQty(selected.damagedQty), icon: XCircle, color: "text-red-600" },
        { label: "Cut", value: formatQty(selected.cutQty), icon: BarChart3, color: "text-purple-600" },
      ]
    : [];

  const allTransactions = React.useMemo(
    () => [...transactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [transactions]
  );

  const stockTransactions = React.useMemo(() => allTransactions, [allTransactions]);

  // handle reserve stock
  const handleReserveStock = async () => {
  if (!selected) return;
  const qty = toNumber(reserveQty);
  if (!qty || qty <= 0) {
    toast({ variant: "destructive", title: "Enter a valid quantity" });
    return;
  }

  if (reserveAction === "reserve" && qty > (selected.availableQty ?? 0)) {
    toast({ variant: "destructive", title: "Insufficient available stock" });
    return;
  }

  if (reserveAction === "reserve" && !reserveOrderId.trim()) {
    toast({ variant: "destructive", title: "Order ID is required for reserve" });
    return;
  }

  if (reserveAction === "release" && qty > (selected.reservedQty ?? 0)) {
    toast({ variant: "destructive", title: "Cannot release more than reserved quantity" });
    return;
  }

  setIsReserving(true);
  try {
    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${selected.id || selected.bcn}-${Date.now()}`;

    const result = await reserveStockQuantityAction(selected.id || selected.bcn, {
      action: reserveAction,
      quantity: qty,
      bcn: selected.bcn,
      orderId: reserveOrderId.trim() || undefined,
      customerName: reserveCustomer.trim() || undefined,
      notes: reserveNotes.trim() || undefined,
      unit: selected.unit,
      createdBy: user?.name || "System",
      source: "MANUAL_INVENTORY_UI",
      requestId,
    });

    if (!result.success) {
      toast({ variant: "destructive", title: "Operation failed", description: result.message });
      return;
    }

    console.log("stock reserve status", result);

    toast({ 
      title: reserveAction === "reserve" ? "✅ Stock Reserved" : "✅ Stock Released", 
      description: `${qty} ${selected.unit} ${reserveAction === "reserve" ? "reserved" : "released"} successfully` 
    });

    setIsReserveOpen(false);
    setReserveQty("");
    setReserveOrderId("");
    setReserveCustomer("");
    setReserveNotes("");

    const [refreshed, tx] = await Promise.all([
      getStockById(selected.id || selected.bcn),
      getStockTransactions(selected.id || selected.bcn),
    ]);
    if (refreshed) setSelected(refreshed);
    setTransactions(tx || []);
  } catch (error) {
    console.error(error);
    toast({ variant: "destructive", title: "Operation failed" });
  } finally {
    setIsReserving(false);
  }
};

  const reservedTransactions = React.useMemo(
    () => allTransactions.filter((tx) => tx.type === "reservation" || tx.type === "release"),
    [allTransactions]
  );


  // ==================== RENDER ====================
  return (
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" />
            Stock Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage inventory, track transactions, and control stock levels
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} size="lg" className="gap-2">
          <PlusCircle className="h-5 w-5" />
          Add New Stock
        </Button>
      </div>

      {/* MAIN GRID */}
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* LEFT: SEARCH PANEL */}
        <Card className="lg:sticky lg:top-6 h-fit shadow-md">
          <CardHeader className="bg-gradient-to-br from-primary/5 to-primary/10">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Search Stock
            </CardTitle>
            <CardDescription>Find items by BCN or name</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Combobox
              options={bcnOptions}
              value={selected?.id}
              onSelect={(value) => {
                const option = bcnOptions.find((opt) => opt.value === value) as any;
                if (option?.stockItem) handleSelectStock(option.stockItem);
              }}
              onSearch={handleSearch}
              emptyPlaceholder={isSearching ? "Searching..." : "No stock found"}
              placeholder="🔍 Search by BCN or name..."
            />
          </CardContent>
        </Card>

        {/* RIGHT: DETAILS PANEL */}
        <div className="space-y-6">
          {selected ? (
            <>
              {/* STOCK HEADER CARD */}
              <Card className="shadow-md">
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-lg px-3 py-1 font-mono">
                          {selected.bcn}
                        </Badge>
                        <Badge variant={selected.isActive ? "default" : "secondary"}>
                          {selected.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="flex gap-2 items-center" >
                      <h2 className="text-2xl font-bold">{selected.name || selected.itemName} </h2> 
                      { isEditName ?<Button variant={"ghost"}  onClick={() => setIsEditName(false)}>
                                       <X className="h-8 w-8" />
                                    </Button>
                                  :<Button variant={"ghost"} onClick={() => setIsEditName(true)}>
                                       <SquarePen className="h-8 w-8" />
                                    </Button>
                      }
                      </div>
                      {isEditName&&(
                        <Input
                              value={selected.name || selected.itemName}
                              onChange={(e) => setSelected((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                            />
                      )}
                      <p className="text-sm text-muted-foreground">
                        {selected.category} • {selected.categoryGroup} • {selected.unit}
                      </p>
                    </div>
                    <div className="flex gap-2">
                    <div className="flex gap-2">
                      <Button onClick={() => setIsAddLengthOpen(true)} className="gap-2">
                        <ArrowUpCircle className="h-4 w-4" />
                        Add Stock
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button variant={"destructive"} onClick={() => setDeleteStockOpen(true)} className="gap-2">
                        <Trash className="h-4 w-4" />
                        Delete Stock
                      </Button>
                    </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* METRICS GRID */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {metrics.map((m) => (
                  <Card key={m.label} className="shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-muted-foreground">{m.label}</p>
                        <m.icon className={cn("h-5 w-5", m.color)} />
                      </div>
                      <p className="text-3xl font-bold">{m.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{selected.unit}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* TABS */}
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details" className="gap-2">
                    <Tags className="h-4 w-4" />
                    Details & Edit
                  </TabsTrigger>
                  <TabsTrigger value="reserved" className="gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Reserved ({formatQty(selected.reservedQty)})
                  </TabsTrigger>
                  <TabsTrigger value="transactions" className="gap-2">
                    <History className="h-4 w-4" />
                    Transactions
                  </TabsTrigger>
                </TabsList>


                {/* DETAILS TAB */}
                <TabsContent value="details" className="space-y-6 mt-6">
                  <Card className={cn("shadow-md", isLoading && "opacity-60")}>
                    <CardHeader className="bg-gradient-to-br from-primary/5 to-primary/10">
                      <CardTitle className="flex items-center gap-2">
                        <Tags className="h-5 w-5" />
                        Stock Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                      {/* Classification */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Classification
                        </h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>Category</Label>
                              <Select
                                value={resolveStockCategory(selected.category) || selected.category || "FABRIC"}
                                onValueChange={(value) =>
                                  setSelected((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          category: value,
                                          categoryGroup: getStockSubcategories(value)[0] || "",
                                        }
                                      : prev
                                  )
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {CATEGORY_OPTIONS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Category Group</Label>
                              <Select
                                value={resolveStockCategoryGroup(selected.categoryGroup, selected.category) || ""}
                                onValueChange={(value) =>
                                  setSelected((prev) =>
                                    prev ? { ...prev, categoryGroup: value } : prev
                                  )
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select group" />
                                </SelectTrigger>
                                <SelectContent>
                                  {getStockSubcategories(
                                    resolveStockCategory(selected.category) || selected.category
                                  ).map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          <div className="space-y-2">
                            <Label>Unit</Label>
                            <Input
                              value={selected.unit || ""}
                              onChange={(e) => setSelected((prev) => (prev ? { ...prev, unit: e.target.value } : prev))}
                            />
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Tax & Pricing */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Tax & Pricing
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label>HSN/SAC</Label>
                            <Input
                              value={selected.hsnOrSac || ""}
                              onChange={(e) => setSelected((prev) => (prev ? { ...prev, hsnOrSac: e.target.value } : prev))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>GST %</Label>
                            <Input
                              value={selected.gstPercent ?? ""}
                              onChange={(e) => setSelected((prev) => (prev ? { ...prev, gstPercent: toNumber(e.target.value) } : prev))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Cost Price (₹)</Label>
                            <Input
                              value={selected.costPriceRs ?? ""}
                              onChange={(e) => setSelected((prev) => (prev ? { ...prev, costPriceRs: toNumber(e.target.value) } : prev))}
                            />
                          </div>
                          <div className="space-y-2 md:col-span-3">
                            <Label>RRP with GST (₹)</Label>
                            <Input
                              value={selected.rrpWithGstRs ?? ""}
                              onChange={(e) => setSelected((prev) => (prev ? { ...prev, rrpWithGstRs: toNumber(e.target.value) } : prev))}
                            />
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Supplier */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Supplier Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label>Company</Label>
                            <Input
                              value={selected.supplierCompanyName || ""}
                              onChange={(e) => setSelected((prev) => (prev ? { ...prev, supplierCompanyName: e.target.value } : prev))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Collection</Label>
                            <Input
                              value={selected.supplierCollectionName || ""}
                              onChange={(e) => setSelected((prev) => (prev ? { ...prev, supplierCollectionName: e.target.value } : prev))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Collection Code</Label>
                            <Input
                              value={selected.supplierCollectionCode || ""}
                              onChange={(e) => setSelected((prev) => (prev ? { ...prev, supplierCollectionCode: e.target.value } : prev))}
                            />
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Specs */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <Ruler className="h-4 w-4" />
                          Specifications
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label>Horizontal Repeat (cms)</Label>
                            <Input
                              value={selected.horizontalRepeatCms ?? ""}
                              onChange={(e) => setSelected((prev) => (prev ? { ...prev, horizontalRepeatCms: toNumber(e.target.value) } : prev))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Vertical Repeat (cms)</Label>
                            <Input
                              value={selected.verticalRepeatCms ?? ""}
                              onChange={(e) => setSelected((prev) => (prev ? { ...prev, verticalRepeatCms: toNumber(e.target.value) } : prev))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Rack</Label>
                            <Input
                              value={selected.rack || ""}
                              onChange={(e) => setSelected((prev) => (prev ? { ...prev, rack: e.target.value } : prev))}
                            />
                          </div>
                        </div>
                      </div>

                      <Button onClick={handleQuickUpdate} className="w-full gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Save Changes
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* TRANSACTIONS TAB */}
                <TabsContent value="transactions" className="mt-6">
                  <Card className="shadow-md">
                    <CardHeader className="bg-gradient-to-br from-primary/5 to-primary/10">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <History className="h-5 w-5" />
                            Transaction History
                          </CardTitle>
                          <CardDescription>All stock movements for this BCN (add, reserve, release, cut)</CardDescription>
                        </div>
                        {isLoadingTransactions && <Loader2 className="h-5 w-5 animate-spin" />}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="rounded-lg border">
                        <div className="max-h-[500px] overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                              <tr className="border-b">
                                <th className="px-4 py-3 text-left font-semibold">Date & Time</th>
                                <th className="px-4 py-3 text-left font-semibold">Type</th>
                                <th className="px-4 py-3 text-right font-semibold">Quantity</th>
                                <th className="px-4 py-3 text-left font-semibold">Unit</th>
                                <th className="px-4 py-3 text-left font-semibold">Batch/Rack</th>
                                <th className="px-4 py-3 text-left font-semibold">Order ID</th>
                                <th className="px-4 py-3 text-left font-semibold">Created By</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stockTransactions.length ? (
                                stockTransactions.map((tx, idx) => (
                                  <tr
                                    key={tx.id || idx}
                                    className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                                  >
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {formatDate(tx.createdAt)}
                                    </td>
                                    <td className="px-4 py-3">
                                      <Badge
                                        variant={
                                          tx.type === "addition"
                                            ? "default"
                                            : tx.type === "release"
                                            ? "secondary"
                                            : "destructive"
                                        }
                                        className="gap-1"
                                      >
                                        {tx.type === "addition" ? (
                                          <>
                                            <TrendingUp className="h-3 w-3" />
                                            Added
                                          </>
                                        ) : tx.type === "reservation" ? (
                                          <>
                                            <AlertCircle className="h-3 w-3" />
                                            Reserved
                                          </>
                                        ) : tx.type === "release" ? (
                                          <>
                                            <CheckCircle2 className="h-3 w-3" />
                                            Released
                                          </>
                                        ) : (
                                          <>
                                            <XCircle className="h-3 w-3" />
                                            Cut
                                          </>
                                        )}
                                      </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                      {tx.type === "addition" || tx.type === "release" ? "+" : "-"}
                                      {formatQty(Math.abs(Number(tx.quantityChange ?? 0)))}
                                    </td>
                                    <td className="px-4 py-3">
                                      <Badge variant="outline">{tx.unit || selected.unit || "-"}</Badge>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                      {tx.batchNo ? (
                                        <span className="font-mono text-xs">Batch: {tx.batchNo}</span>
                                      ) : tx.rack ? (
                                        <span className="font-mono text-xs">Rack: {tx.rack}</span>
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                      {tx.orderId ? (
                                        <code className="text-xs bg-muted px-2 py-1 rounded">{tx.orderId}</code>
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                      {tx.createdBy || "System"}
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td className="px-4 py-12 text-center text-muted-foreground" colSpan={7}>
                                    <div className="flex flex-col items-center gap-2">
                                      <History className="h-8 w-8 text-muted-foreground/50" />
                                      <p className="font-medium">No transactions yet</p>
                                      <p className="text-xs">Add stock to see transaction history</p>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                {/* RESERVED STOCK TAB */}
                  <TabsContent value="reserved" className="mt-6">
                    <Card className="shadow-md">
                      <CardHeader className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <AlertCircle className="h-5 w-5 text-orange-600" />
                              Reserved Stock Management
                            </CardTitle>
                            <CardDescription>Reserve or release stock for specific orders</CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setReserveAction("reserve");
                                setIsReserveOpen(true);
                              }}
                              className="gap-2"
                            >
                              <PlusCircle className="h-4 w-4" />
                              Reserve Stock
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setReserveAction("release");
                                setIsReserveOpen(true);
                              }}
                              className="gap-2"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Release Stock
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-6">
                        {/* Reserved Stock Summary */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                          <Card className="bg-orange-50/50 dark:bg-orange-950/20 border-orange-200">
                            <CardContent className="pt-6">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm text-muted-foreground">Reserved</p>
                                <AlertCircle className="h-5 w-5 text-orange-600" />
                              </div>
                              <p className="text-3xl font-bold text-orange-600">{formatQty(selected.reservedQty)}</p>
                              <p className="text-xs text-muted-foreground mt-1">{selected.unit}</p>
                            </CardContent>
                          </Card>
                          <Card className="bg-green-50/50 dark:bg-green-950/20 border-green-200">
                            <CardContent className="pt-6">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm text-muted-foreground">Available</p>
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                              </div>
                              <p className="text-3xl font-bold text-green-600">{formatQty(selected.availableQty)}</p>
                              <p className="text-xs text-muted-foreground mt-1">{selected.unit}</p>
                            </CardContent>
                          </Card>
                          <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200">
                            <CardContent className="pt-6">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm text-muted-foreground">Total</p>
                                <Box className="h-5 w-5 text-blue-600" />
                              </div>
                              <p className="text-3xl font-bold text-blue-600">{formatQty(selected.totalQty)}</p>
                              <p className="text-xs text-muted-foreground mt-1">{selected.unit}</p>
                            </CardContent>
                          </Card>
                        </div>

                        <Separator className="my-6" />

                        {/* Reserved Stock History */}
                        <div>
                          <h3 className="text-sm font-semibold mb-4">Reservation History</h3>
                          <div className="rounded-lg border">
                            <div className="max-h-[400px] overflow-y-auto">
                              <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                                  <tr className="border-b">
                                    <th className="px-4 py-3 text-left font-semibold">Date & Time</th>
                                    <th className="px-4 py-3 text-left font-semibold">Action</th>
                                    <th className="px-4 py-3 text-right font-semibold">Quantity</th>
                                    <th className="px-4 py-3 text-left font-semibold">Order ID</th>
                                    <th className="px-4 py-3 text-left font-semibold">Customer</th>
                                    <th className="px-4 py-3 text-left font-semibold">Notes</th>
                                    <th className="px-4 py-3 text-left font-semibold">Created By</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {reservedTransactions.length ? (
                                    reservedTransactions.map((tx, idx) => (
                                      <tr
                                        key={tx.id || idx}
                                        className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                                      >
                                        <td className="px-4 py-3 whitespace-nowrap">
                                          {formatDate(tx.createdAt)}
                                        </td>
                                        <td className="px-4 py-3">
                                          <Badge
                                            variant={tx.type === "reservation" ? "default" : "secondary"}
                                            className="gap-1"
                                          >
                                            {tx.type === "reservation" ? (
                                              <>
                                                <AlertCircle className="h-3 w-3" />
                                                Reserved
                                              </>
                                            ) : (
                                              <>
                                                <CheckCircle2 className="h-3 w-3" />
                                                Released
                                              </>
                                            )}
                                          </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold">
                                          {tx.type === "reservation" ? "-" : "+"}
                                          {formatQty(tx.quantityChange ?? 0)}
                                        </td>
                                        <td className="px-4 py-3">
                                          {tx.orderId ? (
                                            <code className="text-xs bg-muted px-2 py-1 rounded">{tx.orderId}</code>
                                          ) : (
                                            <span className="text-muted-foreground">-</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                          {tx.customerName || "-"}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">
                                          {tx.notes || "-"}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                          {tx.createdBy || "System"}
                                        </td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td className="px-4 py-12 text-center text-muted-foreground" colSpan={7}>
                                        <div className="flex flex-col items-center gap-2">
                                          <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
                                          <p className="font-medium">No reservations yet</p>
                                          <p className="text-xs">Reserve stock for orders to track allocation</p>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
              </Tabs>
            </>
          ) : (
            // EMPTY STATE
            <Card className="shadow-md">
              <CardContent className="flex flex-col items-center justify-center py-24">
                <div className="rounded-full bg-primary/10 p-6 mb-6">
                  <Package className="h-16 w-16 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-2">No Stock Selected</h3>
                <p className="text-muted-foreground text-center max-w-md mb-6">
                  Search for a stock item using the search panel to view details, manage quantities, and track
                  transactions
                </p>
                <div className="flex gap-2">
                  <Badge variant="outline" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    View Details
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <ArrowUpCircle className="h-3 w-3" />
                    Add Stock
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <History className="h-3 w-3" />
                    Track History
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ==================== ADD LENGTH DIALOG ==================== */}
      <Dialog open={isAddLengthOpen} onOpenChange={setIsAddLengthOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5" />
              Add Stock Quantity
            </DialogTitle>
            <DialogDescription>
              Add new stock to <span className="font-semibold">{selected?.bcn}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <p className="text-sm font-medium">Current Stock</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Available</p>
                  <p className="text-lg font-bold">{formatQty(selected?.availableQty)} {selected?.unit}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="text-lg font-bold">{formatQty(selected?.totalQty)} {selected?.unit}</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-qty">Quantity *</Label>
                <Input
                  id="add-qty"
                  type="number"
                  placeholder="0"
                  value={addLengthQty}
                  onChange={(e) => setAddLengthQty(e.target.value)}
                  className="text-lg font-semibold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-unit">Unit</Label>
                <Select value={addLengthUnit} onValueChange={setAddLengthUnit}>
                  <SelectTrigger id="add-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-batch">Batch Number</Label>
              <Input
                id="add-batch"
                placeholder="Optional"
                value={addBatchNo}
                onChange={(e) => setAddBatchNo(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-rack">Rack</Label>
                <Input
                  id="add-rack"
                  placeholder="Optional"
                  value={addRack}
                  onChange={(e) => setAddRack(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-warehouse">Warehouse ID</Label>
                <Input
                  id="add-warehouse"
                  placeholder="Optional"
                  value={addWarehouseId}
                  onChange={(e) => setAddWarehouseId(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddLengthOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddLength} disabled={isAdding} className="gap-2">
              {isAdding && <Loader2 className="h-4 w-4 animate-spin" />}
              {isAdding ? "Adding..." : "Add Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ==================== Delete stock DIALOG ==================== */}
          <Dialog open={deleteStockOpen} onOpenChange={setDeleteStockOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleAlert className="h-5 w-5" />
              Delete Stock 
            </DialogTitle>
            <DialogDescription>
              This will Delete <span className="font-semibold">{selected?.bcn}</span> from Server and data base!!
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddLengthOpen(false)}>
              Cancel
            </Button>
            <Button onClick={()=>handledeleteStock(selected?.id)} disabled={isAdding} className="gap-2">
              {isAdding && <Loader2 className="h-4 w-4 animate-spin" />}
              {isAdding ? "Adding..." : "Add Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== CREATE STOCK DIALOG ==================== */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setDraft({
              bcn: "",
              productId: "",
              name: "",
              category: "FABRIC",
              categoryGroup: "MAIN",
              unit: "MTR",
              isService: false,
              hsnOrSac: "",
              gstPercent: "",
              costPriceRs: "",
              costMultiplierRs: "",
              rrpWithGstRs: "",
              supplierCompanyName: "",
              supplierCollectionName: "",
              supplierCollectionCode: "",
              verticalRepeatCms: "",
              horizontalRepeatCms: "",
              totalQty: "",
              rack: "",
              isActive: true,
            });
            setUseCustomCategoryGroup(false);
            setCustomCategoryGroup("");
            setUseCustomSupplierCompany(false);
            setCustomSupplierCompany("");
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <PlusCircle className="h-6 w-6" />
              Create New Stock Item
            </DialogTitle>
            <DialogDescription>
              Fill in the details to create a new inventory master record
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 space-y-6">
            {/* IDENTITY SECTION */}
            <div className="rounded-lg border p-5 space-y-4 bg-card">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Identity
                </h3>
                <Badge variant="destructive">Required</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bcn">BCN *</Label>
                  <Input
                    id="bcn"
                    placeholder="e.g., FAB-001"
                    value={draft.bcn}
                    onChange={(e) => setDraft((prev) => ({ ...prev, bcn: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productId">Product ID</Label>
                  <Input
                    id="productId"
                    placeholder="Optional"
                    value={draft.productId}
                    onChange={(e) => setDraft((prev) => ({ ...prev, productId: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name">Item Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Premium Cotton Fabric"
                    value={draft.name}
                    onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* CLASSIFICATION SECTION */}
            <div className="rounded-lg border p-5 space-y-4 bg-card">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Tags className="h-4 w-4" />
                Classification
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                    <Select
                      value={draft.category}
                      onValueChange={(value) =>
                        setDraft((prev) => ({
                          ...prev,
                          category: value,
                          categoryGroup: getStockSubcategories(value)[0] || "",
                        }))
                      }
                    >
                      <SelectTrigger id="category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                      {CATEGORY_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category Group</Label>
                    <Select
                      value={draft.categoryGroup}
                      onValueChange={(value) => setDraft((prev) => ({ ...prev, categoryGroup: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select group" />
                      </SelectTrigger>
                      <SelectContent>
                        {getStockSubcategories(draft.category).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit</Label>
                  <Select value={draft.unit} onValueChange={(value) => setDraft((prev) => ({ ...prev, unit: value }))}>
                    <SelectTrigger id="unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isService"
                  checked={draft.isService}
                  onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, isService: Boolean(checked) }))}
                />
                <Label htmlFor="isService" className="cursor-pointer">
                  Service item (VAS)
                </Label>
              </div>
            </div>

            {/* TAX & PRICING SECTION */}
            <div className="rounded-lg border p-5 space-y-4 bg-card">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Tax & Pricing
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hsn">HSN/SAC</Label>
                  <Input
                    id="hsn"
                    placeholder="e.g., 5407"
                    value={draft.hsnOrSac}
                    onChange={(e) => setDraft((prev) => ({ ...prev, hsnOrSac: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gst">GST %</Label>
                  <Input
                    id="gst"
                    type="number"
                    placeholder="e.g., 12"
                    value={draft.gstPercent}
                    onChange={(e) => setDraft((prev) => ({ ...prev, gstPercent: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cost">Cost Price (₹)</Label>
                  <Input
                    id="cost"
                    type="number"
                    placeholder="0.00"
                    value={draft.costPriceRs}
                    onChange={(e) => setDraft((prev) => ({ ...prev, costPriceRs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="multiplier">Cost Multiplier</Label>
                  <Input
                    id="multiplier"
                    type="number"
                    placeholder="1.5"
                    value={draft.costMultiplierRs}
                    onChange={(e) => setDraft((prev) => ({ ...prev, costMultiplierRs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="rrp">RRP with GST (₹)</Label>
                  <Input
                    id="rrp"
                    type="number"
                    placeholder="0.00"
                    value={draft.rrpWithGstRs}
                    onChange={(e) => setDraft((prev) => ({ ...prev, rrpWithGstRs: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* SUPPLIER SECTION */}
            <div className="rounded-lg border p-5 space-y-4 bg-card">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Supplier Information
                </h3>
                <Badge variant="destructive">Required</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Supplier Company *</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setUseCustomSupplierCompany(true);
                        setCustomSupplierCompany("");
                        setDraft((prev) => ({ ...prev, supplierCompanyName: "" }));
                      }}
                      title="Add new supplier"
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                  <Combobox
                    options={supplierOptions}
                    value={useCustomSupplierCompany ? "" : draft.supplierCompanyName}
                    onSelect={(value) => {
                      if (value === SUPPLIER_OTHER) {
                        setUseCustomSupplierCompany(true);
                        setDraft((prev) => ({ ...prev, supplierCompanyName: "" }));
                      } else {
                        setUseCustomSupplierCompany(false);
                        setCustomSupplierCompany("");
                        setDraft((prev) => ({ ...prev, supplierCompanyName: value }));
                      }
                    }}
                    placeholder="Select supplier"
                  />
                  {useCustomSupplierCompany && (
                    <Input
                      placeholder="Enter new supplier"
                      value={customSupplierCompany}
                      onChange={(e) => setCustomSupplierCompany(e.target.value)}
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="collection">Supplier Collection *</Label>
                  <Input
                    id="collection"
                    placeholder="e.g., Summer 2024"
                    value={draft.supplierCollectionName}
                    onChange={(e) => setDraft((prev) => ({ ...prev, supplierCollectionName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="collectionCode">Collection Code *</Label>
                  <Input
                    id="collectionCode"
                    placeholder="e.g., SM24"
                    value={draft.supplierCollectionCode}
                    onChange={(e) => setDraft((prev) => ({ ...prev, supplierCollectionCode: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* SPECS & STORAGE SECTION */}
            <div className="rounded-lg border p-5 space-y-4 bg-card">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Ruler className="h-4 w-4" />
                Specifications & Storage
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hRepeat">Horizontal Repeat (cms)</Label>
                  <Input
                    id="hRepeat"
                    type="number"
                    placeholder="0"
                    value={draft.horizontalRepeatCms}
                    onChange={(e) => setDraft((prev) => ({ ...prev, horizontalRepeatCms: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vRepeat">Vertical Repeat (cms)</Label>
                  <Input
                    id="vRepeat"
                    type="number"
                    placeholder="0"
                    value={draft.verticalRepeatCms}
                    onChange={(e) => setDraft((prev) => ({ ...prev, verticalRepeatCms: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rack">Rack</Label>
                  <Input
                    id="rack"
                    placeholder="e.g., A-12"
                    value={draft.rack}
                    onChange={(e) => setDraft((prev) => ({ ...prev, rack: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* OPENING STOCK SECTION */}
            <div className="rounded-lg border p-5 space-y-4 bg-card">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Box className="h-4 w-4" />
                Opening Stock
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="totalQty">Initial Quantity</Label>
                  <Input
                    id="totalQty"
                    type="number"
                    placeholder="0"
                    value={draft.totalQty}
                    onChange={(e) => setDraft((prev) => ({ ...prev, totalQty: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    This will be set as both total and available quantity
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateItem} disabled={isCreating} className="gap-2">
              {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
              {isCreating ? "Creating..." : "Create Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== RESERVE/RELEASE STOCK DIALOG ==================== */}
        <Dialog open={isReserveOpen} onOpenChange={setIsReserveOpen}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {reserveAction === "reserve" ? (
                  <>
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                    Reserve Stock
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    Release Reserved Stock
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {reserveAction === "reserve" 
                  ? `Reserve stock from ${selected?.bcn} for an order`
                  : `Release reserved stock back to available for ${selected?.bcn}`
                }
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-medium">Current Stock Status</p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Available</p>
                    <p className="text-lg font-bold text-green-600">{formatQty(selected?.availableQty)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Reserved</p>
                    <p className="text-lg font-bold text-orange-600">{formatQty(selected?.reservedQty)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total</p>
                    <p className="text-lg font-bold">{formatQty(selected?.totalQty)}</p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="reserve-qty" className="flex items-center justify-between">
                  <span>Quantity to {reserveAction === "reserve" ? "Reserve" : "Release"} *</span>
                  <Badge variant="outline">{selected?.unit}</Badge>
                </Label>
                <Input
                  id="reserve-qty"
                  type="number"
                  placeholder="0"
                  value={reserveQty}
                  onChange={(e) => setReserveQty(e.target.value)}
                  className="text-lg font-semibold"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reserve-order">Order ID {reserveAction === "reserve" ? "*" : ""}</Label>
                <Input
                  id="reserve-order"
                  placeholder="e.g., ORD-2024-001"
                  value={reserveOrderId}
                  onChange={(e) => setReserveOrderId(e.target.value)}
                />
              </div>

              {reserveAction === "reserve" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="reserve-customer">Customer Name</Label>
                    <Input
                      id="reserve-customer"
                      placeholder="Optional"
                      value={reserveCustomer}
                      onChange={(e) => setReserveCustomer(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reserve-notes">Notes</Label>
                    <Input
                      id="reserve-notes"
                      placeholder="Optional notes"
                      value={reserveNotes}
                      onChange={(e) => setReserveNotes(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsReserveOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleReserveStock} 
                disabled={isReserving} 
                className="gap-2"
                variant={reserveAction === "reserve" ? "default" : "secondary"}
              >
                {isReserving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isReserving 
                  ? (reserveAction === "reserve" ? "Reserving..." : "Releasing...")
                  : (reserveAction === "reserve" ? "Reserve Stock" : "Release Stock")
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

    </div>
  );
}
