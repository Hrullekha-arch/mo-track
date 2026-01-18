"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  Edit,
  Loader2,
  RefreshCw,
  Tag,
  Building,
  Warehouse,
  Ruler,
  Layers,
  BadgePercent,
  ChevronRight,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  searchStockByBcn,
  getStockTransactions,
  getStockById,
  updateStockBatchAction,
} from "@/app/dashboard/inventory/actions";

/** ✅ Updated Inventory Types (match new fields) */
type InventoryItem = {
  id?: string;
  bcn: string;
  itemName?: string;

  categoryGroup?: string;
  category?: string;
  unit?: string;
  type?: string;
  width?: number;

  moCollection?: string;
  moCollectionCode?: string;

  maxlevel?: number;
  closingstock?: number;

  supplierCompanyName?: string;
  supplierCollectionName?: string;
  supplierCollectionCode?: string;

  composition?: string;
  martindale?: number;
  weightGsm?: number;

  horizontalRepeatCms?: number;
  verticalRepeatCms?: number;

  costPriceRs?: number;
  costMultiplierRs?: number;
  rrpWithGstRs?: number;
  rack?: string;
};

type StockTransaction = {
  id: string;
  createdAt: string;
  type?: string; // "addition" | "deduction" | etc (keep flexible)
  quantityChange: number;
  orderId?: string;
  poNumber?: string;
  salesman?: string;
  status?: string;
  note?: string;
};

type EditableStockFields = {
  itemName: string;
  closingstock: string;
  maxlevel: string;
  category: string;
  categoryGroup: string;
  width: string;
  unit: string;
  type: string;
  moCollection: string;
  moCollectionCode: string;
  supplierCompanyName: string;
  supplierCollectionName: string;
  supplierCollectionCode: string;
  composition: string;
  martindale: string;
  weightGsm: string;
  horizontalRepeatCms: string;
  verticalRepeatCms: string;
  costPriceRs: string;
  costMultiplierRs: string;
  rrpWithGstRs: string;
  rack: string;
};

type QuickEditField = "costPriceRs" | "costMultiplierRs" | "rrpWithGstRs" | "rack";

const emptyEditValues: EditableStockFields = {
  itemName: "",
  closingstock: "",
  maxlevel: "",
  category: "",
  categoryGroup: "",
  width: "",
  unit: "",
  type: "",
  moCollection: "",
  moCollectionCode: "",
  supplierCompanyName: "",
  supplierCollectionName: "",
  supplierCollectionCode: "",
  composition: "",
  martindale: "",
  weightGsm: "",
  horizontalRepeatCms: "",
  verticalRepeatCms: "",
  costPriceRs: "",
  costMultiplierRs: "",
  rrpWithGstRs: "",
  rack: "",
};

const toInputValue = (value: number | string | undefined | null) => {
  if (value === 0) return "0";
  if (value == null) return "";
  return String(value);
};

const toNumberValue = (value: string) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toEditValues = (stock: InventoryItem): EditableStockFields => ({
  itemName: toInputValue(stock.itemName),
  closingstock: toInputValue(stock.closingstock),
  maxlevel: toInputValue(stock.maxlevel),
  category: toInputValue(stock.category),
  categoryGroup: toInputValue(stock.categoryGroup),
  width: toInputValue(stock.width),
  unit: toInputValue(stock.unit),
  type: toInputValue(stock.type),
  moCollection: toInputValue(stock.moCollection),
  moCollectionCode: toInputValue(stock.moCollectionCode),
  supplierCompanyName: toInputValue(stock.supplierCompanyName),
  supplierCollectionName: toInputValue(stock.supplierCollectionName),
  supplierCollectionCode: toInputValue(stock.supplierCollectionCode),
  composition: toInputValue(stock.composition),
  martindale: toInputValue(stock.martindale),
  weightGsm: toInputValue(stock.weightGsm),
  horizontalRepeatCms: toInputValue(stock.horizontalRepeatCms),
  verticalRepeatCms: toInputValue(stock.verticalRepeatCms),
  costPriceRs: toInputValue(stock.costPriceRs),
  costMultiplierRs: toInputValue(stock.costMultiplierRs),
  rrpWithGstRs: toInputValue(stock.rrpWithGstRs),
  rack: toInputValue(stock.rack),
});

