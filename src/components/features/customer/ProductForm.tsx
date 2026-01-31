
"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { DealProduct } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { PlusCircle, Trash2, ScanLine, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { searchStockByBcn, searchStockById } from "@/app/dashboard/inventory/actions";
import { roomOptions } from "@/lib/constants";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import Hardwareform from "./Hardwareform";
import { VasForm } from "./VasForm";
import { Html5Qrcode } from "html5-qrcode";
import { Label } from "@/components/ui/label";

const blindEntrySchema = z.object({
  id: z.string(),
  blindType: z.enum(["Roman Blind", "Roller Blind", "Normal Blind"]).optional(),
  shadeNo: z.string().optional(),
  width: z.string().optional(),
  widthUnit: z.string().optional().default("inch"),
  height: z.string().optional(),
  heightUnit: z.string().optional().default("inch"),
  operating: z.enum(["Manual", "motorized"]).optional(),
  usesType: z
    .enum(["Direct Fix", "Head Rail", "Plain Cassette", "Decorative Cassette", "One Touch Up", "Moto Down"])
    .optional(),
  motorType: z.enum(["Simotic or Ebony (RTS | WT)", "Wire Free (RTS)"]).optional(),
  remoteType: z.string().optional(),
  control: z.enum(["LHT", "RHT"]).optional(),
  bracket: z.enum(["Wall", "Celling"]).optional(),
  bottomChannel: z.enum(["Square", "Rounded", "Fabric Covered"]).optional(),
  bottomRailColor: z.string().optional(),
  otherBottomRailColor: z.string().optional(),
  locationOfBlind: z.string().optional(),
  noOfBlind: z.string().optional(),
});

const newProductEntrySchema = z.object({
  Type: z.string().optional().default(""), // ✅ ADD (used in flooring)
  collectionBrand: z.string().min(1, "BCN is required."),
  bcn: z.string().optional().default(""),
  salesDescription: z.string().optional().default(""),
  mrp: z.string().optional().default(""),
  verticalRepeat: z.string().optional().default(""),
  horizontalRepeat: z.string().optional().default(""),
  quantity: z.string().optional().default(""),
  remarks: z.string().optional().default(""),
  unit: z.string().optional().default(""),
  gstPercent: z.string().optional().default(""),
  hsnOrSac: z.string().optional().default(""),
  supplierCollectionName: z.string().optional().default(""),
  supplierCollectionCode: z.string().optional().default(""),
  supplierCompanyName: z.string().optional().default(""),
  category: z.string().optional().default(""),
  categoryGroup: z.string().optional().default(""),
  itemName: z.string().optional().default(""),
  productId: z.string().optional().default(""),
});

const productListSchema = z.object({
  room: z.string().optional(),
  newProduct: newProductEntrySchema,
});

type ProductListFormValues = z.infer<typeof productListSchema>;
type BlindEntryFormValues = z.infer<typeof blindEntrySchema>;

const normalizeText = (value: unknown) => String(value ?? "").toLowerCase();

const matchesStockSection = (stock: any, section: string) => {
  if (!stock || !section) return true;
  const category = normalizeText(stock.category);
  const group = normalizeText(stock.categoryGroup);
  const type = normalizeText(stock.type);
  const name = normalizeText(stock.name || stock.itemName);
  const isService = Boolean(stock.isService);
  const matchesAny = (value: string, terms: string[]) =>
    terms.some((term) => value === term || value.includes(term));

  if (section === "fabric") {
    const terms = ["fabric"];
    return (
      matchesAny(category, terms) ||
      matchesAny(type, terms) ||
      matchesAny(group, terms)
    );
  }
  if (section === "wallpaper") {
    const terms = ["wallpaper", "wall"];
    return (
      matchesAny(category, terms) ||
      matchesAny(type, terms) ||
      matchesAny(group, terms) ||
      matchesAny(name, ["wallpaper"])
    );
  }
  if (section === "flooring") {
    const terms = ["floor", "flooring"];
    return (
      matchesAny(category, terms) ||
      matchesAny(type, terms) ||
      matchesAny(group, terms) ||
      matchesAny(name, ["floor"])
    );
  }
  if (section === "hardware") {
    const terms = ["hardware", "channel"];
    return matchesAny(category, terms) || matchesAny(type, terms) || matchesAny(group, terms);
  }
  if (section === "accessories") {
    const terms = ["accessory", "accessories"];
    return matchesAny(category, terms) || matchesAny(type, terms) || matchesAny(group, terms);
  }
  if (section === "stitching") {
    const terms = ["vas", "service"];
    return matchesAny(category, terms) || matchesAny(type, terms) || isService;
  }
  return true;
};

