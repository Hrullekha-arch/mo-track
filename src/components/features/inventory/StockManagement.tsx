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
  ChevronRight,
  Plus,
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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import {
  searchStockByBcn,
  getStockTransactions,
  getStockById,
  createStockItemAction,
  getStockFieldOptions,
  updateStockBatchAction,
  updateStockQuantityAction,
} from "@/app/dashboard/inventory/actions";
import { useAuth } from "@/context/AuthContext";

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

type NewStockFields = {
  bcn: string;
  itemName: string;
  unit: string;
  type: string;
  category: string;
  categoryGroup: string;
  rack: string;
  closingstock: string;
  maxlevel: string;
  width: string;
  productId: string;
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
};

type OptionField = "supplierCompanyName" | "type" | "unit";

const emptyNewStockValues: NewStockFields = {
  bcn: "",
  itemName: "",
  unit: "Mtr",
  type: "fabric",
  category: "",
  categoryGroup: "",
  rack: "",
  closingstock: "",
  maxlevel: "",
  width: "",
  productId: "",
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
};

const createEmptyNewStock = (): NewStockFields => ({
  ...emptyNewStockValues,
});

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

const toOptionalNumber = (value: string) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  const [draftEntry, setDraftEntry] = React.useState<NewStockFields>(createEmptyNewStock());
  const [draftErrors, setDraftErrors] = React.useState<Partial<Record<keyof NewStockFields, string>>>({});
  const [queuedEntries, setQueuedEntries] = React.useState<NewStockFields[]>([]);
  const [fieldOptions, setFieldOptions] = React.useState<{
    supplierCompanyName: ComboboxOption[];
    type: ComboboxOption[];
    unit: ComboboxOption[];
  }>({
    supplierCompanyName: [],
    type: [],
    unit: [],
  });
  const [fieldQueries, setFieldQueries] = React.useState<{
    supplierCompanyName: string;
    type: string;
    unit: string;
  }>({
    supplierCompanyName: "",
    type: "",
    unit: "",
  });
  const [showFieldInput, setShowFieldInput] = React.useState({
    supplierCompanyName: false,
    type: false,
    unit: false,
  });
  const [newFieldValue, setNewFieldValue] = React.useState({
    supplierCompanyName: "",
    type: "",
    unit: "",
  });
  const [isLoadingFieldOptions, setIsLoadingFieldOptions] = React.useState({
    supplierCompanyName: false,
    type: false,
    unit: false,
  });
  const [isCreatingStock, setIsCreatingStock] = React.useState(false);
  const [showAdditionalFields, setShowAdditionalFields] = React.useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [isAddLengthDialogOpen, setIsAddLengthDialogOpen] = React.useState(false);
  const [addLengthQty, setAddLengthQty] = React.useState("");
  const [addLengthUnit, setAddLengthUnit] = React.useState("");
  const [isAddingLength, setIsAddingLength] = React.useState(false);

  const { toast } = useToast();
  const { user } = useAuth();

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

  React.useEffect(() => {
    if (!isAddDialogOpen) return;

    let isMounted = true;
    const loadOptions = async () => {
      setIsLoadingFieldOptions({
        supplierCompanyName: true,
        type: true,
        unit: true,
      });
      try {
        const [supplierCompanies, types, units] = await Promise.all([
          getStockFieldOptions("supplierCompanyName"),
          getStockFieldOptions("type"),
          getStockFieldOptions("unit"),
        ]);
        if (!isMounted) return;
        setFieldOptions({
          supplierCompanyName: supplierCompanies.map((value) => ({ value, label: value })),
          type: types.map((value) => ({ value, label: value })),
          unit: units.map((value) => ({ value, label: value })),
        });
      } catch (error) {
        console.error("Failed to load field options:", error);
        toast({ variant: "destructive", title: "Failed to load dropdown options." });
      } finally {
        if (isMounted) {
          setIsLoadingFieldOptions({
            supplierCompanyName: false,
            type: false,
            unit: false,
          });
        }
      }
    };

    loadOptions();
    return () => {
      isMounted = false;
    };
  }, [isAddDialogOpen, toast]);

  React.useEffect(() => {
    if (!isAddLengthDialogOpen) return;
    setAddLengthQty("");
    setAddLengthUnit(selectedStock?.unit || "Mtr");
  }, [isAddLengthDialogOpen, selectedStock?.unit]);

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

