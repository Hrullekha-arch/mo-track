// components/deals/ProductFormSection.tsx
"use client";
import { useState } from "react";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { roomOptions } from "@/lib/constants";
import { getStockSubcategories } from "@/lib/stock-category-rules";
import { UseFormReturn } from "react-hook-form";
import { BCNOption } from "../../hooks/useBcnSearch";

type Props = {
  section: "fabric" | "wallpaper" | "flooring";
  form: UseFormReturn<any>;
  bcnOptions: BCNOption[];
  onBcnSearch: (q: string) => void;
  onBcnSelect: (v: string) => void;
  imsSearching: boolean;
  currentBcnimsQty: { qty: number; date: string | null } | null;
  fabricCategoryGroup?: string;
  setFabricCategoryGroup?: (v: string) => void;
  selectedFlooringType?: string;
  setSelectedFlooringType?: (v: string) => void;
  onStageItem: () => void;
  onBack: () => void;
};

export function ProductFormSection({
  section, form, bcnOptions, onBcnSearch, onBcnSelect,
  imsSearching, currentBcnimsQty,
  fabricCategoryGroup, setFabricCategoryGroup,
  selectedFlooringType, setSelectedFlooringType,
  onStageItem, onBack
}: Props) {
  const [wallpaperOptionsOpen, setWallpaperOptionsOpen] = useState(false);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        Add {section === "fabric" ? "Fabric" : section === "wallpaper" ? "Wallpaper" : "Flooring"}
      </h3>
      <div className="p-4 border rounded-lg space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField control={form.control} name="room" render={({ field }) => (
            <FormItem>
              <FormLabel>Room*</FormLabel>
              <Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="Select Room..." />
              <FormMessage />
            </FormItem>
          )} />
                    {section === "fabric" && (
            <FormField
              control={form.control}
              name="newProduct.fabricCategoryGroup"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fabric Category</FormLabel>
                  <Select
                    value={field.value || ""}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {getStockSubcategories("FABRIC").map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {section === "flooring" && (
            <FormField control={form.control} name="newProduct.Type" render={({ field }) => (
              <FormItem>
                <FormLabel>Flooring Type</FormLabel>
                <Combobox options={["Wooden Flooring", "Carpet flooring"].map(t => ({ value: t, label: t }))} value={field.value} onSelect={v => { field.onChange(v); setSelectedFlooringType?.(v); }} placeholder="Select Flooring Type." />
              </FormItem>
            )} />
          )}
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <FormField control={form.control} name="newProduct.collectionBrand" render={({ field }) => (
            <FormItem>
              <FormLabel>{section === "wallpaper" ? "Wallpaper Code*" : "BCN*"}</FormLabel>
              {section === "wallpaper" ? (
                <FormControl>
                  <div className="relative">
                    <Input
                      {...field}
                      placeholder="Wallpaper Code..."
                      autoComplete="off"
                      onChange={(event) => {
                        const value = event.target.value;
                        field.onChange(value);
                        onBcnSearch(value);
                        setWallpaperOptionsOpen(value.trim().length >= 2);
                      }}
                      onFocus={() => {
                        const value = String(field.value || "");
                        if (value.trim().length >= 2) {
                          onBcnSearch(value);
                          setWallpaperOptionsOpen(true);
                        }
                      }}
                      onBlur={() => {
                        window.setTimeout(() => setWallpaperOptionsOpen(false), 120);
                      }}
                    />
                    {wallpaperOptionsOpen && bcnOptions.length > 0 && (
                      <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-background p-1 shadow-lg">
                        {bcnOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className="flex w-full flex-col rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              onBcnSelect(option.value);
                              setWallpaperOptionsOpen(false);
                            }}
                          >
                            <span className="font-medium">{option.value}</span>
                            <span className="truncate text-xs text-muted-foreground">{option.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </FormControl>
              ) : (
                <FormControl>
                  <Combobox options={bcnOptions} value={field.value || ""} onSearch={onBcnSearch} onSelect={onBcnSelect} placeholder="Search by BCN..." />
                </FormControl>
              )}
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="newProduct.salesDescription" render={({ field }) => (
            <FormItem><FormLabel>Sales Description</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
          )} />

          <FormField control={form.control} name="newProduct.mrp" render={({ field }) => (
            <FormItem><FormLabel>MRP</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
          )} />

          <FormField control={form.control} name="newProduct.quantity" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center justify-between">
                <span>Quantity</span>
                {imsSearching ? (
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><span className="animate-spin">⏳</span> Fetching...</span>
                ) : currentBcnimsQty ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    currentBcnimsQty.qty === 0 ? "bg-red-100 text-red-700" : currentBcnimsQty.qty < 10 ? "bg-yellow-100 text-yellow-700" : "bg-emerald-100 text-emerald-700"
                  }`}>Stock: {currentBcnimsQty.qty} {currentBcnimsQty.date && `(${currentBcnimsQty.date})`}</span>
                ) : null}
              </FormLabel>
              <FormControl><Input type="number" {...field} /></FormControl>
            </FormItem>
          )} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormField control={form.control} name="newProduct.verticalRepeat" render={({ field }) => (
            <FormItem><FormLabel>Vertical Repeat</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
          )} />
          <FormField control={form.control} name="newProduct.horizontalRepeat" render={({ field }) => (
            <FormItem><FormLabel>Horizontal Repeat</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
          )} />
          <FormField control={form.control} name="newProduct.remarks" render={({ field }) => (
            <FormItem><FormLabel>Remark</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>
          )} />
        </div>

        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={onStageItem}>Add Item</Button>
          <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        </div>
      </div>
    </div>
  );
}