const AddBlindsDialog = ({
  isOpen,
  onClose,
  roomName,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  onSave: (products: DealProduct[]) => void;
}) => {
  const { toast } = useToast();
  const [localBlinds, setLocalBlinds] = useState<Partial<BlindEntryFormValues>[]>([
    { id: new Date().toISOString() },
  ]);

  const handleSave = () => {
    const blindsToSave = localBlinds.map(
      (blind) =>
        ({
          ...blind,
          isBlind: true,
          room: roomName,
          id: `blind-${Date.now()}-${Math.random()}`,
          collectionBrand: blind.shadeNo || "N/A",
        } as DealProduct)
    );

    onSave(blindsToSave);
    toast({
      title: "Blinds Added",
      description: `${blindsToSave.length} blind(s) staged. Use Update Activity to save.`,
    });
    onClose();
  };

  const updateLocalBlind = (index: number, field: keyof BlindEntryFormValues, value: any) => {
    const newBlinds = [...localBlinds];
    newBlinds[index] = { ...newBlinds[index], [field]: value };
    setLocalBlinds(newBlinds);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add Blinds for {roomName}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[70vh]">
          <div className="py-4 space-y-4 pr-4">
            {localBlinds.map((blind, index) => {
              const isMotorized = blind.operating === "motorized";
              const showOtherColor = blind.bottomRailColor === "Other";
              return (
                <Card key={blind.id} className="p-4 relative">
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={() => setLocalBlinds((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <p className="font-semibold mb-3">Blind #{index + 1}</p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <FormItem>
                      <FormLabel>Blind Type</FormLabel>
                      <Select onValueChange={(val) => updateLocalBlind(index, "blindType", val)} value={blind.blindType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Roman Blind">Roman Blind</SelectItem>
                          <SelectItem value="Roller Blind">Roller Blind</SelectItem>
                          <SelectItem value="Normal Blind">Normal Blind</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Shade No</FormLabel>
                      <Input value={blind.shadeNo} onChange={(e) => updateLocalBlind(index, "shadeNo", e.target.value)} />
                    </FormItem>
                    <FormItem>
                      <FormLabel>Width</FormLabel>
                      <div className="flex items-center gap-1">
                        <Input value={blind.width} onChange={(e) => updateLocalBlind(index, "width", e.target.value)} />
                        <Select onValueChange={(val) => updateLocalBlind(index, "widthUnit", val)} value={blind.widthUnit}>
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inch">inch</SelectItem>
                            <SelectItem value="mm">mm</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Height</FormLabel>
                      <div className="flex items-center gap-1">
                        <Input value={blind.height} onChange={(e) => updateLocalBlind(index, "height", e.target.value)} />
                        <Select onValueChange={(val) => updateLocalBlind(index, "heightUnit", val)} value={blind.heightUnit}>
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inch">inch</SelectItem>
                            <SelectItem value="mm">mm</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Operating</FormLabel>
                      <Select onValueChange={(val) => updateLocalBlind(index, "operating", val)} value={blind.operating}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Operating" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Manual">Manual</SelectItem>
                          <SelectItem value="motorized">motorized</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Uses Type</FormLabel>
                      <Select onValueChange={(val) => updateLocalBlind(index, "usesType", val)} value={blind.usesType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Uses Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Direct Fix">Direct Fix</SelectItem>
                          <SelectItem value="Head Rail">Head Rail</SelectItem>
                          <SelectItem value="Plain Cassette">Plain Cassette</SelectItem>
                          <SelectItem value="Decorative Cassette">Decorative Cassette</SelectItem>
                          <SelectItem value="One Touch Up">One Touch Up</SelectItem>
                          <SelectItem value="Moto Down">Moto Down</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    {isMotorized && (
                      <FormItem>
                        <FormLabel>Motor Type</FormLabel>
                        <Select onValueChange={(val) => updateLocalBlind(index, "motorType", val)} value={blind.motorType}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Motor Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Simotic or Ebony (RTS | WT)">Simotic or Ebony (RTS | WT)</SelectItem>
                            <SelectItem value="Wire Free (RTS)">Wire Free (RTS)</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                    {isMotorized && (
                      <FormItem>
                        <FormLabel>Remote Type</FormLabel>
                        <Input
                          value={blind.remoteType}
                          onChange={(e) => updateLocalBlind(index, "remoteType", e.target.value)}
                        />
                      </FormItem>
                    )}
                    <FormItem>
                      <FormLabel>Control</FormLabel>
                      <Select onValueChange={(val) => updateLocalBlind(index, "control", val)} value={blind.control}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Control" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LHT">LHT</SelectItem>
                          <SelectItem value="RHT">RHT</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Bracket</FormLabel>
                      <Select onValueChange={(val) => updateLocalBlind(index, "bracket", val)} value={blind.bracket}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Bracket" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Wall">Wall</SelectItem>
                          <SelectItem value="Celling">Celling</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Bottom Channel</FormLabel>
                      <Select
                        onValueChange={(val) => updateLocalBlind(index, "bottomChannel", val)}
                        value={blind.bottomChannel}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Channel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Square">Square</SelectItem>
                          <SelectItem value="Rounded">Rounded</SelectItem>
                          <SelectItem value="Fabric Covered">Fabric Covered</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Bottom Rail Color</FormLabel>
                      <Select
                        onValueChange={(val) => updateLocalBlind(index, "bottomRailColor", val)}
                        value={blind.bottomRailColor}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Color" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Matching">Matching</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                    {showOtherColor && (
                      <FormItem>
                        <FormLabel>Specify Color</FormLabel>
                        <Input
                          value={blind.otherBottomRailColor}
                          onChange={(e) => updateLocalBlind(index, "otherBottomRailColor", e.target.value)}
                        />
                      </FormItem>
                    )}
                    <FormItem>
                      <FormLabel>Location of Blind</FormLabel>
                      <Input
                        value={blind.locationOfBlind}
                        onChange={(e) => updateLocalBlind(index, "locationOfBlind", e.target.value)}
                      />
                    </FormItem>
                    <FormItem>
                      <FormLabel>No Of Blind (Pcs)</FormLabel>
                      <Input
                        type="number"
                        value={blind.noOfBlind}
                        onChange={(e) => updateLocalBlind(index, "noOfBlind", e.target.value)}
                      />
                    </FormItem>
                  </div>
                </Card>
              );
            })}
            <Button variant="outline" onClick={() => setLocalBlinds((prev) => [...prev, { id: new Date().toISOString() }])}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Another Blind
            </Button>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button onClick={handleSave}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type ProductFormProps = {
  initialProducts?: DealProduct[];
  onProductsUpdated?: (products: DealProduct[]) => void;
  onRefresh: () => void;
};


export function ProductForm({
  initialProducts,
  onProductsUpdated,
}: ProductFormProps) {
  const { toast } = useToast();
  const [bcnOptions, setBcnOptions] = useState<ComboboxOption[]>([]);
  const [stagedItems, setStagedItems] = useState<any[]>([]);
  const [activeMainSection, setActiveMainSection] = useState("main");
  const [currentProducts, setCurrentProducts] = useState<DealProduct[]>(initialProducts || []);
  
  const [internalBlindDialogState, setInternalBlindDialogState] = useState<{ isOpen: boolean; roomName: string | null; }>({ isOpen: false, roomName: null });

  useEffect(() => {
    setCurrentProducts(initialProducts || []);
  }, [initialProducts]);

  useEffect(() => {
    setBcnOptions([]);
  }, [activeMainSection]);
  

  const form = useForm<ProductListFormValues>({
    resolver: zodResolver(productListSchema),
    defaultValues: {
      room: "",
      newProduct: {
        bcn: "",
        collectionBrand: "",
        salesDescription: "",
        mrp: "",
        verticalRepeat: "",
        horizontalRepeat: "",
        quantity: "",
        remarks: "",
        unit: "",
        gstPercent: "",
        hsnOrSac: "",
        supplierCollectionName: "",
        supplierCollectionCode: "",
        supplierCompanyName: "",
        category: "",
        categoryGroup: "",
        itemName: "",
        productId: "",
      },
    },
  });

  const handleBcnSearch = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setBcnOptions([]);
        return;
      }
      try {
        const results = await searchStockByBcn(query);
        const filtered = results.filter((stock) => matchesStockSection(stock, activeMainSection));
        const options = filtered.map((stock) => ({
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
    [toast, activeMainSection]
  );

  const handleBcnSelect = (value: string) => {
    const selectedOption = bcnOptions.find((opt) => opt.value === value) as any;
    if (selectedOption) {
      const stockItem = selectedOption.stockItem;
      const supplierDescription = [stockItem?.supplierCollectionName, stockItem?.supplierCollectionCode]
        .filter(Boolean)
        .join(" ")
        .trim();

      const displayDescription =
        supplierDescription ||
        stockItem?.itemName ||
        stockItem?.name ||
        stockItem?.categoryGroup ||
        "";

      const resolvedBcn = stockItem?.bcn || stockItem?.id || value;
      const resolvedMrp =
        stockItem?.rrpWithGstRs != null
          ? String(stockItem.rrpWithGstRs)
          : stockItem?.mrp != null
          ? String(stockItem.mrp)
          : "";

      form.setValue("newProduct.collectionBrand", resolvedBcn);
      form.setValue("newProduct.bcn", resolvedBcn);
      form.setValue("newProduct.mrp", resolvedMrp);
      form.setValue("newProduct.salesDescription", displayDescription);
      form.setValue("newProduct.verticalRepeat", stockItem.verticalRepeatCms || "");
      form.setValue("newProduct.horizontalRepeat", stockItem.horizontalRepeatCms || "");
      form.setValue("newProduct.unit", stockItem.unit || "");
      form.setValue("newProduct.gstPercent", stockItem.gstPercent != null ? String(stockItem.gstPercent) : "");
      form.setValue("newProduct.hsnOrSac", stockItem.hsnOrSac || "");
      form.setValue("newProduct.supplierCollectionName", stockItem.supplierCollectionName || "");
      form.setValue("newProduct.supplierCollectionCode", stockItem.supplierCollectionCode || "");
      form.setValue("newProduct.supplierCompanyName", stockItem.supplierCompanyName || "");
      form.setValue("newProduct.category", stockItem.category || "");
      form.setValue("newProduct.categoryGroup", stockItem.categoryGroup || "");
      form.setValue("newProduct.itemName", stockItem.itemName || stockItem.name || "");
      form.setValue("newProduct.productId", stockItem.productId || "");
      console.log("✅ BCN selected:", stockItem);
    }
  };

  const handleSaveHardware = (payload: any) => {
    console.log("✔️ Hardware Saved:", payload);

    setStagedItems((prev) => [
      ...prev,
      {
        id: `hardware-${Date.now()}`, 
        productType: "Hardware",
        productCategory: payload.productCategory,
        subCategory: payload.subCategory,
        bcn: payload.bcn || null,
        itemName: payload.itemName || null,
        salesDescription: payload.salesDescription || "",
        rate: payload.rate || "",
        quantity: payload.quantity || "",
        room: payload.room,
        image: payload.image || null,
        timestamp: payload.timestamp,
        unit: payload.unit || "",
        gstPercent: payload.gstPercent ?? "",
        hsnOrSac: payload.hsnOrSac || "",
        supplierCollectionName: payload.supplierCollectionName || "",
        supplierCollectionCode: payload.supplierCollectionCode || "",
        supplierCompanyName: payload.supplierCompanyName || "",
        category: payload.category || "",
        categoryGroup: payload.categoryGroup || "",
        productId: payload.productId || "",
      },
    ]);
  };

  const handleSaveVas = (payload: any) => {
    console.log("✔️ VAS Saved:", payload);
    setStagedItems((prev) => [
        ...prev,
        {
          id: `vas-${Date.now()}`,
          productType: "VAS",
          ...payload,
        }
    ]);
  }

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
    // 🟦 1. Extract legacy structure
    const oldCategory = hw.items?.itemCategory || null;
    const oldLabel = hw.items?.itemLabel || null;
    const oldQty = hw.items?.itemQty || null;
    const oldRate = hw.items?.itemRate || null;

    // 🟩 2. Extract new structure
    const newCategory = hw.category || null;
    const newType = hw.type || null;

    // Final classification
    const finalCategory = newCategory || oldCategory || "Hardware";
    const finalLabel = newType || oldLabel || finalCategory;

    // 🟧 3. Build safe unique ID
    const finalId = `${finalCategory}-${finalLabel}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    return {
      ...hw,

      // Required by staged items
      id: finalId,

      // Shown in product chip UI
      collectionBrand: finalLabel,

      // Standard values
      quantity: hw.quantity || oldQty || "1",
      rate: hw.rate || oldRate || "",

      // Identify this as hardware for AddedProduct
      productSource: "Hardware",
    };
  });

  // Append to staged items
  setStagedItems((prev) => [...prev, ...normalizedItems]);

  // Clean up
  localStorage.removeItem("hardwarePayload");
}, []);

const handleStageItem = () => {
  const newProduct = form.getValues("newProduct");
  const resolvedBcn = newProduct.bcn || newProduct.collectionBrand;

  const sourceTag =
    activeMainSection === "fabric"
      ? "fabric"
      : activeMainSection === "wallpaper"
      ? "wallpaper"
      : activeMainSection === "flooring"
      ? "flooring"
      : "other";

  setStagedItems((prev) => [
    ...prev,
    {
      ...newProduct,
      bcn: resolvedBcn,
      productSource: sourceTag,
      flooringType: selectedFlooringType || newProduct.Type || null,
    },
  ]);

    form.reset({
      ...form.getValues(),
      newProduct: {
        Type: "",
        collectionBrand: "",
        bcn: "",
        salesDescription: "",
        mrp: "",
        quantity: "",
        remarks: "",
        verticalRepeat: "",
        horizontalRepeat: "",
        unit: "",
        gstPercent: "",
        hsnOrSac: "",
        supplierCollectionName: "",
        supplierCollectionCode: "",
        supplierCompanyName: "",
        category: "",
        categoryGroup: "",
        itemName: "",
        productId: "",
      },
    });
  };

  const [step, setStep] = useState("main");

  const handleAddProductsToList = () => {
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
      let resolvedBcn;

      if (isHardware) {
        collectionBrand = item.bcn || item.subCategory || item.productCategory;
        salesDescription =
          item.salesDescription ||
          (item.subCategory ? `${item.productCategory} -> ${item.subCategory}` : item.productCategory);
        resolvedBcn = item.bcn || item.collectionBrand || item.subCategory;
      } else if (isVAS) {
        collectionBrand = item.productCategory || "VAS";
        salesDescription = item.salesDescription || item.subCategory;
        resolvedBcn = undefined;
      } else {
        collectionBrand = item.collectionBrand;
        salesDescription = item.salesDescription;
        resolvedBcn = item.bcn || item.collectionBrand;
      }
      
      const label = collectionBrand || `item-${index}`;

      const resolvedProductType =
        item.productType ||
        (String(item.productSource || "").toLowerCase() === "hardware" ? "Hardware" : "fabric");

      return {
        ...(item as any),
        id: `${label}-${timestamp}-${index}`,
        collectionBrand: collectionBrand,
        salesDescription: salesDescription,
        bcn: resolvedBcn,
        productType: resolvedProductType,
        quantity: (item as any).quantity ?? (item as any).items?.itemQty ?? "0",
        room,
        isBlind: false,
      };
    });

    setCurrentProducts((prev) => {
      const merged = [...prev, ...newProductsForForm];
      if (typeof onProductsUpdated === "function") {
        onProductsUpdated(merged);
      } else {
        console.warn("onProductsUpdated not provided; products updated locally only.");
      }
      return merged;
    });
    setStagedItems([]);
    toast({ title: "Products Added", description: `${newProductsForForm.length} item(s) added to the list.` });
  };

  const handleBlindsAdded = (blinds: DealProduct[]) => {
    setCurrentProducts((prev) => {
      const merged = [...prev, ...blinds];
      if (typeof onProductsUpdated === "function") {
        onProductsUpdated(merged);
      } else {
        console.warn("onProductsUpdated not provided; products updated locally only.");
      }
      return merged;
    });
  };

  const selectedRoom = form.watch("room");
    const [flooringDialogOpen, setFlooringDialogOpen] = useState(false);
    const [selectedFlooringType, setSelectedFlooringType] = useState("");

    const handleSelectFlooring = (type: string) => {
    setSelectedFlooringType(type);
    setActiveMainSection("flooring");
    setFlooringDialogOpen(false);
    };

    const resolvedBlindDialogState = internalBlindDialogState;
    const scannerContainerId = "product-scan-container";
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    const scanLockRef = useRef(false);
    const scanCompletedRef = useRef(false);
    const [scanOpen, setScanOpen] = useState(false);
    const [scanInput, setScanInput] = useState("");
    const [scanError, setScanError] = useState<string | null>(null);
    const [scanLoading, setScanLoading] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

    const extractProductIdFromValue = useCallback((value: string) => {
      const trimmed = String(value || "").trim();
      if (!trimmed) return null;

      const directMatch = trimmed.match(/product\/detail\/([^/?#]+)/i);
      if (directMatch?.[1]) return directMatch[1];

      try {
        const url = new URL(trimmed);
        const parts = url.pathname.split("/").filter(Boolean);
        const detailIndex = parts.findIndex((part) => part.toLowerCase() === "detail");
        if (detailIndex !== -1 && parts[detailIndex + 1]) {
          return parts[detailIndex + 1];
        }
        return parts[parts.length - 1] || null;
      } catch {
        const parts = trimmed.split("/").filter(Boolean);
        return parts[parts.length - 1] || null;
      }
    }, []);

    const resolveStockSource = useCallback((stock: any) => {
      const rawType = String(stock?.type || "").toLowerCase();
      const rawCategory = String(stock?.category || "").toLowerCase();
      const rawGroup = String(stock?.categoryGroup || "").toLowerCase();
      const combined = `${rawType} ${rawCategory} ${rawGroup}`;
      if (combined.includes("wall")) return "wallpaper";
      if (combined.includes("floor")) return "flooring";
      if (combined.includes("hardware") || combined.includes("accessory") || combined.includes("channel")) {
        return "hardware";
      }
      return "fabric";
    }, []);

    const playBeep = useCallback((variant: "success" | "error") => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.value = variant === "success" ? 880 : 220;
        gain.gain.value = 0.08;

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
        osc.stop(ctx.currentTime + 0.25);
        osc.onended = () => ctx.close();
      } catch (error) {
        console.error("Beep failed:", error);
      }
    }, []);

    const stageStockItem = useCallback(
      (stock: any, productId: string) => {
        const collectionBrand = stock?.bcn || stock?.id || productId;

        // ✅ extra lock (camera sometimes calls twice before stop completes)
        if (stageLockRef.current) return;
        stageLockRef.current = true;

        setStagedItems((prev) => {
          const alreadyStaged = prev.some(
            (x: any) =>
              String(x?.productId || "") === String(stock?.productId || productId) ||
              String(x?.collectionBrand || "") === String(collectionBrand)
          );
          if (alreadyStaged) return prev;

          const supplierDescription = [stock?.supplierCollectionName, stock?.supplierCollectionCode]
            .filter(Boolean)
            .join(" ")
            .trim();
          const salesDescription =
            supplierDescription ||
            stock?.itemName ||
            stock?.name ||
            stock?.categoryGroup ||
            "";
          const mrp =
            stock?.rrpWithGstRs != null
              ? String(stock.rrpWithGstRs)
              : stock?.mrp != null
              ? String(stock.mrp)
              : "";
          const verticalRepeat = stock?.verticalRepeatCms != null ? String(stock.verticalRepeatCms) : "";
          const horizontalRepeat = stock?.horizontalRepeatCms != null ? String(stock.horizontalRepeatCms) : "";
          const productSource = resolveStockSource(stock);

          return [
            ...prev,
            {
              collectionBrand,
              bcn: stock?.bcn || stock?.id || collectionBrand,
              salesDescription,
              mrp,
              quantity: "",
              remarks: "",
              verticalRepeat,
              horizontalRepeat,
              productId: stock?.productId || productId,
              productSource,
              unit: stock?.unit || "",
              gstPercent: stock?.gstPercent != null ? String(stock.gstPercent) : "",
              hsnOrSac: stock?.hsnOrSac || "",
              supplierCollectionName: stock?.supplierCollectionName || "",
              supplierCollectionCode: stock?.supplierCollectionCode || "",
              supplierCompanyName: stock?.supplierCompanyName || "",
              category: stock?.category || "",
              categoryGroup: stock?.categoryGroup || "",
              itemName: stock?.itemName || stock?.name || "",
            },
          ];
        });

        // ✅ release lock next tick
        setTimeout(() => {
          stageLockRef.current = false;
        }, 0);

        toast({
          title: "Product staged",
          description: `${collectionBrand} added to staging.`,
        });
      },
      [resolveStockSource, toast]
    );


    const stopScanner = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    const inst = html5QrCodeRef.current;
    if (!inst) {
      stoppingRef.current = false;
      return;
    }

    try {
      // stop only if scanning
      if (inst.isScanning) {
        await inst.stop().catch(() => {});
      }

      // ✅ clear only if container still exists in DOM
      const container = document.getElementById(scannerContainerId);
      if (container) {
        try {
          await inst.clear();
        } catch (err: any) {
          // ignore "removeChild" style errors
          console.warn("html5-qrcode clear ignored:", err?.message || err);
        }
      }
    } finally {
      stoppingRef.current = false;
    }
  }, [scannerContainerId]);


    const handleScanPayload = useCallback(async (value: string): Promise<boolean> => {
      const productId = extractProductIdFromValue(value);
      if (!productId) {
        setScanError("Invalid QR code. Expected a product detail link.");
        playBeep("error");
        return false;
      }

      setScanError(null);
      setScanLoading(true);
      try {
        const results = await searchStockById(productId);
        if (!results || results.length === 0) {
          setScanError(`No stock found for product ID ${productId}.`);
          playBeep("error");
          return false;
        }
        scanCompletedRef.current = true;
        await stopScanner();
        stageStockItem(results[0], productId);
        playBeep("success");
        setScanOpen(false);
        return true;
      } catch (error) {
        console.error("Failed to fetch stock by product ID:", error);
        setScanError("Failed to fetch stock for this product ID.");
        playBeep("error");
        return false;
      } finally {
        setScanLoading(false);
      }
    }, [extractProductIdFromValue, playBeep, stageStockItem, stopScanner]);

    const lastDecodedRef = useRef<{ text: string; ts: number } | null>(null);
    const stageLockRef = useRef(false); // extra safety against double staging
    const stoppingRef = useRef(false);



    const handleScanSuccess = useCallback(
      (decodedText: string) => {
        const now = Date.now();
        const last = lastDecodedRef.current;

        // ✅ Ignore same QR firing repeatedly within 1500ms
        if (last && last.text === decodedText && now - last.ts < 1500) {
          return;
        }
        lastDecodedRef.current = { text: decodedText, ts: now };

        // ✅ Also block if already in progress / completed
        if (scanLockRef.current || scanCompletedRef.current) return;

        scanLockRef.current = true;

        handleScanPayload(decodedText)
          .then((success) => {
            if (!success) {
              // allow retry only if it failed
              scanLockRef.current = false;
            }
          })
          .catch(() => {
            scanLockRef.current = false;
          });
      },
      [handleScanPayload]
    );


    const startScanner = useCallback(() => {
      if (!html5QrCodeRef.current || html5QrCodeRef.current.isScanning) {
        return;
      }

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        rememberLastUsedCamera: true,
      };

      html5QrCodeRef.current.start(
        { facingMode: "environment" },
        config,
        handleScanSuccess,
        () => {}
      ).catch((error) => {
        console.error("Scanner start error:", error);
        setHasCameraPermission(false);
        toast({ variant: "destructive", title: "Scanner Error", description: "Could not start the camera." });
      });
    }, [handleScanSuccess, toast]);

    useEffect(() => {
      if (!scanOpen) {
        setScanError(null);
        setScanInput("");
        setHasCameraPermission(null);
        scanLockRef.current = false;
        scanCompletedRef.current = false;
        stopScanner();
        return;
      }
      scanLockRef.current = false;
      scanCompletedRef.current = false;

      if (hasCameraPermission === null) {
        Html5Qrcode.getCameras()
          .then((devices) => {
            setHasCameraPermission(!!devices?.length);
          })
          .catch(() => setHasCameraPermission(false));
      }

      let cancelled = false;
      let rafId: number | null = null;

      const ensureScanner = () => {
        if (cancelled) return;
        const container = document.getElementById(scannerContainerId);
        if (!container) {
          rafId = requestAnimationFrame(ensureScanner);
          return;
        }
        if (!html5QrCodeRef.current) {
          html5QrCodeRef.current = new Html5Qrcode(scannerContainerId, { experimentalFeatures: { useOffscreenCanvas: true }, verbose: false });
        }
        if (hasCameraPermission) {
          startScanner();
        }
      };

      ensureScanner();

      return () => {
        cancelled = true;
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        stopScanner();
      };
    }, [scanOpen, hasCameraPermission, scannerContainerId, startScanner, stopScanner]);

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
              onClick={() => {
                // ✅ reset before opening
                setScanInput("");
                setScanError(null);
                setScanLoading(false);
                lastDecodedRef.current = null;
                scanLockRef.current = false;
                scanCompletedRef.current = false;
                setScanOpen(true);
              }}
            >
              <ScanLine className="mr-2 h-4 w-4" />
              Scan QR
            </Button>
          </div>

          <Separator className="my-4" />

          <form className="space-y-4">
            <div className="space-y-4">
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
                          onClick={() =>
                            setActiveMainSection("wallpaper")
                          }
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
                        <Hardwareform form={form} onSaveHardware={handleSaveHardware}/>
                        <VasForm form={form} onSaveVas={handleSaveVas}/>
                      </div>
                    </div>
                  </div>
                </div>
              )}
{/* ///////////////////////////////////////========================fabric section */}
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
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (selectedRoom) {
                              setInternalBlindDialogState({ isOpen: true, roomName: selectedRoom as any });
                            } else {
                              toast({ variant: "destructive", title: "No Room Selected" });
                            }
                          }}
                          disabled={!selectedRoom}
                        >
                          Add Blind
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

{/* /////////////////==========================Wallpaper section */     }
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
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (selectedRoom) {
                              setInternalBlindDialogState({ isOpen: true, roomName: selectedRoom as any });
                            } else {
                              toast({ variant: "destructive", title: "No Room Selected" });
                            }
                          }}
                          disabled={!selectedRoom}
                        >
                          Add Blind
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
              {/* ////////////////================flooring dialog / */}
                        <Dialog open={flooringDialogOpen} onOpenChange={setFlooringDialogOpen}>
                        <DialogContent className="max-w-[350px]">
                            <DialogHeader>
                            <DialogTitle>Flooring Options</DialogTitle>
                            </DialogHeader>

                            {step === "main" && (
                            <div className="grid gap-3 py-4">
                                <Button variant="outline" onClick={() => handleSelectFlooring("Wooden Flooring")}>
                                Wooden Flooring
                                </Button>

                                <Button variant="outline" onClick={() => setStep("carpet")}>
                                Carpet Flooring
                                </Button>
                            </div>
                            )}

                            {step === "carpet" && (
                            <div className="grid gap-3 py-4">
                                <Button variant="outline" onClick={() => handleSelectFlooring("Normal Carpet")}>
                                Normal Carpet flooring
                                </Button>

                                <Button variant="outline" onClick={() => handleSelectFlooring("Carpet Tile")}>
                                Carpet Tile flooring
                                </Button>

                                <Button variant="outline" className="mt-2" onClick={() => setStep("main")}>
                                ← Back
                                </Button>
                                <select>
                                    <option value=""></option>
                                </select>
                            </div>
                            )}
                        </DialogContent>
                        </Dialog>


 {/* //////////////////////==========================================Flooring section   */}

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
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (selectedRoom) {
                              setInternalBlindDialogState({ isOpen: true, roomName: selectedRoom as any });
                            } else {
                              toast({ variant: "destructive", title: "No Room Selected" });
                            }
                          }}
                          disabled={!selectedRoom}
                        >
                          Add Blind
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
                              options={["Wooden Flooring","Carpet flooring"].map(floorType => ({value: floorType,label:floorType}))}
                              value={field.value}
                              onSelect={(value) => {
                                field.onChange(value);
                              }}
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
                            {item.itemName && item.bcn
                              ? (item.subCategory || "").replace(item.bcn, item.itemName)
                              : item.itemName || item.subCategory}
                            {item.quantity && <span>{` (Qty: ${item.quantity})`}</span>}
                            {item.bcn && <span>{` | BCN: ${item.bcn}`}</span>}
                          </span>
                        ) : item.productSource === "flooring" ? (
                          <span>
                            Flooring → <strong>{item.flooringType}</strong> — Qty: {item.quantity}
                          </span>
                        ) : (
                          <span>
                            {item.collectionBrand} - Qty: {(item as any).quantity || "N/A"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button type="button" onClick={handleAddProductsToList}>
                Add Products to List
              </Button>
            </div>

            <Separator className="my-8" />
          </form>
        </CardContent>
      </Card>
      <Dialog
        open={scanOpen}
        onOpenChange={(open) => {
          setScanOpen(open);
          if (!open) {
            setScanInput("");
            setScanError(null);
            setScanLoading(false);
            lastDecodedRef.current = null;
            scanLockRef.current = false;
            scanCompletedRef.current = false;
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Product QR</DialogTitle>
            <DialogDescription>
              Scan a QR code that links to{" "}
              <code>https://modesign.in/product/detail/{"{id}"}</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div
              id={scannerContainerId}
              className="aspect-square rounded-md border bg-muted flex items-center justify-center text-sm text-muted-foreground"
            >
              {hasCameraPermission === false && <span>Camera access is required to scan.</span>}
              {hasCameraPermission === null && <span>Initializing camera...</span>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-scan-input">Paste link or product ID</Label>
              <Input
                id="product-scan-input"
                value={scanInput}
                onChange={(event) => setScanInput(event.target.value)}
                placeholder="https://modesign.in/product/detail/30415"
              />
            </div>

            {scanError && <p className="text-sm text-destructive">{scanError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setScanOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => handleScanPayload(scanInput)}
              disabled={scanLoading || !scanInput.trim()}
            >
              {scanLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {resolvedBlindDialogState.isOpen && resolvedBlindDialogState.roomName && (
      <AddBlindsDialog
        isOpen={resolvedBlindDialogState.isOpen}
        onClose={() => setInternalBlindDialogState({ isOpen: false, roomName: null })}
        roomName={resolvedBlindDialogState.roomName}
        onSave={handleBlindsAdded}
      />
    )}
    </FormProvider>
  );
}