const updateDraftValue = (field: keyof NewStockFields, value: string) => {
  setDraftEntry((prev) => ({ ...prev, [field]: value }));
  if (draftErrors[field]) {
    setDraftErrors((prev) => {
      const { [field]: _removed, ...rest } = prev;
      return rest;
    });
  }
};

const updateFieldQuery = (field: OptionField, query: string) => {
  setFieldQueries((prev) => ({ ...prev, [field]: query }));
};

const handleFieldSelect = (field: OptionField, value: string) => {
  updateDraftValue(field, value);
  setFieldQueries((prev) => ({ ...prev, [field]: "" }));
};

const openFieldAdder = (field: OptionField) => {
  setShowFieldInput((prev) => ({ ...prev, [field]: true }));
  setNewFieldValue((prev) => ({
    ...prev,
    [field]: fieldQueries[field].trim() || prev[field],
  }));
};

const cancelFieldAdder = (field: OptionField) => {
  setShowFieldInput((prev) => ({ ...prev, [field]: false }));
  setNewFieldValue((prev) => ({ ...prev, [field]: "" }));
};

const commitFieldAdder = (field: OptionField) => {
  const raw = newFieldValue[field].trim();
  if (!raw) return;
  addFieldOption(field, raw);
  cancelFieldAdder(field);
};

const upsertFieldOption = (field: OptionField, value: string) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return;
  setFieldOptions((prev) => {
    const exists = prev[field].some(
      (option) => option.value.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) return prev;
    const next = [...prev[field], { value: trimmed, label: trimmed }].sort((a, b) =>
      a.value.localeCompare(b.value)
    );
    return { ...prev, [field]: next };
  });
};

const addFieldOption = (field: OptionField, value: string) => {
  const raw = String(value ?? "").trim();
  if (!raw) return;
  upsertFieldOption(field, raw);
  handleFieldSelect(field, raw);
};

const resetDraftEntry = () => {
  setDraftEntry(createEmptyNewStock());
  setDraftErrors({});
  setFieldQueries({
    supplierCompanyName: "",
    type: "",
    unit: "",
  });
  setShowFieldInput({
    supplierCompanyName: false,
    type: false,
    unit: false,
  });
  setNewFieldValue({
    supplierCompanyName: "",
    type: "",
    unit: "",
  });
};

const resetNewStockForm = () => {
  resetDraftEntry();
  setQueuedEntries([]);
};

const isEntryEmpty = (entry: NewStockFields) =>
  !entry.bcn.trim() && !entry.itemName.trim();

