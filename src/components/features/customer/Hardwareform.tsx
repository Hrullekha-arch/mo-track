"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
import { Toast } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { roomOptions } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getStockSubcategories } from "@/lib/stock-category-rules";
import { useDebounce, useDebouncedCallback } from "use-debounce";

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

export default function HardwareTopLevel({ onSaveHardware, form }) {
  const { control } = form;

  const mainCategories = [
    "HARDWARE",
    "HARDWARE_ACCESSORIES",
    "LINEN",
    "FOAM & LOOSE MATERIAL",
  ];

  const [open, setOpen] = useState(false);
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

  const resetItemFields = () => {
    setRate("");
    setQuantity("");
    setSelectedItemValue("");
    setSelectedItemName(null);
    setImage(null);
    setSelectedStockMeta(null);
  };

  const resetFlowState = () => {
    setSelectedCategory(null);
    setSelectedSubCategory(null);
    setDialogTitle("");
    resetItemFields();
  };




const handleBcnSearch = useCallback(async (rawQuery: string) => {
  const query = rawQuery?.trim().toLowerCase();
  if (!query || query.length < 2) return;

  setIsSearching(true);

  try {
    const results = await searchStockByBcn(query);

    console.log("resultlabel",results)
    const filtered = results.filter((stock) =>
      matchesStockSelection(
        stock,
        selectedCategory || undefined,
        selectedSubCategory || undefined
      )
    );

    console.log("filterlabel",filtered)

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
}, [selectedCategory, selectedSubCategory, toast]);

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
      setRate(resolvedRate);
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
      });
    }
  };

  const handleFinalSave = () => {
    const values = form.getValues();

    
    const room = values.room;
    if (!room){
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

    if (typeof onSaveHardware !== "function") {
      console.error("❌ onSaveHardware not passed to HardwareTopLevel!");
      return;
    }

    onSaveHardware(payload);
    resetItemFields();
    setOpen(false);
  };

  const handleCategoryClick = (category: string) => {
    const subCategories = getStockSubcategories(category);
    setSelectedCategory(category);
    setSelectedSubCategory(subCategories[0] || null);
    setDialogTitle(`${category} Details`);
    setOpen(true);
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
      {/* MAIN CATEGORY BUTTONS */}
      <div className="rounded-xl grid grid-cols-2 gap-3">
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

      {/* DIALOG */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetFlowState();
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

          {/* ITEM DETAILS FORM */}
          <div className="grid gap-4 py-4">
            <div>
              <Label>Search BCN</Label>
              <Combobox
                options={bcnOptions}
                value={selectedItemValue}
                onSelect={(value) => {
                  setSelectedItemValue(value);
                  handleBcnSelect(value);
                }}
                onSearch={debouncedSearch}
                placeholder="Search item..."
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
    </>
  );
}
