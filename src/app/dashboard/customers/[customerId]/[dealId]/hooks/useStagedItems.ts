// hooks/useStagedItems.ts
import { useState, useCallback, useEffect } from "react";
import { UseFormReturn } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { DealProduct } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { updateDealProducts } from "../actions";

export interface StagedItem {
  id: string;
  productType: string;
  collectionBrand?: string;
  salesDescription?: string;
  mrp?: string;
  quantity?: string;
  remarks?: string;
  verticalRepeat?: string;
  horizontalRepeat?: string;
  flooringType?: string | null;
  productSource?: string;
  productCategory?: string;
  subCategory?: string;
  bcn?: string;
  isBlind?: boolean;
  blindDetails?: any[];
  rate?: string;
  Type?: string;
}

export function useStagedItems(form: UseFormReturn<any>, activeSection: string, fabricCategory: string, flooringType: string) {
  const { toast } = useToast();
  const user = useAuth();
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Load hardware from localStorage on mount
  useEffect(() => {
    const raw = localStorage.getItem("hardwarePayload");
    if (!raw) return;
    try {
      const hardwareItems = JSON.parse(raw);
      if (!Array.isArray(hardwareItems)) return;
      const normalized = hardwareItems.map((hw: any) => ({
        ...hw,
        id: `${hw.category || hw.items?.itemCategory || "Hardware"}-${hw.type || hw.items?.itemLabel || "Default"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        collectionBrand: hw.type || hw.items?.itemLabel || "Hardware",
        quantity: hw.quantity || hw.items?.itemQty || "1",
        rate: hw.rate || hw.items?.itemRate || "",
        productSource: "Hardware",
      }));
      setStagedItems(prev => [...prev, ...normalized]);
      localStorage.removeItem("hardwarePayload");
    } catch {
      console.error("Invalid hardwarePayload JSON");
    }
  }, []);

  const handleStageItem = useCallback(() => {
    const room = form.getValues("room");
    if (!room) {
      toast({ variant: "destructive", title: "Missing Room", description: "Please select a room first." });
      return;
    }

    const sourceTag = activeSection === "fabric" ? "fabric" : activeSection === "wallpaper" ? "wallpaper" : activeSection === "flooring" ? "flooring" : "other";
    const newProduct = form.getValues("newProduct");

    setStagedItems(prev => [...prev, {
      ...newProduct,
      id: `${newProduct.collectionBrand || "item"}-${Date.now()}`,
      productSource: sourceTag,
      flooringType: flooringType || newProduct.Type || null,
      ...(activeSection === "fabric" ? { productCategory: "FABRIC", subCategory: fabricCategory } : {}),
    }]);

    form.reset({
      ...form.getValues(),
      newProduct: { Type: "", collectionBrand: "", salesDescription: "", mrp: "", quantity: "", remarks: "", verticalRepeat: "", horizontalRepeat: "" }
    });
  }, [form, activeSection, fabricCategory, flooringType, toast]);

  const handleAddProductsToList = useCallback(async (customerId: string, dealId: string, existingProducts: DealProduct[], onSaved?: () => void) => {
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
      let collectionBrand = isHardware ? (item.bcn || item.subCategory || item.productCategory) : isVAS ? (item.productCategory || "VAS") : item.collectionBrand;
      let salesDescription = isHardware ? (item.subCategory ? `${item.productCategory} → ${item.subCategory}` : item.productCategory) : isVAS ? item.subCategory : item.salesDescription;
      let itemCategory = item.categoryGroup ||"-";
      return {
        ...(item as any),
        id: `${collectionBrand || `item-${index}`}-${timestamp}-${index}`,
        collectionBrand,
        salesDescription,
        itemCategory,
        productType: item.productType || 'fabric',
        quantity: item.quantity ?? "0",
        room,
        isBlind: Boolean(item.isBlind),
      };
    });

    setLoading(true);
    try {
      const updatedProducts = [...existingProducts, ...newProductsForForm];
      const result = await updateDealProducts(customerId, dealId, updatedProducts, {
        id: (user as any)?.id,
        name: (user as any)?.name || (user as any)?.email || "System",
      });

      if (result.success) {
        toast({ title: "Products Added", description: `${newProductsForForm.length} item(s) added to the list.` });
        setStagedItems([]);
        onSaved?.();
      } else {
        toast({ variant: "destructive", title: "Failed to save", description: result.message });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to save products" });
    } finally {
      setLoading(false);
    }
  }, [form, stagedItems, toast, user]);

  return { stagedItems, loading, handleStageItem, handleAddProductsToList, setStagedItems };
}