const validateEntry = (entry: NewStockFields, existingBcns: Set<string>) => {
  const errors: Partial<Record<keyof NewStockFields, string>> = {};
  const bcn = entry.bcn.trim();
  const itemName = entry.itemName.trim();

  if (!bcn) errors.bcn = "BCN is required.";
  if (!itemName) errors.itemName = "Item name is required.";

  const bcnKey = bcn.toLowerCase();
  if (bcn && existingBcns.has(bcnKey)) {
    errors.bcn = "Duplicate BCN in this batch.";
  }

  const supplierCompanyName = entry.supplierCompanyName.trim();
  const supplierCollectionName = entry.supplierCollectionName.trim();
  const supplierCollectionCode = entry.supplierCollectionCode.trim();

  if (!supplierCompanyName) {
    errors.supplierCompanyName = "Supplier company is required.";
  }
  if (!supplierCollectionName) {
    errors.supplierCollectionName = "Supplier collection name is required.";
  }
  if (!supplierCollectionCode) {
    errors.supplierCollectionCode = "Supplier collection code is required.";
  }

  const parseRequiredNumber = (
    value: string,
    field: keyof NewStockFields,
    label: string
  ) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) {
      errors[field] = `${label} is required.`;
      return undefined;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      errors[field] = `${label} must be a number.`;
      return undefined;
    }
    if (parsed < 0) {
      errors[field] = `${label} cannot be negative.`;
      return undefined;
    }
    return parsed;
  };

  const parseOptionalNumber = (
    value: string,
    field: keyof NewStockFields,
    label: string
  ) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      errors[field] = `${label} must be a number.`;
      return undefined;
    }
    if (parsed < 0) {
      errors[field] = `${label} cannot be negative.`;
      return undefined;
    }
    return parsed;
  };

  const openingQty = parseOptionalNumber(entry.closingstock, "closingstock", "Opening stock") ?? 0;
  const maxlevel = parseOptionalNumber(entry.maxlevel, "maxlevel", "Max level");
  const width = parseOptionalNumber(entry.width, "width", "Width");
  const martindale = parseOptionalNumber(entry.martindale, "martindale", "Martindale");
  const weightGsm = parseOptionalNumber(entry.weightGsm, "weightGsm", "Weight (GSM)");
  const horizontalRepeatCms = parseOptionalNumber(
    entry.horizontalRepeatCms,
    "horizontalRepeatCms",
    "Horizontal repeat"
  );
  const verticalRepeatCms = parseOptionalNumber(
    entry.verticalRepeatCms,
    "verticalRepeatCms",
    "Vertical repeat"
  );
  const costPriceRs = parseRequiredNumber(entry.costPriceRs, "costPriceRs", "Cost price");
  const costMultiplierRs = parseRequiredNumber(
    entry.costMultiplierRs,
    "costMultiplierRs",
    "Cost multiplier"
  );
  const rrpWithGstRs = parseRequiredNumber(entry.rrpWithGstRs, "rrpWithGstRs", "RRP with GST");

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    errors,
    payload: {
      bcn,
      itemName,
      unit: entry.unit.trim() || "Mtr",
      type: entry.type.trim() || "fabric",
      category: entry.category.trim(),
      categoryGroup: entry.categoryGroup.trim(),
      rack: entry.rack.trim(),
      closingstock: openingQty,
      maxlevel,
      width,
      productId: entry.productId.trim(),
      moCollection: entry.moCollection.trim(),
      moCollectionCode: entry.moCollectionCode.trim(),
      supplierCompanyName,
      supplierCollectionName,
      supplierCollectionCode,
      composition: entry.composition.trim(),
      martindale,
      weightGsm,
      horizontalRepeatCms,
      verticalRepeatCms,
      costPriceRs,
      costMultiplierRs,
      rrpWithGstRs,
    },
  };
};

const queueDraftEntry = () => {
  if (isEntryEmpty(draftEntry)) {
    toast({
      variant: "destructive",
      title: "Add item details",
      description: "Fill the form before adding another item.",
    });
    return;
  }

  const existingBcns = new Set(
    queuedEntries.map((entry) => entry.bcn.trim().toLowerCase())
  );
  const { errors } = validateEntry(draftEntry, existingBcns);

  if (Object.keys(errors).length > 0) {
    setDraftErrors(errors);
    toast({
      variant: "destructive",
      title: "Fix form errors",
      description: "Please check the required fields and numeric values.",
    });
    return;
  }

  upsertFieldOption("supplierCompanyName", draftEntry.supplierCompanyName);
  upsertFieldOption("type", draftEntry.type);
  upsertFieldOption("unit", draftEntry.unit);

  setQueuedEntries((prev) => [...prev, draftEntry]);
  resetDraftEntry();
};