const getStockDocId = (stock: InventoryItem) => stock.id || stock.bcn;

const money = (v: any) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
};

const num = (v: any) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN");
};
const CutHistoryView = ({ history }: { history: StockTransaction[] | undefined }) => {
    if (!history || history.length === 0) {
        return <p className="text-xs text-muted-foreground px-4 py-2">No cuts from this roll.</p>;
    }
    return (
        <div className="p-2 bg-muted/50">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="h-8 text-xs">Date</TableHead>
                        <TableHead className="h-8 text-xs text-right">Qty Cut</TableHead>
                        <TableHead className="h-8 text-xs">Order ID</TableHead>
                        <TableHead className="h-8 text-xs">Salesman</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {history.map(cut => (
                        <TableRow key={cut.id}>
                            <TableCell className="py-1 text-xs">{format(new Date(cut.createdAt), 'dd/MM/yy')}</TableCell>
                            <TableCell className="py-1 text-xs text-right font-mono text-destructive">{Math.abs(cut.quantityChange).toFixed(2)}</TableCell>
                            <TableCell className="py-1 text-xs">{cut.orderId}</TableCell>
                            <TableCell className="py-1 text-xs">{cut.salesman}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};

export function StockManagement() {
  const [bcnOptions, setBcnOptions] = React.useState<ComboboxOption[]>([]);
  const [selectedStock, setSelectedStock] = React.useState<InventoryItem | null>(
    null
  );
  const [transactions, setTransactions] = React.useState<StockTransaction[]>(
    []
  );

  const [isSearching, setIsSearching] = React.useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isEditingAll, setIsEditingAll] = React.useState(false);
  const [quickEditField, setQuickEditField] = React.useState<QuickEditField | null>(null);
  const [editValues, setEditValues] = React.useState<EditableStockFields>(emptyEditValues);
  const [isSavingEdits, setIsSavingEdits] = React.useState(false);

  const { toast } = useToast();

  React.useEffect(() => {
    if (!selectedStock) {
      setEditValues(emptyEditValues);
      setIsEditingAll(false);
      setQuickEditField(null);
      return;
    }
    setEditValues(toEditValues(selectedStock));
    setIsEditingAll(false);
    setQuickEditField(null);
  }, [selectedStock?.id, selectedStock?.bcn]);

  const updateEditValue = (field: keyof EditableStockFields, value: string) => {
    setEditValues((prev) => ({ ...prev, [field]: value }));
  };

  const startEditAll = () => {
    if (!selectedStock) return;
    setEditValues(toEditValues(selectedStock));
    setIsEditingAll(true);
    setQuickEditField(null);
  };

  const cancelEditAll = () => {
    if (selectedStock) {
      setEditValues(toEditValues(selectedStock));
    }
    setIsEditingAll(false);
  };

  const startQuickEdit = (field: QuickEditField) => {
    if (!selectedStock) return;
    setEditValues(toEditValues(selectedStock));
    setQuickEditField(field);
    setIsEditingAll(false);
  };

  const cancelQuickEdit = () => {
    if (selectedStock) {
      setEditValues(toEditValues(selectedStock));
    }
    setQuickEditField(null);
  };

  const handleSaveAll = async () => {
    if (!selectedStock) return;
    setIsSavingEdits(true);
    try {
      const stockDocId = getStockDocId(selectedStock);
      const updates: Partial<InventoryItem> = {
        itemName: editValues.itemName.trim(),
        closingstock: toNumberValue(editValues.closingstock),
        maxlevel: toNumberValue(editValues.maxlevel),
        category: editValues.category.trim(),
        categoryGroup: editValues.categoryGroup.trim(),
        width: toNumberValue(editValues.width),
        unit: editValues.unit.trim(),
        type: editValues.type.trim(),
        moCollection: editValues.moCollection.trim(),
        moCollectionCode: editValues.moCollectionCode.trim(),
        supplierCompanyName: editValues.supplierCompanyName.trim(),
        supplierCollectionName: editValues.supplierCollectionName.trim(),
        supplierCollectionCode: editValues.supplierCollectionCode.trim(),
        composition: editValues.composition.trim(),
        martindale: toNumberValue(editValues.martindale),
        weightGsm: toNumberValue(editValues.weightGsm),
        horizontalRepeatCms: toNumberValue(editValues.horizontalRepeatCms),
        verticalRepeatCms: toNumberValue(editValues.verticalRepeatCms),
        costPriceRs: toNumberValue(editValues.costPriceRs),
        costMultiplierRs: toNumberValue(editValues.costMultiplierRs),
        rrpWithGstRs: toNumberValue(editValues.rrpWithGstRs),
        rack: editValues.rack.trim(),
      };

      const result = await updateStockBatchAction([{ id: stockDocId, ...updates }]);

      if (result.success) {
        setSelectedStock((prev) => (prev ? { ...prev, ...updates } : prev));
        setIsEditingAll(false);
        toast({ title: "Stock updated" });
      } else {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: result.message,
        });
      }
    } catch (error) {
      console.error("Error updating stock:", error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "An unexpected server error occurred.",
      });
    } finally {
      setIsSavingEdits(false);
    }
  };

  const handleSaveQuickEdit = async (field: QuickEditField) => {
    if (!selectedStock) return;
    setIsSavingEdits(true);
    try {
      const stockDocId = getStockDocId(selectedStock);
      const updates: Partial<InventoryItem> = {};
      if (field === "rack") {
        updates.rack = editValues.rack.trim();
      } else {
        updates[field] = toNumberValue(editValues[field]) as InventoryItem[QuickEditField];
      }
      const result = await updateStockBatchAction([{ id: stockDocId, ...updates }]);
      if (result.success) {
        setSelectedStock((prev) => (prev ? { ...prev, ...updates } : prev));
        setQuickEditField(null);
        toast({ title: "Stock updated" });
      } else {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: result.message,
        });
      }
    } catch (error) {
      console.error("Error updating stock:", error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "An unexpected server error occurred.",
      });
    } finally {
      setIsSavingEdits(false);
    }
  };

  const renderQuickEditControls = (field: QuickEditField) => {
    if (isEditingAll) return null;
    if (quickEditField === field) {
      return (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => handleSaveQuickEdit(field)}
            disabled={isSavingEdits}
          >
            {isSavingEdits ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={cancelQuickEdit}
            disabled={isSavingEdits}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => startQuickEdit(field)}
        disabled={isSavingEdits || (!!quickEditField && quickEditField !== field)}
      >
        <Edit className="h-3 w-3" />
      </Button>
    );
  };

  const handleBcnSearch = async (query: string) => {
    if (query.length < 2) {
      setBcnOptions([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = (await searchStockByBcn(query)) as any[];

      const options = results.map((stock) => {
        const cs = Number(stock.closingstock ?? stock.availableQty ?? 0);
        return {
          value: stock.bcn, // ✅ use BCN as unique selection key
          label: `${stock.bcn} - ${stock.itemName || "Unnamed"} (${Number.isFinite(
            cs
          )
            ? cs
            : 0
          })`,
          stockItem: stock,
        };
      });

      setBcnOptions(options as any);
    } catch (error) {
      console.error("Error searching BCN:", error);
      toast({ variant: "destructive", title: "Search failed" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectStock = React.useCallback(
    async (stockItem: InventoryItem) => {
      setSelectedStock(stockItem);
      setIsLoadingDetails(true);
      try {
        const stockDocId = getStockDocId(stockItem);
        const tx = (await getStockTransactions(stockDocId)) as any[];
        setTransactions(tx || []);
      } catch (error) {
        toast({ variant: "destructive", title: "Error fetching details" });
        setTransactions([]);
      } finally {
        setIsLoadingDetails(false);
      }
    },
    [toast]
  );

  const handleRefresh = async () => {
    if (!selectedStock) return;
    setIsRefreshing(true);
    try {
      const stockDocId = getStockDocId(selectedStock);
      const freshStock = (await getStockById(stockDocId)) as any;
      if (freshStock) {
        await handleSelectStock(freshStock);
        toast({ title: "Data refreshed" });
      } else {
        toast({
          variant: "destructive",
          title: "Refresh Failed",
          description: "Could not find the stock item.",
        });
        setSelectedStock(null);
        setTransactions([]);
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Refresh Failed" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const lowStock =
    selectedStock &&
    Number.isFinite(Number(selectedStock.closingstock)) &&
    Number.isFinite(Number(selectedStock.maxlevel)) &&
    Number(selectedStock.maxlevel) > 0 &&
    Number(selectedStock.closingstock) <= Number(selectedStock.maxlevel);

  const stockAddedTransactions = transactions.filter(
    (t) => (t.type || "").toLowerCase() === "addition"
  );
  const stockSoldTransactions = transactions.filter(
    (t) => (t.type || "").toLowerCase() === "deduction"
  );

  console.log("Selected Stock:", selectedStock);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock Management</CardTitle>
        <CardDescription>
          Select an item to view its details and transaction history.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-end gap-4">
          <div className="w-full max-w-sm space-y-2">
            <Label htmlFor="search-stock">Search Stock</Label>
            <Combobox
              options={bcnOptions}
              value={selectedStock?.bcn}
              onSelect={(value) => {
                const selectedOption = bcnOptions.find(
                  (opt) => opt.value === value
                ) as any;
                if (selectedOption) {
                  handleSelectStock(selectedOption.stockItem);
                }
              }}
              placeholder="Search by BCN or Item Name..."
              searchPlaceholder="Type to search..."
              emptyPlaceholder={isSearching ? "Searching..." : "No stock found."}
              onSearch={handleBcnSearch}
            />
          </div>
        </div>

        {selectedStock && (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {isEditingAll ? (
                      <Input
                        value={editValues.itemName}
                        onChange={(event) => updateEditValue("itemName", event.target.value)}
                        className="h-8 w-full max-w-sm"
                        placeholder="Item name"
                      />
                    ) : (
                      <p className="text-lg font-semibold">
                        {selectedStock.itemName || "Unnamed Item"}
                      </p>
                    )}
                    {lowStock ? (
                      <Badge variant="destructive">Low Stock</Badge>
                    ) : (
                      <Badge variant="default" className="bg-green-800 text-white">Active</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    BCN: <span className="font-medium">{selectedStock.bcn}</span>
                  </p>

                  <p className="text-sm text-muted-foreground flex gap-2 items-center">
                    Rack:
                    <div >{renderQuickEditControls("rack")}</div>
                    {isEditingAll || quickEditField === "rack" ? (
                      <Input
                        value={editValues.rack}
                        onChange={(event) => updateEditValue("rack", event.target.value)}
                        className="h-8"
                        placeholder="Enter rack"
                      />
                    ) : (
                      <span className="text-blue-600">{selectedStock.rack || "—"}</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={isRefreshing || isEditingAll || !!quickEditField || isSavingEdits}
                  >
                    {isRefreshing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Refresh
                  </Button>
                  {isEditingAll ? (
                    <>
                      <Button onClick={handleSaveAll} disabled={isSavingEdits}>
                        {isSavingEdits ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 h-4 w-4" />
                        )}
                        Save
                      </Button>
                      <Button variant="ghost" onClick={cancelEditAll} disabled={isSavingEdits}>
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={startEditAll}
                      disabled={isSavingEdits || !!quickEditField}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  )}
                </div>
              </div>

              <Separator className="my-4" />

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Closing Stock
                  </strong>
                  {isEditingAll ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.closingstock}
                      onChange={(event) => updateEditValue("closingstock", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    <span className={cn(lowStock && "text-red-600 font-semibold")}>
                      {num(selectedStock.closingstock)}
                    </span>
                  )}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Max Level
                  </strong>
                  {isEditingAll ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.maxlevel}
                      onChange={(event) => updateEditValue("maxlevel", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    num(selectedStock.maxlevel)
                  )}
                </p>

                <p className="text-sm flex items-center gap-1">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  <strong className="text-muted-foreground">Category:</strong>{" "}
                  {isEditingAll ? (
                    <Input
                      value={editValues.category}
                      onChange={(event) => updateEditValue("category", event.target.value)}
                      className="h-7 flex-1 min-w-[120px]"
                    />
                  ) : (
                    selectedStock.category || "—"
                  )}
                </p>

                <p className="text-sm flex items-center gap-1">
                  <Layers className="h-3 w-3 text-muted-foreground" />
                  <strong className="text-muted-foreground">Group:</strong>{" "}
                  {isEditingAll ? (
                    <Input
                      value={editValues.categoryGroup}
                      onChange={(event) => updateEditValue("categoryGroup", event.target.value)}
                      className="h-7 flex-1 min-w-[120px]"
                    />
                  ) : (
                    selectedStock.categoryGroup || "—"
                  )}
                </p>

                <p className="text-sm flex items-center gap-1">
                  <Ruler className="h-3 w-3 text-muted-foreground" />
                  <strong className="text-muted-foreground">Width:</strong>{" "}
                  {isEditingAll ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.width}
                      onChange={(event) => updateEditValue("width", event.target.value)}
                      className="h-7 flex-1 min-w-[100px]"
                    />
                  ) : (
                    num(selectedStock.width)
                  )}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">Unit</strong>
                  {isEditingAll ? (
                    <Input
                      value={editValues.unit}
                      onChange={(event) => updateEditValue("unit", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    selectedStock.unit || "—"
                  )}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">Type</strong>
                  {isEditingAll ? (
                    <Input
                      value={editValues.type}
                      onChange={(event) => updateEditValue("type", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    selectedStock.type || "—"
                  )}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    MO Collection
                  </strong>
                  {isEditingAll ? (
                    <Input
                      value={editValues.moCollection}
                      onChange={(event) => updateEditValue("moCollection", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    selectedStock.moCollection || "—"
                  )}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    MO Collection Code
                  </strong>
                  {isEditingAll ? (
                    <Input
                      value={editValues.moCollectionCode}
                      onChange={(event) => updateEditValue("moCollectionCode", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    selectedStock.moCollectionCode || "—"
                  )}
                </p>

                <p className="text-sm flex items-center gap-1">
                  <Building className="h-3 w-3 text-muted-foreground" />
                  <strong className="text-muted-foreground">Supplier:</strong>{" "}
                  {isEditingAll ? (
                    <Input
                      value={editValues.supplierCompanyName}
                      onChange={(event) => updateEditValue("supplierCompanyName", event.target.value)}
                      className="h-7 flex-1 min-w-[120px]"
                    />
                  ) : (
                    selectedStock.supplierCompanyName || "—"
                  )}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Supplier Collection Name
                  </strong>
                  {isEditingAll ? (
                    <Input
                      value={editValues.supplierCollectionName}
                      onChange={(event) => updateEditValue("supplierCollectionName", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    selectedStock.supplierCollectionName || "—"
                  )}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Supplier Collection Code
                  </strong>
                  {isEditingAll ? (
                    <Input
                      value={editValues.supplierCollectionCode}
                      onChange={(event) => updateEditValue("supplierCollectionCode", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    selectedStock.supplierCollectionCode || "—"
                  )}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Composition
                  </strong>
                  {isEditingAll ? (
                    <Input
                      value={editValues.composition}
                      onChange={(event) => updateEditValue("composition", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    selectedStock.composition || "—"
                  )}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Martindale
                  </strong>
                  {isEditingAll ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.martindale}
                      onChange={(event) => updateEditValue("martindale", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    num(selectedStock.martindale)
                  )}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Weight (GSM)
                  </strong>
                  {isEditingAll ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.weightGsm}
                      onChange={(event) => updateEditValue("weightGsm", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    num(selectedStock.weightGsm)
                  )}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    H Repeat (cms)
                  </strong>
                  {isEditingAll ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.horizontalRepeatCms}
                      onChange={(event) => updateEditValue("horizontalRepeatCms", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    num(selectedStock.horizontalRepeatCms)
                  )}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    V Repeat (cms)
                  </strong>
                  {isEditingAll ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.verticalRepeatCms}
                      onChange={(event) => updateEditValue("verticalRepeatCms", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    num(selectedStock.verticalRepeatCms)
                  )}
                </p>

                <div className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="block text-muted-foreground">
                      Cost Price
                    </strong>
                    {renderQuickEditControls("costPriceRs")}
                  </div>
                  {isEditingAll || quickEditField === "costPriceRs" ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.costPriceRs}
                      onChange={(event) => updateEditValue("costPriceRs", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    money(selectedStock.costPriceRs)
                  )}
                </div>

                <div className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="block text-muted-foreground">
                      Cost Multiplier
                    </strong>
                    {renderQuickEditControls("costMultiplierRs")}
                  </div>
                  {isEditingAll || quickEditField === "costMultiplierRs" ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.costMultiplierRs}
                      onChange={(event) => updateEditValue("costMultiplierRs", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    num(selectedStock.costMultiplierRs)
                  )}
                </div>

                <div className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="block text-muted-foreground">
                      RRP with GST
                    </strong>
                    {renderQuickEditControls("rrpWithGstRs")}
                  </div>
                  {isEditingAll || quickEditField === "rrpWithGstRs" ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.rrpWithGstRs}
                      onChange={(event) => updateEditValue("rrpWithGstRs", event.target.value)}
                      className="h-8"
                    />
                  ) : (
                    money(selectedStock.rrpWithGstRs)
                  )}
                </div>
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
                    <div className="border rounded-lg bg-white shadow-md overflow-hidden">
                        <h3 className="font-semibold mb-2 text-center p-4 bg-gray-200">Stock Deducted (Sold/Cut)</h3>
                        <div className="max-h-60 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Qty</TableHead>
                                        <TableHead>Order ID</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingDetails ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center">
                                                <Loader2 className="h-6 w-6 animate-spin" />
                                            </TableCell>
                                        </TableRow>
                                    ) : stockSoldTransactions.length > 0 ? (
                                        stockSoldTransactions.map(tx => (
                                            <TableRow key={tx.id} className="hover:bg-gray-100 transition-colors">
                                                <TableCell>{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                                                <TableCell className="font-mono">{Math.abs(tx.quantityChange).toFixed(2)}</TableCell>
                                                <TableCell>{tx.orderId}</TableCell>
                                                <TableCell>
                                                    <Badge variant={tx.status === 'cut' ? 'default' : 'secondary'} className={cn(tx.status === 'cut' && 'bg-green-600')}>
                                                        {tx.status || 'pending for cutting'}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center">
                                                No sold data available.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                    
                    <div className="border rounded-lg bg-white shadow-md overflow-hidden">
                        <h3 className="font-semibold mb-2 text-center p-4 bg-gray-200">Stock Added (Purchase Rolls)</h3>
                        <div className="max-h-60 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Full Length</TableHead>
                                        <TableHead>Available</TableHead>
                                        <TableHead>Reserved</TableHead>
                                        <TableHead>PO</TableHead>
                                        <TableHead>Salesman</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingDetails ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                <Loader2 className="h-6 w-6 animate-spin" />
                                            </TableCell>
                                        </TableRow>
                                    ) : stockAddedTransactions.length > 0 ? (
                                        stockAddedTransactions.map(tx => (
                                            <React.Fragment key={tx.id}>
                                                <Collapsible asChild>
                                                    <>
                                                        <TableRow className="hover:bg-gray-100 transition-colors">
                                                            <TableCell className="font-semibold">
                                                                <div className="flex items-center gap-2">
                                                                    <CollapsibleTrigger asChild>
                                                                        <Button variant="ghost" size="icon" className="h-6 w-6">
                                                                            <ChevronRight className="h-4 w-4 transition-transform data-[state=open]:rotate-90" />
                                                                        </Button>
                                                                    </CollapsibleTrigger>
                                                                    <span>{`${(tx as any).quantity.toFixed(2)} Mtr`}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="font-semibold text-green-600">{`${(tx as any).availableQty.toFixed(2)}`}</TableCell>
                                                            <TableCell className="font-semibold text-destructive">{`${(tx as any).reservedQty.toFixed(2)}`}</TableCell>
                                                            <TableCell>{tx.poNumber || 'N/A'}</TableCell>
                                                            <TableCell>{tx.salesman || 'N/A'}</TableCell>
                                                        </TableRow>
                                                        <CollapsibleContent asChild>
                                                            <TableRow>
                                                                <TableCell colSpan={5} className="p-0">
                                                                    <CutHistoryView history={(tx as any).cutHistory} />
                                                                </TableCell>
                                                            </TableRow>
                                                        </CollapsibleContent>
                                                    </>
                                                </Collapsible>
                                            </React.Fragment>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                No purchase data available.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
