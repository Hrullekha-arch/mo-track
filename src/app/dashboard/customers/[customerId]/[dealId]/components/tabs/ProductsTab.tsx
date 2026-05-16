"use client";

import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { DealProduct } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { PlusCircle, ScanLine, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
import { roomOptions } from "@/lib/constants";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { getStockSubcategories } from "@/lib/stock-category-rules";
import { VasForm } from "../../dialogs.tsx/Vasform";
import { updateDealProducts } from "../../actions";
import { useAuth } from "@/context/AuthContext";

// Lazy load heavy components
const ScannerDialog = lazy(() =>
  import("../../dialogs.tsx/ScannerDialog").then((mod) => ({
    default: mod.default,
  }))
);

const HardwareDialog = lazy(() =>
  import("../../dialogs.tsx/HardwareDialog").then((mod) => ({
    default: mod.default,
  }))
);

const FlooringDialog = lazy(() =>
  import("../../dialogs.tsx/FlooringDialog").then((mod) => ({
    default: mod.default,
  }))
);

const newProductEntrySchema = z.object({
  Type: z.string().optional().default(""),
  collectionBrand: z.string().min(1, "BCN is required."),
  salesDescription: z.string().optional().default(""),
  mrp: z.string().optional().default(""),
  verticalRepeat: z.string().optional().default(""),
  horizontalRepeat: z.string().optional().default(""),
  quantity: z.string().optional().default(""),
  remarks: z.string().optional().default(""),
});

const productListSchema = z.object({
  room: z.string().optional(),
  newProduct: newProductEntrySchema,
});

type ProductListFormValues = z.infer<typeof productListSchema>;

type ProductsTabProps = {
  customerId: string;
  dealId: string;
  existingProducts?: DealProduct[];
  onProductsSaved?: () => void;
};

export default function ProductsTab({
  customerId,
  dealId,
  existingProducts = [],
  onProductsSaved,
}: ProductsTabProps) {
  const { toast } = useToast();
  const user = useAuth();

  // State management
  const [bcnOptions, setBcnOptions] = useState<ComboboxOption[]>([]);
  const [stagedItems, setStagedItems] = useState<any[]>([]);
  const [activeMainSection, setActiveMainSection] = useState("main");
  const [fabricCategoryGroup, setFabricCategoryGroup] = useState("MAIN");
  const [currentBcnimsQty, setCurrentBcnimsQty] = useState<{ qty: number; date: string | null } | null>(null);
  const [imsSearching, setImsSearching] = useState(false);
  const [selectedFlooringType, setSelectedFlooringType] = useState("");
  const [loading, setLoading] = useState(false);
  const [savedProducts, setSavedProducts] = useState<DealProduct[]>(existingProducts);
  
  // Dialog states
  const [scanOpen, setScanOpen] = useState(false);
  const [flooringDialogOpen, setFlooringDialogOpen] = useState(false);
  const [hardwareDialogOpen, setHardwareDialogOpen] = useState(false);

  useEffect(() => {
    setSavedProducts(existingProducts);
  }, [existingProducts]);

  const form = useForm<ProductListFormValues>({
    resolver: zodResolver(productListSchema),
    defaultValues: {
      room: "",
      newProduct: {
        collectionBrand: "",
        salesDescription: "",
        mrp: "",
        verticalRepeat: "",
        horizontalRepeat: "",
        quantity: "",
        remarks: "",
      },
    },
  });

  // BCN Search Handler
  const handleBcnSearch = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setBcnOptions([]);
        return;
      }
      try {
        const results = await searchStockByBcn(query);
        const options = results.map((stock) => ({
          value: stock.bcn || stock.id,
          label: `${stock.bcn}`,
          stockItem: stock,
        }));
        setBcnOptions(options as any);
      } catch (error) {
        console.error("Error searching BCN:", error);
        toast({ variant: "destructive", title: "Search failed" });
      }
    },
    [toast]
  );

  // BCN Select Handler
  const handleBcnSelect = (value: string) => {
    const selectedOption = bcnOptions.find((opt) => opt.value === value) as any;
    if (selectedOption) {
      const stockItem = selectedOption.stockItem;
      form.setValue("newProduct.collectionBrand", stockItem.bcn || stockItem.id);
      form.setValue("newProduct.mrp", (stockItem.rrpWithGstRs || 0).toString());
      form.setValue("newProduct.salesDescription", stockItem.itemName || "");
      form.setValue("newProduct.verticalRepeat", stockItem.verticalRepeatCms || "");
      form.setValue("newProduct.horizontalRepeat", stockItem.horizontalRepeatCms || "");
      void handleBcnQtysearchfromIMS(stockItem.bcn || stockItem.id);
    }
  };

  // IMS Quantity Fetch
  const handleBcnQtysearchfromIMS = async (bcn: string): Promise<number | null> => {
    const normalizedBcn = String(bcn || "").trim();
    if (!normalizedBcn) return null;

    try {
      setImsSearching(true);
      const query = new URLSearchParams({ bcn: normalizedBcn });
      const response = await fetch(`/api/ims-sheet?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        console.warn(`IMS fetch failed for BCN "${normalizedBcn}" status ${response.status}`);
        setCurrentBcnimsQty(null);
        return null;
      }

      const payload = await response.json();
      const imsQty = typeof payload?.qty === "number" && Number.isFinite(payload.qty)
        ? payload.qty
        : null;

      if (imsQty !== null) {
        setCurrentBcnimsQty({ qty: imsQty, date: payload.date ?? null });
        return imsQty;
      } else {
        setCurrentBcnimsQty(null);
        return null;
      }
    } catch (error) {
      console.error("Error fetching IMS quantity:", error);
      setCurrentBcnimsQty(null);
      return null;
    } finally {
      setImsSearching(false);
    }
  };

  // Hardware Save Handler
  const handleSaveHardware = useCallback((payload: any) => {
    setStagedItems((prev) => [
      ...prev,
      {
        id: `hardware-${Date.now()}`,
        productType: "Hardware",
        ...payload,
        rate: payload.rate || "",
        quantity: payload.quantity || "",
        blindDetails: Array.isArray(payload.blindDetails) ? payload.blindDetails : [],
        isBlind: Array.isArray(payload.blindDetails) && payload.blindDetails.length > 0,
        timestamp: payload.timestamp || Date.now(),
      },
    ]);
    setHardwareDialogOpen(false);
  }, []);

  // VAS Save Handler
  const handleSaveVas = useCallback((payload: any) => {
    setStagedItems((prev) => [
      ...prev,
      {
        id: `vas-${Date.now()}`,
        productType: "VAS",
        ...payload,
      },
    ]);
  }, []);

  // Load hardware from localStorage on mount
  useEffect(() => {
    const raw = localStorage.getItem("hardwarePayload");
    if (!raw) return;

    let hardwareItems = [];
    try {
      hardwareItems = JSON.parse(raw);
    } catch {
      console.error("Invalid hardwarePayload JSON");
      return;
    }

    if (!Array.isArray(hardwareItems)) return;

    const normalizedItems = hardwareItems.map((hw) => {
      const oldCategory = hw.items?.itemCategory || null;
      const oldLabel = hw.items?.itemLabel || null;
      const oldQty = hw.items?.itemQty || null;
      const oldRate = hw.items?.itemRate || null;
      const newCategory = hw.category || null;
      const newType = hw.type || null;
      const finalCategory = newCategory || oldCategory || "Hardware";
      const finalLabel = newType || oldLabel || finalCategory;
      const finalId = `${finalCategory}-${finalLabel}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      return {
        ...hw,
        id: finalId,
        collectionBrand: finalLabel,
        quantity: hw.quantity || oldQty || "1",
        rate: hw.rate || oldRate || "",
        productSource: "Hardware",
      };
    });

    setStagedItems((prev) => [...prev, ...normalizedItems]);
    localStorage.removeItem("hardwarePayload");
  }, []);

  // Stage Item Handler
  const handleStageItem = () => {
    const newProduct = form.getValues("newProduct");
    if (form.getValues("room") === "") {
      toast({ variant: "destructive", title: "Missing Room", description: "Please select a room first." });
      return;
    }

    const sourceTag =
      activeMainSection === "fabric"
        ? "fabric"
        : activeMainSection === "wallpaper"
        ? "wallpaper"
        : activeMainSection === "flooring"
        ? "flooring"
        : "other";

    const isFabric = activeMainSection === "fabric";
    setStagedItems((prev) => [
      ...prev,
      {
        ...newProduct,
        productSource: sourceTag,
        flooringType: selectedFlooringType || newProduct.Type || null,
        ...(isFabric
          ? {
              productCategory: "FABRIC",
              subCategory: fabricCategoryGroup,
            }
          : {}),
      },
    ]);

    form.reset({
      ...form.getValues(),
      newProduct: {
        Type: "",
        collectionBrand: "",
        salesDescription: "",
        mrp: "",
        quantity: "",
        remarks: "",
        verticalRepeat: "",
        horizontalRepeat: "",
      },
    });
  };

  // Add Products to List
  // ProductsTab.tsx (or wherever handleAddProductsToList is)

