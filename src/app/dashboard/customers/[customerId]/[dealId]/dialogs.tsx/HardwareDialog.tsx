"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
import { toast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { roomOptions } from "@/lib/constants";
import { getStockSubcategories } from "@/lib/stock-category-rules";
import { useDebouncedCallback } from "use-debounce";
import { PlusCircle, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BlindDetail = {
  id: string;
  blindType?: "Roman Blind" | "Roller Blind" | "Normal Blind";
  shadeNo?: string;
  width?: string;
  widthUnit?: "inch" | "mm";
  height?: string;
  heightUnit?: "inch" | "mm";
  operating?: "Manual" | "motorized";
  usesType?: "Direct Fix" | "Head Rail" | "Plain Cassette" | "Decorative Cassette" | "One Touch Up" | "Moto Down";
  motorType?: "Simotic or Ebony (RTS | WT)" | "Wire Free (RTS)";
  remoteType?: string;
  control?: "LHT" | "RHT";
  bracket?: "Wall" | "Celling";
  bottomChannel?: "Square" | "Rounded" | "Fabric Covered";
  bottomRailColor?: string;
  otherBottomRailColor?: string;
  locationOfBlind?: string;
  noOfBlind?: string;
};

const createBlindDetail = (): BlindDetail => ({
  id: `blind-detail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  widthUnit: "inch",
  heightUnit: "inch",
});

const normalizeText = (value: unknown) => String(value ?? "").toLowerCase();

const matchesStockSelection = (stock: any, category?: string, subCategory?: string) => {
  if (!stock || !category) return true;
  const categoryKey = normalizeText(category);
  const subKey = normalizeText(subCategory || "");
  const fields = [
    normalizeText(stock.category),
    normalizeText(stock.type),
    normalizeText(stock.categoryGroup),
    normalizeText(stock.name || stock.itemName),
  ];

  const matches = (token: string) =>
    token && fields.some((value) => value === token || value.includes(token));

  return matches(categoryKey) || matches(subKey);
};

const looksLikeBlindStock = (stock: any, category?: string | null, subCategory?: string | null) => {
  const candidates = [
    stock?.category,
    stock?.type,
    stock?.categoryGroup,
    stock?.itemName,
    stock?.name,
    stock?.supplierCollectionName,
    category,
    subCategory,
  ];

  return candidates.some((value) => normalizeText(value).includes("blind"));
};

const blindDetailHasContent = (detail: BlindDetail) => {
  const keys: Array<keyof BlindDetail> = [
    "blindType",
    "shadeNo",
    "width",
    "height",
    "operating",
    "usesType",
    "motorType",
    "remoteType",
    "control",
    "bracket",
    "bottomChannel",
    "bottomRailColor",
    "otherBottomRailColor",
    "locationOfBlind",
    "noOfBlind",
  ];
  return keys.some((key) => Boolean(String(detail[key] ?? "").trim()));
};

function BlindDetailsDialog({
  open,
  onOpenChange,
  onSave,
  itemLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (details: BlindDetail[]) => void;
  itemLabel?: string;
}) {
  const [localBlinds, setLocalBlinds] = useState<BlindDetail[]>([createBlindDetail()]);

  const updateLocalBlind = (index: number, field: keyof BlindDetail, value: string) => {
    setLocalBlinds((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = () => {
    const normalized = localBlinds
      .filter((entry) => blindDetailHasContent(entry))
      .map((entry) => ({
        ...entry,
        widthUnit: entry.widthUnit || "inch",
        heightUnit: entry.heightUnit || "inch",
      }));

    if (normalized.length === 0) {
      toast({
        variant: "destructive",
        title: "Blind Details Required",
        description: "Add at least one blind detail before saving.",
      });
      return;
    }

    onSave(normalized);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add Blind Details{itemLabel ? ` for ${itemLabel}` : ""}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[70vh]">
          <div className="space-y-4 py-4 pr-4">
            {localBlinds.map((blind, index) => {
              const isMotorized = blind.operating === "motorized";
              const showOtherColor = blind.bottomRailColor === "Other";
              return (
                <Card key={blind.id} className="relative p-4">
                  <Button
                    variant="destructive"
                    size="icon"
                    type="button"
                    className="absolute right-2 top-2 h-7 w-7"
                    onClick={() => setLocalBlinds((prev) => prev.filter((_, i) => i !== index))}
                    disabled={localBlinds.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <p className="mb-3 font-semibold">Blind #{index + 1}</p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <FormItem>
                      <FormLabel>Blind Type</FormLabel>
                      <Select
                        onValueChange={(val) => updateLocalBlind(index, "blindType", val)}
                        value={blind.blindType}
                      >
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
                      <Input
                        value={blind.shadeNo ?? ""}
                        onChange={(event) => updateLocalBlind(index, "shadeNo", event.target.value)}
                      />
                    </FormItem>
                    <FormItem>
                      <FormLabel>Width</FormLabel>
                      <div className="flex items-center gap-1">
                        <Input
                          value={blind.width ?? ""}
                          onChange={(event) => updateLocalBlind(index, "width", event.target.value)}
                        />
                        <Select
                          onValueChange={(val) => updateLocalBlind(index, "widthUnit", val)}
                          value={blind.widthUnit}
                        >
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
                        <Input
                          value={blind.height ?? ""}
                          onChange={(event) => updateLocalBlind(index, "height", event.target.value)}
                        />
                        <Select
                          onValueChange={(val) => updateLocalBlind(index, "heightUnit", val)}
                          value={blind.heightUnit}
                        >
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
                      <Select
                        onValueChange={(val) => updateLocalBlind(index, "operating", val)}
                        value={blind.operating}
                      >
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
                      <Select
                        onValueChange={(val) => updateLocalBlind(index, "usesType", val)}
                        value={blind.usesType}
                      >
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
                        <Select
                          onValueChange={(val) => updateLocalBlind(index, "motorType", val)}
                          value={blind.motorType}
                        >
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
                          value={blind.remoteType ?? ""}
                          onChange={(event) => updateLocalBlind(index, "remoteType", event.target.value)}
                        />
                      </FormItem>
                    )}
                    <FormItem>
                      <FormLabel>Control</FormLabel>
                      <Select
                        onValueChange={(val) => updateLocalBlind(index, "control", val)}
                        value={blind.control}
                      >
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
                      <Select
                        onValueChange={(val) => updateLocalBlind(index, "bracket", val)}
                        value={blind.bracket}
                      >
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
                          value={blind.otherBottomRailColor ?? ""}
                          onChange={(event) => updateLocalBlind(index, "otherBottomRailColor", event.target.value)}
                        />
                      </FormItem>
                    )}
                    <FormItem>
                      <FormLabel>Location of Blind</FormLabel>
                      <Input
                        value={blind.locationOfBlind ?? ""}
                        onChange={(event) => updateLocalBlind(index, "locationOfBlind", event.target.value)}
                      />
                    </FormItem>
                    <FormItem>
                      <FormLabel>No Of Blind (Pcs)</FormLabel>
                      <Input
                        type="number"
                        value={blind.noOfBlind ?? ""}
                        onChange={(event) => updateLocalBlind(index, "noOfBlind", event.target.value)}
                      />
                    </FormItem>
                  </div>
                </Card>
              );
            })}
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocalBlinds((prev) => [...prev, createBlindDetail()])}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Another Blind
            </Button>
          </div>
        </ScrollArea>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save Blind Details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type HardwareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveHardware: (payload: Record<string, any>) => void;
  form: any;
};

export default function HardwareDialog({ open, onOpenChange, onSaveHardware, form }: HardwareDialogProps) {
  const mainCategories = [
    "HARDWARE",
    "HARDWARE_ACCESSORIES",
    "LINEN",
    "FOAM & LOOSE MATERIAL",
  ];

  const [bcnOptions, setBcnOptions] = useState<ComboboxOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [dialogTitle, setDialogTitle] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItemValue, setSelectedItemValue] = useState<string | null>(null);
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  const [rate, setRate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [selectedStockMeta, setSelectedStockMeta] = useState<any | null>(null);
  const [blindDialogOpen, setBlindDialogOpen] = useState(false);
  const [blindDetailsDraft, setBlindDetailsDraft] = useState<BlindDetail[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const resetItemFields = () => {
    setRate("");
    setQuantity("");
    setSelectedItemValue("");
    setSelectedItemName(null);
    setImage(null);
    setSelectedStockMeta(null);
    setBlindDetailsDraft([]);
  };

  const resetFlowState = () => {
    setSelectedCategory(null);
    setSelectedSubCategory(null);
    setDialogTitle("");
    resetItemFields();
    setDetailsOpen(false);
  };

  const handleBcnSearch = useCallback(async (rawQuery: string) => {
    const query = rawQuery?.trim().toLowerCase();
    if (!query || query.length < 2) return;

    setIsSearching(true);

    try {
      const results = await searchStockByBcn(query);
      const filtered = results.filter((stock) =>
        matchesStockSelection(
          stock,
          selectedCategory || undefined,
          selectedSubCategory || undefined
        )
      );

      const options = filtered.map((stock) => ({
        value: stock.id || stock.bcn,
        label: `${stock.bcn} - ${stock.name || stock.itemName || ""}`,
        stockItem: stock,
      }));

      setBcnOptions(options as any);
    } catch (error) {
      toast({ variant: "destructive", title: "Search failed" });
    } finally {
      setIsSearching(false);
    }
  }, [selectedCategory, selectedSubCategory]);

  const debouncedSearch = useDebouncedCallback(handleBcnSearch, 300);

  const handleBcnSelect = (value: string) => {
    const selectedOption = bcnOptions.find((opt) => opt.value === value) as any;
    if (selectedOption) {
      const stockItem = selectedOption.stockItem;
      setSelectedItemName(stockItem?.itemName || null);
      const resolvedRate =
        stockItem?.rrpWithGstRs != null
          ? String(stockItem.rrpWithGstRs)
          : stockItem?.mrp != null
          ? String(stockItem.mrp)
          : "";
      const isBlindStock = looksLikeBlindStock(stockItem, selectedCategory, selectedSubCategory);
      setRate(resolvedRate);
      if (isBlindStock) {
        setBlindDialogOpen(true);
      } else {
        setBlindDetailsDraft([]);
      }
      setSelectedStockMeta({
        unit: stockItem?.unit || "",
        gstPercent: stockItem?.gstPercent ?? "",
        hsnOrSac: stockItem?.hsnOrSac || "",
        supplierCollectionName: stockItem?.supplierCollectionName || "",
        supplierCollectionCode: stockItem?.supplierCollectionCode || "",
        supplierCompanyName: stockItem?.supplierCompanyName || "",
        category: stockItem?.category || "",
        categoryGroup: stockItem?.categoryGroup || "",
        itemName: stockItem?.itemName || stockItem?.name || "",
        productId: stockItem?.productId || "",
        isBlindStock,
      });
    }
  };

  const finalizeHardwareSave = useCallback(
    (payload: Record<string, any>) => {
      if (typeof onSaveHardware !== "function") {
        console.error("onSaveHardware not passed");
        return;
      }

      onSaveHardware(payload);
      resetFlowState();
      onOpenChange(false);
    },
    [onSaveHardware, onOpenChange]
  );

  const handleFinalSave = () => {
    const values = form.getValues();
    const room = values.room;
    if (!room) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please select a room.",
      });
      return;
    }
    const supplierDescription = [
      selectedStockMeta?.supplierCollectionName,
      selectedStockMeta?.supplierCollectionCode,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    const payload = {
      productType: "Hardware",
      productCategory: selectedCategory || "",
      subCategory: selectedSubCategory || selectedItemName || selectedCategory || "",
      bcn: selectedItemValue || null,
      itemName: selectedItemName || null,
      salesDescription:
        supplierDescription ||
        selectedStockMeta?.itemName ||
        selectedItemName ||
        selectedCategory,
      rate: rate || "",
      quantity: quantity || "",
      room,
      image,
      timestamp: Date.now(),
      unit: selectedStockMeta?.unit || "",
      gstPercent: selectedStockMeta?.gstPercent ?? "",
      hsnOrSac: selectedStockMeta?.hsnOrSac || "",
      supplierCollectionName: selectedStockMeta?.supplierCollectionName || "",
      supplierCollectionCode: selectedStockMeta?.supplierCollectionCode || "",
      supplierCompanyName: selectedStockMeta?.supplierCompanyName || "",
      category: selectedStockMeta?.category || "",
      categoryGroup: selectedStockMeta?.categoryGroup || "",
      productId: selectedStockMeta?.productId || "",
    };

    const needsBlindDetails =
      Boolean(selectedStockMeta?.isBlindStock) ||
      normalizeText(selectedSubCategory).includes("blind") ||
      normalizeText(selectedItemName).includes("blind");

    if (needsBlindDetails) {
      if (blindDetailsDraft.length === 0) {
        toast({
          variant: "destructive",
          title: "Blind Details Required",
          description: "Please add blind details for this blind BCN.",
        });
        setBlindDialogOpen(true);
        return;
      }

      finalizeHardwareSave({
        ...payload,
        blindDetails: blindDetailsDraft,
        isBlind: true,
      });
      return;
    }

    finalizeHardwareSave(payload);
  };

  const handleBlindDetailsSave = (blindDetails: BlindDetail[]) => {
    setBlindDetailsDraft(blindDetails);
    setBlindDialogOpen(false);
  };

  const handleCategoryClick = (category: string) => {
    const subCategories = getStockSubcategories(category);
    setSelectedCategory(category);
    setSelectedSubCategory(subCategories[0] || null);
    setDialogTitle(`${category} Details`);
    setDetailsOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      {/* MAIN CATEGORY SELECTION DIALOG */}
      <Dialog
        open={open && !detailsOpen}
        onOpenChange={(next) => {
          if (!next) {
            onOpenChange(false);
            resetFlowState();
          }
        }}
      >
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Select Hardware Category</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {mainCategories.map((cat) => (
              <Button
                key={cat}
                variant="outline"
                type="button"
                onClick={() => handleCategoryClick(cat)}
              >
                {cat}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* DETAILS DIALOG */}
      <Dialog
        open={detailsOpen}
        onOpenChange={(next) => {
          if (!next) resetFlowState();
          setDetailsOpen(next);
        }}
      >
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            {selectedCategory && getStockSubcategories(selectedCategory).length > 0 && (
              <div className="space-y-2">
                <Label>Sub Category</Label>
                <div className="flex flex-wrap gap-2">
                  {getStockSubcategories(selectedCategory).map((sub) => (
                    <Button
                      key={sub}
                      type="button"
                      variant={selectedSubCategory === sub ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedSubCategory(sub)}
                    >
                      {sub}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <FormField
              control={form.control}
              name="room"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Room*</FormLabel>
                  <Combobox
                    options={roomOptions}
                    value={field.value}
                    onSelect={field.onChange}
                    placeholder="Select Room..."
                    popoverModal
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </DialogHeader>

          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Category: {selectedCategory || "Select"}</span>
            </div>
          </div>

          <div className="grid gap-4 py-4">
            <div>
              <Label>Search BCN</Label>
              <Combobox
                options={bcnOptions}
                value={selectedItemValue ?? undefined}
                onSelect={(value) => {
                  setSelectedItemValue(value);
                  handleBcnSelect(value);
                }}
                onSearch={debouncedSearch}
                placeholder="Search item..."
                searchPlaceholder="Type BCN or item name..."
                popoverModal
              />
            </div>

            <div>
              <Label>Rate (MRP)</Label>
              <Input
                placeholder="Enter rate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>

            <div>
              <Label>Quantity</Label>
              <Input
                placeholder="Enter quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            <div>
              <Label>Upload Image (Optional)</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
              />
              {image && (
                <img
                  src={image}
                  className="mt-2 h-20 w-20 object-cover rounded-md border"
                  alt="Preview"
                />
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleFinalSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BlindDetailsDialog
        open={blindDialogOpen}
        onOpenChange={setBlindDialogOpen}
        onSave={handleBlindDetailsSave}
        itemLabel={selectedItemName || selectedItemValue || undefined}
      />
    </>
  );
}