const removeQueuedEntry = (index: number) => {
  setQueuedEntries((prev) => prev.filter((_, idx) => idx !== index));
};

const editQueuedEntry = (index: number) => {
  const entry = queuedEntries[index];
  if (!entry) return;
  setQueuedEntries((prev) => prev.filter((_, idx) => idx !== index));
  setDraftEntry(entry);
  setDraftErrors({});
};

const handleCreateStock = async () => {
  const entriesToSubmit = [...queuedEntries];
  const draftHasData = !isEntryEmpty(draftEntry);

  if (draftHasData) {
    entriesToSubmit.push(draftEntry);
  }

  if (entriesToSubmit.length === 0) {
    toast({
      variant: "destructive",
      title: "Add items",
      description: "Add at least one item before saving.",
    });
    return;
  }

  const seen = new Set<string>();
  const payloads: any[] = [];
  let hasErrors = false;
  let draftEntryErrors: Partial<Record<keyof NewStockFields, string>> | null = null;

  entriesToSubmit.forEach((entry, index) => {
    const { errors, payload } = validateEntry(entry, seen);
    if (Object.keys(errors).length > 0 || !payload) {
      hasErrors = true;
      if (draftHasData && index == entriesToSubmit.length - 1) {
        draftEntryErrors = errors;
      }
    } else {
      seen.add(entry.bcn.trim().toLowerCase());
      payloads.push(payload);
    }
  });

  if (hasErrors) {
    if (draftEntryErrors) {
      setDraftErrors(draftEntryErrors);
    }
    toast({
      variant: "destructive",
      title: "Fix form errors",
      description: "Please review the queued items and the current form.",
    });
    return;
  }

  setIsCreatingStock(true);
  try {
    const failures: { entry: NewStockFields; message: string }[] = [];
    let lastCreated: InventoryItem | null = null;

    for (let i = 0; i < payloads.length; i += 1) {
      const result = await createStockItemAction(payloads[i]);
      if (result.success) {
        if (result.stock) {
          lastCreated = result.stock as InventoryItem;
        }
      } else {
        failures.push({ entry: entriesToSubmit[i], message: result.message });
      }
    }

    if (failures.length === 0) {
      toast({
        title: "Stock created",
        description: `Created ${payloads.length} item${payloads.length > 1 ? "s" : ""}.`,
      });
      resetNewStockForm();
      setShowAdditionalFields(false);
      setIsAddDialogOpen(false);
      if (lastCreated) {
        await handleSelectStock(lastCreated);
      }
    } else {
      toast({
        variant: "destructive",
        title: "Partial success",
        description: `Created ${payloads.length - failures.length} of ${payloads.length} items.`,
      });
      if (failures.length === 1 && entriesToSubmit.length === 1) {
        setQueuedEntries([]);
        setDraftEntry(failures[0].entry);
        setDraftErrors({ bcn: failures[0].message });
      } else {
        setQueuedEntries(failures.map((failure) => failure.entry));
        resetDraftEntry();
      }
    }
  } catch (error) {
    console.error("Error creating stock:", error);
    toast({
      variant: "destructive",
      title: "Create failed",
      description: "An unexpected server error occurred.",
    });
  } finally {
    setIsCreatingStock(false);
  }
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

  const handleAddLength = async () => {
    if (!selectedStock) return;
    const quantity = Number(addLengthQty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid quantity",
        description: "Enter a quantity greater than 0.",
      });
      return;
    }

    const unitValue = (addLengthUnit || selectedStock.unit || "Mtr").trim() || "Mtr";
    setIsAddingLength(true);
    try {
      const stockDocId = getStockDocId(selectedStock);
      const result = await updateStockQuantityAction(stockDocId, {
        stockId: stockDocId,
        bcn: selectedStock.bcn,
        type: "addition",
        quantityChange: quantity,
        createdAt: new Date().toISOString(),
        createdBy: user?.name || "System",
        unit: unitValue,
      });

      if (result.success) {
        toast({
          title: "Stock Added",
          description: `${quantity} ${unitValue} added to ${selectedStock.bcn}.`,
        });
        setIsAddLengthDialogOpen(false);
        await handleRefresh();
      } else {
        toast({
          variant: "destructive",
          title: "Add Stock Failed",
          description: result.message,
        });
      }
    } catch (error) {
      console.error("Error adding stock length:", error);
      toast({
        variant: "destructive",
        title: "Add Stock Failed",
        description: "Could not add stock length.",
      });
    } finally {
      setIsAddingLength(false);
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
  <Button onClick={() => setIsAddDialogOpen(true)}>
    <Plus className="mr-2 h-4 w-4" />
    Add New Stock
  </Button>
</div>

<Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
  <DialogContent className="max-w-6xl">
  <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold">Add New Stock</h3>
        <p className="text-xs text-muted-foreground">
          Create multiple stock items in one go. Opening stock creates the first roll entry.
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={() => setShowAdditionalFields((prev) => !prev)}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 transition-transform",
            showAdditionalFields && "rotate-90"
          )}
        />
        {showAdditionalFields ? "Hide additional fields" : "Show additional fields"}
      </Button>
    </div>

    <div className="rounded-lg border bg-background p-4 space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="new-stock-bcn">
            BCN <span className="text-destructive">*</span>
          </Label>
          <Input
            id="new-stock-bcn"
            value={draftEntry.bcn}
            onChange={(event) => updateDraftValue("bcn", event.target.value)}
            placeholder="e.g. ABC-123"
            className={cn(draftErrors.bcn && "border-destructive")}
          />
          {draftErrors.bcn ? (
            <p className="text-xs text-destructive">{draftErrors.bcn}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-itemName">
            Item Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="new-stock-itemName"
            value={draftEntry.itemName}
            onChange={(event) => updateDraftValue("itemName", event.target.value)}
            placeholder="e.g. Atlas Linen"
            className={cn(draftErrors.itemName && "border-destructive")}
          />
          {draftErrors.itemName ? (
            <p className="text-xs text-destructive">{draftErrors.itemName}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-opening">Opening Stock</Label>
          <Input
            id="new-stock-opening"
            type="number"
            step="0.01"
            value={draftEntry.closingstock}
            onChange={(event) => updateDraftValue("closingstock", event.target.value)}
            placeholder="0"
            className={cn(draftErrors.closingstock && "border-destructive")}
          />
          {draftErrors.closingstock ? (
            <p className="text-xs text-destructive">{draftErrors.closingstock}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-unit">Unit</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Combobox
                options={fieldOptions.unit}
                value={draftEntry.unit}
                onSelect={(value) => handleFieldSelect("unit", value)}
                placeholder="Select unit"
                searchPlaceholder="Search unit..."
                emptyPlaceholder={
                  isLoadingFieldOptions.unit ? "Loading units..." : "No unit found."
                }
                onSearch={(query) => updateFieldQuery("unit", query)}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              type="button"
              onClick={() => openFieldAdder("unit")}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {showFieldInput.unit ? (
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={newFieldValue.unit}
                onChange={(event) =>
                  setNewFieldValue((prev) => ({
                    ...prev,
                    unit: event.target.value,
                  }))
                }
                placeholder="Add unit"
              />
              <Button type="button" size="sm" onClick={() => commitFieldAdder("unit")}>
                Add
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => cancelFieldAdder("unit")}>
                Cancel
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-type">Type</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Combobox
                options={fieldOptions.type}
                value={draftEntry.type}
                onSelect={(value) => handleFieldSelect("type", value)}
                placeholder="Select type"
                searchPlaceholder="Search type..."
                emptyPlaceholder={
                  isLoadingFieldOptions.type ? "Loading types..." : "No type found."
                }
                onSearch={(query) => updateFieldQuery("type", query)}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              type="button"
              onClick={() => openFieldAdder("type")}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {showFieldInput.type ? (
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={newFieldValue.type}
                onChange={(event) =>
                  setNewFieldValue((prev) => ({
                    ...prev,
                    type: event.target.value,
                  }))
                }
                placeholder="Add type"
              />
              <Button type="button" size="sm" onClick={() => commitFieldAdder("type")}>
                Add
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => cancelFieldAdder("type")}>
                Cancel
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-category">Category</Label>
          <Input
            id="new-stock-category"
            value={draftEntry.category}
            onChange={(event) => updateDraftValue("category", event.target.value)}
            placeholder="e.g. Upholstery"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-category-group">Category Group</Label>
          <Input
            id="new-stock-category-group"
            value={draftEntry.categoryGroup}
            onChange={(event) => updateDraftValue("categoryGroup", event.target.value)}
            placeholder="e.g. Linen"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-rack">Rack</Label>
          <Input
            id="new-stock-rack"
            value={draftEntry.rack}
            onChange={(event) => updateDraftValue("rack", event.target.value)}
            placeholder="e.g. R-12"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-maxlevel">Max Level</Label>
          <Input
            id="new-stock-maxlevel"
            type="number"
            step="0.01"
            value={draftEntry.maxlevel}
            onChange={(event) => updateDraftValue("maxlevel", event.target.value)}
            placeholder="0"
            className={cn(draftErrors.maxlevel && "border-destructive")}
          />
          {draftErrors.maxlevel ? (
            <p className="text-xs text-destructive">{draftErrors.maxlevel}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-supplierCompany">
            Supplier Company <span className="text-destructive">*</span>
          </Label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Combobox
                options={fieldOptions.supplierCompanyName}
                value={draftEntry.supplierCompanyName}
                onSelect={(value) => handleFieldSelect("supplierCompanyName", value)}
                placeholder="Select supplier"
                searchPlaceholder="Search supplier..."
                emptyPlaceholder={
                  isLoadingFieldOptions.supplierCompanyName
                    ? "Loading suppliers..."
                    : "No supplier found."
                }
                onSearch={(query) => updateFieldQuery("supplierCompanyName", query)}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              type="button"
              onClick={() => openFieldAdder("supplierCompanyName")}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {showFieldInput.supplierCompanyName ? (
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={newFieldValue.supplierCompanyName}
                onChange={(event) =>
                  setNewFieldValue((prev) => ({
                    ...prev,
                    supplierCompanyName: event.target.value,
                  }))
                }
                placeholder="Add supplier company"
              />
              <Button type="button" size="sm" onClick={() => commitFieldAdder("supplierCompanyName")}>
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => cancelFieldAdder("supplierCompanyName")}
              >
                Cancel
              </Button>
            </div>
          ) : null}
          {draftErrors.supplierCompanyName ? (
            <p className="text-xs text-destructive">{draftErrors.supplierCompanyName}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-supplierCollection">
            Supplier Collection Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="new-stock-supplierCollection"
            value={draftEntry.supplierCollectionName}
            onChange={(event) => updateDraftValue("supplierCollectionName", event.target.value)}
            className={cn(draftErrors.supplierCollectionName && "border-destructive")}
          />
          {draftErrors.supplierCollectionName ? (
            <p className="text-xs text-destructive">{draftErrors.supplierCollectionName}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-supplierCollectionCode">
            Supplier Collection Code <span className="text-destructive">*</span>
          </Label>
          <Input
            id="new-stock-supplierCollectionCode"
            value={draftEntry.supplierCollectionCode}
            onChange={(event) => updateDraftValue("supplierCollectionCode", event.target.value)}
            className={cn(draftErrors.supplierCollectionCode && "border-destructive")}
          />
          {draftErrors.supplierCollectionCode ? (
            <p className="text-xs text-destructive">{draftErrors.supplierCollectionCode}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-costPrice">
            Cost Price (Rs) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="new-stock-costPrice"
            type="number"
            step="0.01"
            value={draftEntry.costPriceRs}
            onChange={(event) => updateDraftValue("costPriceRs", event.target.value)}
            className={cn(draftErrors.costPriceRs && "border-destructive")}
          />
          {draftErrors.costPriceRs ? (
            <p className="text-xs text-destructive">{draftErrors.costPriceRs}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-costMultiplier">
            Cost Multiplier (Rs) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="new-stock-costMultiplier"
            type="number"
            step="0.01"
            value={draftEntry.costMultiplierRs}
            onChange={(event) => updateDraftValue("costMultiplierRs", event.target.value)}
            className={cn(draftErrors.costMultiplierRs && "border-destructive")}
          />
          {draftErrors.costMultiplierRs ? (
            <p className="text-xs text-destructive">{draftErrors.costMultiplierRs}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="new-stock-rrp">
            RRP with GST (Rs) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="new-stock-rrp"
            type="number"
            step="0.01"
            value={draftEntry.rrpWithGstRs}
            onChange={(event) => updateDraftValue("rrpWithGstRs", event.target.value)}
            className={cn(draftErrors.rrpWithGstRs && "border-destructive")}
          />
          {draftErrors.rrpWithGstRs ? (
            <p className="text-xs text-destructive">{draftErrors.rrpWithGstRs}</p>
          ) : null}
        </div>
      </div>

      {showAdditionalFields ? (
        <>
          <Separator className="my-2" />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="new-stock-productId">Product ID</Label>
              <Input
                id="new-stock-productId"
                value={draftEntry.productId}
                onChange={(event) => updateDraftValue("productId", event.target.value)}
                placeholder="Internal product ID"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-stock-width">Width</Label>
              <Input
                id="new-stock-width"
                type="number"
                step="0.01"
                value={draftEntry.width}
                onChange={(event) => updateDraftValue("width", event.target.value)}
                placeholder="0"
                className={cn(draftErrors.width && "border-destructive")}
              />
              {draftErrors.width ? (
                <p className="text-xs text-destructive">{draftErrors.width}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-stock-moCollection">MO Collection</Label>
              <Input
                id="new-stock-moCollection"
                value={draftEntry.moCollection}
                onChange={(event) => updateDraftValue("moCollection", event.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-stock-moCollectionCode">MO Collection Code</Label>
              <Input
                id="new-stock-moCollectionCode"
                value={draftEntry.moCollectionCode}
                onChange={(event) => updateDraftValue("moCollectionCode", event.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-stock-composition">Composition</Label>
              <Input
                id="new-stock-composition"
                value={draftEntry.composition}
                onChange={(event) => updateDraftValue("composition", event.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-stock-martindale">Martindale</Label>
              <Input
                id="new-stock-martindale"
                type="number"
                step="0.01"
                value={draftEntry.martindale}
                onChange={(event) => updateDraftValue("martindale", event.target.value)}
                className={cn(draftErrors.martindale && "border-destructive")}
              />
              {draftErrors.martindale ? (
                <p className="text-xs text-destructive">{draftErrors.martindale}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-stock-weightGsm">Weight (GSM)</Label>
              <Input
                id="new-stock-weightGsm"
                type="number"
                step="0.01"
                value={draftEntry.weightGsm}
                onChange={(event) => updateDraftValue("weightGsm", event.target.value)}
                className={cn(draftErrors.weightGsm && "border-destructive")}
              />
              {draftErrors.weightGsm ? (
                <p className="text-xs text-destructive">{draftErrors.weightGsm}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-stock-horizontalRepeat">H Repeat (cms)</Label>
              <Input
                id="new-stock-horizontalRepeat"
                type="number"
                step="0.01"
                value={draftEntry.horizontalRepeatCms}
                onChange={(event) => updateDraftValue("horizontalRepeatCms", event.target.value)}
                className={cn(draftErrors.horizontalRepeatCms && "border-destructive")}
              />
              {draftErrors.horizontalRepeatCms ? (
                <p className="text-xs text-destructive">{draftErrors.horizontalRepeatCms}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-stock-verticalRepeat">V Repeat (cms)</Label>
              <Input
                id="new-stock-verticalRepeat"
                type="number"
                step="0.01"
                value={draftEntry.verticalRepeatCms}
                onChange={(event) => updateDraftValue("verticalRepeatCms", event.target.value)}
                className={cn(draftErrors.verticalRepeatCms && "border-destructive")}
              />
              {draftErrors.verticalRepeatCms ? (
                <p className="text-xs text-destructive">{draftErrors.verticalRepeatCms}</p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>

    {queuedEntries.length > 0 ? (
      <div className="rounded-lg border bg-background p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Queued Items</p>
        <div className="max-h-52 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>BCN</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">RRP</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queuedEntries.map((entry, index) => (
                <TableRow key={`${entry.bcn}-${index}`}>
                  <TableCell className="font-mono">{entry.bcn}</TableCell>
                  <TableCell>{entry.itemName}</TableCell>
                  <TableCell>{entry.supplierCompanyName}</TableCell>
                  <TableCell>{entry.type || "-"}</TableCell>
                  <TableCell>{entry.unit || "-"}</TableCell>
                  <TableCell className="text-right">{entry.costPriceRs || "-"}</TableCell>
                  <TableCell className="text-right">{entry.rrpWithGstRs || "-"}</TableCell>
                  <TableCell className="text-right">{entry.closingstock || "0"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => editQueuedEntry(index)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeQueuedEntry(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    ) : null}

    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="outline" onClick={queueDraftEntry} disabled={isCreatingStock}>
        <Plus className="mr-2 h-4 w-4" />
        Add another item
      </Button>
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={resetNewStockForm} disabled={isCreatingStock}>
          Clear
        </Button>
        <Button onClick={handleCreateStock} disabled={isCreatingStock}>
          {isCreatingStock ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {isCreatingStock
            ? "Creating..."
            : `Add ${Math.max(queuedEntries.length + (isEntryEmpty(draftEntry) ? 0 : 1), 1)} Item${
                Math.max(queuedEntries.length + (isEntryEmpty(draftEntry) ? 0 : 1), 1) === 1
                  ? ""
                  : "s"
              }`}
        </Button>
      </div>
    </div>
  </div>
</DialogContent>

  </Dialog>

  <Dialog open={isAddLengthDialogOpen} onOpenChange={setIsAddLengthDialogOpen}>
    <DialogContent className="max-w-md">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Add Stock</h3>
          <p className="text-sm text-muted-foreground">
            Add a new length for {selectedStock?.bcn || "this BCN"}.
          </p>
        </div>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="add-length-qty">
              Quantity <span className="text-destructive">*</span>
            </Label>
            <Input
              id="add-length-qty"
              type="number"
              step="0.01"
              value={addLengthQty}
              onChange={(event) => setAddLengthQty(event.target.value)}
              placeholder="Enter quantity"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-length-unit">Unit</Label>
            <Input
              id="add-length-unit"
              value={addLengthUnit}
              onChange={(event) => setAddLengthUnit(event.target.value)}
              placeholder="e.g. Mtr, Pcs"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => setIsAddLengthDialogOpen(false)}
            disabled={isAddingLength}
          >
            Cancel
          </Button>
          <Button onClick={handleAddLength} disabled={isAddingLength}>
            {isAddingLength && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>

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
                  <Button
                    variant="outline"
                    onClick={() => setIsAddLengthDialogOpen(true)}
                    disabled={!selectedStock || isEditingAll || !!quickEditField || isSavingEdits}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Stock
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