const handleAddProductsToList = async () => {
  const room = form.getValues("room");
  if (!room) {
    toast({ variant: "destructive", title: "Missing Room", description: "Please select a room first." });
    return;
  }
  if (stagedItems.length === 0) {
    toast({ variant: "destructive", title: "No Items", description: "Please add at least one item to stage." });
    return;
  }

  const timestamp = Date.now();
  const newProductsForForm: DealProduct[] = stagedItems.map((item, index) => {
    const isHardware = item.productType === "Hardware";
    const isVAS = item.productType === "VAS";
    
    let collectionBrand;
    let salesDescription;

    if (isHardware) {
      collectionBrand = item.bcn || item.subCategory || item.productCategory;
      salesDescription = item.subCategory ? `${item.productCategory} → ${item.subCategory}` : item.productCategory;
    } else if (isVAS) {
      collectionBrand = item.productCategory || "VAS";
      salesDescription = item.subCategory;
    } else {
      collectionBrand = item.collectionBrand;
      salesDescription = item.salesDescription;
    }
    
    const label = collectionBrand || `item-${index}`;

    return {
      ...(item as any),
      id: `${label}-${timestamp}-${index}`,
      collectionBrand: collectionBrand,
      salesDescription: salesDescription,
      productType: item.productType || 'fabric',
      quantity: (item as any).quantity ?? (item as any).items?.itemQty ?? "0",
      room,
      isBlind: Boolean((item as any).isBlind),
    };
  });

  // ✅ SAVE TO DATABASE
  try {
    setLoading(true);
    
    // Append to latest in-memory products to avoid stale-prop overwrite
    const updatedProducts = [...savedProducts, ...newProductsForForm];
    
    const result = await updateDealProducts(
      customerId,
      dealId,
      updatedProducts,
      {
        id: (user as any)?.id,
        name: (user as any)?.name || (user as any)?.email || "System",
      }
    );
    
    if (result.success) {
      toast({
        title: "Products Added",
        description: `${newProductsForForm.length} item(s) added to the list.`
      });
      setStagedItems([]);
      setSavedProducts(updatedProducts);
      onProductsSaved?.();
    } else {
      toast({ 
        variant: "destructive", 
        title: "Failed to save", 
        description: result.message 
      });
    }
  } catch (error) {
    toast({ 
      variant: "destructive", 
      title: "Error", 
      description: "Failed to save products" 
    });
  } finally {
    setLoading(false);
  }
};

  // Flooring Selection
  const handleSelectFlooring = (type: string) => {
    setSelectedFlooringType(type);
    setActiveMainSection("flooring");
    setFlooringDialogOpen(false);
  };

  return (
    <FormProvider {...form}>
      <Card className="mt-6">
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Products</h2>
              <p className="text-sm text-muted-foreground">Add items and stage them for this deal.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setScanOpen(true)}
            >
              <ScanLine className="mr-2 h-4 w-4" />
              Scan QR
            </Button>
          </div>

          <Separator className="my-4" />

          <form className="space-y-4">
            <div className="space-y-4">
              {/* MAIN SECTION */}
              {activeMainSection === "main" && (
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="p-4 border rounded-xl flex flex-col gap-3">
                        <button
                          type="button"
                          className="border rounded-lg py-2 px-3 hover:bg-muted transition"
                          onClick={() => setActiveMainSection("fabric")}
                        >
                          Furnishing Fabric
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveMainSection("wallpaper")}
                          className="border rounded-lg py-2 px-3 hover:bg-muted transition"
                        >
                          Wallpaper
                        </button>

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setFlooringDialogOpen(true)}
                        >
                          Flooring
                        </Button>
                      </div>

                      <div className="p-4 border rounded-xl flex flex-col gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setHardwareDialogOpen(true)}
                        >
                          Hardware
                        </Button>
                        <VasForm form={form} onSaveVas={handleSaveVas} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* FABRIC SECTION */}
              {activeMainSection === "fabric" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Add More Product</h3>
                  <div className="p-4 border rounded-lg space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2 flex items-end gap-2">
                        <FormField
                          control={form.control}
                          name="room"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Room*</FormLabel>
                              <Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="Select Room..." />
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button type="button" variant="outline">
                          <PlusCircle className="mr-2 h-4 w-4" /> Add new Room
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <FormItem>
                        <FormLabel>Fabric Category</FormLabel>
                        <Select
                          value={fabricCategoryGroup}
                          onValueChange={(value) => setFabricCategoryGroup(value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {getStockSubcategories("FABRIC").map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>

                      <FormField
                        control={form.control}
                        name="newProduct.collectionBrand"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>BCN*</FormLabel>
                            <Combobox
                              options={bcnOptions}
                              value={field.value}
                              onSelect={(value) => {
                                field.onChange(value);
                                handleBcnSelect(value);
                              }}
                              onSearch={handleBcnSearch}
                              placeholder="Search by BCN..."
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="newProduct.salesDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sales Description</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="newProduct.mrp"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>MRP</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="newProduct.quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center justify-between">
                              <span className="text-sm font-medium">Quantity</span>

                              {imsSearching ? (
                                <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5">
                                  <svg
                                    className="h-3 w-3 animate-spin text-gray-400"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  <span className="text-xs text-gray-400">Fetching stock...</span>
                                </div>
                              ) : currentBcnimsQty ? (
                                <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${
                                  (currentBcnimsQty.qty ?? 0) === 0
                                    ? "border-red-200 bg-red-50"
                                    : (currentBcnimsQty.qty ?? 0) < 10
                                    ? "border-yellow-200 bg-yellow-50"
                                    : "border-emerald-200 bg-emerald-50"
                                }`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${
                                    (currentBcnimsQty.qty ?? 0) === 0
                                      ? "bg-red-500"
                                      : (currentBcnimsQty.qty ?? 0) < 10
                                      ? "bg-yellow-500"
                                      : "bg-emerald-500"
                                  }`} />
                                  <span className={`text-xs font-semibold ${
                                    (currentBcnimsQty.qty ?? 0) === 0
                                      ? "text-red-700"
                                      : (currentBcnimsQty.qty ?? 0) < 10
                                      ? "text-yellow-700"
                                      : "text-emerald-700"
                                  }`}>
                                    Stock: {currentBcnimsQty.qty ?? 0}
                                  </span>
                                  {currentBcnimsQty.date && (
                                    <>
                                      <span className="text-gray-300">·</span>
                                      <span className={`text-xs ${
                                        (currentBcnimsQty.qty ?? 0) === 0
                                          ? "text-red-600"
                                          : (currentBcnimsQty.qty ?? 0) < 10
                                          ? "text-yellow-600"
                                          : "text-emerald-600"
                                      }`}>
                                        {currentBcnimsQty.date}
                                      </span>
                                    </>
                                  )}
                                </div>
                              ) : null}
                            </FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="newProduct.verticalRepeat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vertical Repeat</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.horizontalRepeat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Horizontal Repeat</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.remarks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Remark</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-start items-start gap-2">
                      <Button type="button" size="sm" onClick={handleStageItem}>
                        Add Item
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setActiveMainSection("main")}>
                        Back
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* WALLPAPER SECTION */}
              {activeMainSection === "wallpaper" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Add More Wallpaper</h3>
                  <div className="p-4 border rounded-lg space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="room"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Room*</FormLabel>
                            <Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="Select Room..." />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="md:col-span-2 flex items-end gap-2">
                        <Button type="button" variant="outline">
                          <PlusCircle className="mr-2 h-4 w-4" /> Add new Room
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <FormField
                        control={form.control}
                        name="newProduct.collectionBrand"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>WallPaper Code*</FormLabel>
                            <Input
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value)}
                              placeholder="Wallpaper Code .."
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.salesDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sales Description</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.mrp"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>MRP</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Qty</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="newProduct.verticalRepeat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vertical Repeat</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.horizontalRepeat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Horizontal Repeat</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.remarks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Remark</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-start items-start gap-2">
                      <Button type="button" size="sm" onClick={handleStageItem}>
                        Add Item
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setActiveMainSection("main")}>
                        Back
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* FLOORING SECTION */}
              {activeMainSection === "flooring" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Add More Flooring</h3>
                  <div className="p-4 border rounded-lg space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="room"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Room*</FormLabel>
                            <Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="Select Room..." />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="md:col-span-2 flex items-end gap-2">
                        <Button type="button" variant="outline">
                          <PlusCircle className="mr-2 h-4 w-4" /> Add new Room
                        </Button>
                      </div>
                      <FormField
                        control={form.control}
                        name="newProduct.Type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Flooring Type</FormLabel>
                            <FormControl>
                              <Combobox
                                options={["Wooden Flooring", "Carpet flooring"].map(floorType => ({ value: floorType, label: floorType }))}
                                value={field.value}
                                onSelect={(value) => field.onChange(value)}
                                placeholder="Select Flooring Type."
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <FormField
                        control={form.control}
                        name="newProduct.collectionBrand"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>BCN*</FormLabel>
                            <Combobox
                              options={bcnOptions}
                              value={field.value}
                              onSelect={(value) => {
                                field.onChange(value);
                                handleBcnSelect(value);
                              }}
                              onSearch={handleBcnSearch}
                              placeholder="Search by BCN..."
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.salesDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sales Description</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.mrp"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>MRP</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Qty</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="newProduct.verticalRepeat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vertical Repeat</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.horizontalRepeat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Horizontal Repeat</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newProduct.remarks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Remark</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-start items-start gap-2">
                      <Button type="button" size="sm" onClick={handleStageItem}>
                        Add Item
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setActiveMainSection("main")}>
                        Back
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* STAGED ITEMS DISPLAY */}
              {stagedItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Staged Items for Room: {form.getValues("room") || "Unassigned"}</h4>
                  <ul className="text-xs list-disc list-inside p-2 border rounded-md bg-muted/50">
                    {stagedItems.map((item, i) => (
                      <li key={i}>
                        {item.productType === "VAS" ? (
                          <span>
                            <strong>{item.productCategory}</strong>
                            {" → "}
                            {item.subCategory}
                            {item.quantity && <span>{` (Qty: ${item.quantity})`}</span>}
                          </span>
                        ) : item.productType === "Hardware" ? (
                          <span>
                            <strong>{item.productCategory}</strong>
                            {" → "}
                            {item.subCategory}
                            {item.quantity && <span>{` (Qty: ${item.quantity})`}</span>}
                            {item.bcn && <span>{` | BCN: ${item.bcn}`}</span>}
                            {Array.isArray(item.blindDetails) && item.blindDetails.length > 0 && (
                              <span>{` | Blind Details: ${item.blindDetails.length}`}</span>
                            )}
                          </span>
                        ) : item.productSource === "flooring" ? (
                          <span>
                            Flooring → <strong>{item.flooringType}</strong> — Qty: {item.quantity}
                          </span>
                        ) : (
                          <span>
                            {item.collectionBrand} - Qty: {item.quantity || "N/A"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button type="button" onClick={handleAddProductsToList} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Add Products to List
              </Button>
            </div>

            <Separator className="my-8" />
          </form>
        </CardContent>
      </Card>

      {/* LAZY LOADED DIALOGS */}
      <Suspense fallback={<div>Loading...</div>}>
        {scanOpen && (
          <ScannerDialog
            open={scanOpen}
            onOpenChange={setScanOpen}
            onStageItem={(stock, productId) => {
              setStagedItems((prev) => [...prev, {
                collectionBrand: stock?.bcn || stock?.id || productId,
                salesDescription: stock?.itemName || "",
                mrp: stock?.rrpWithGstRs != null ? String(stock.rrpWithGstRs) : "",
                quantity: "",
                remarks: "",
                verticalRepeat: stock?.verticalRepeatCms || "",
                horizontalRepeat: stock?.horizontalRepeatCms || "",
                productId: stock?.productId || productId,
                productSource: stock?.type?.toLowerCase().includes("wall") ? "wallpaper" : stock?.type?.toLowerCase().includes("floor") ? "flooring" : "fabric",
              }]);
            }}
          />
        )}

        {flooringDialogOpen && (
          <FlooringDialog
            open={flooringDialogOpen}
            onOpenChange={setFlooringDialogOpen}
            onSelectFlooring={handleSelectFlooring}
          />
        )}

        {hardwareDialogOpen && (
          <HardwareDialog
            open={hardwareDialogOpen}
            onOpenChange={setHardwareDialogOpen}
            onSaveHardware={handleSaveHardware}
            form={form}
          />
        )}
      </Suspense>
    </FormProvider>
  );
}
