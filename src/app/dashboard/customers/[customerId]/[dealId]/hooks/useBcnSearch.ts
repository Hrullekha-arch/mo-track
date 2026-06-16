// hooks/useBcnSearch.ts
import { useState, useCallback, useRef, useEffect } from "react";
import { UseFormReturn } from "react-hook-form";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
import { useToast } from "@/hooks/use-toast";

export type BCNOption = {
  value: string;
  label: string;
  stockItem: Record<string, unknown>;
};

export function useBcnSearch(form: UseFormReturn<any>) {
  const { toast } = useToast();
  const [bcnOptions, setBcnOptions] = useState<BCNOption[]>([]);
  const [currentBcnimsQty, setCurrentBcnimsQty] = useState<{ qty: number; date: string | null } | null>(null);
  const [imsSearching, setImsSearching] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleBcnSearch = useCallback(async (query: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (query.length < 2) {
      setBcnOptions([]);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      try {
        const results = await searchStockByBcn(query);
        const options: BCNOption[] = results.map((stock: any) => ({
          value: stock.bcn || stock.id,
          label: `${stock.bcn || stock.id} - ${stock.itemName || stock.name || ""}`,
          stockItem: stock,
        }));
        setBcnOptions(options);
      } catch (error) {
        console.error("BCN Search Error:", error);
        toast({ variant: "destructive", title: "Search failed" });
      }
    }, 300); // 300ms debounce
  }, [toast]);

  const handleBcnSelect = useCallback((value: string) => {
    const selected = bcnOptions.find(opt => opt.value === value);
    if (!selected?.stockItem || !form) return;

    const stock = selected.stockItem;

    console.log("Selected stock item for BCN:", stock);
    
    form.setValue("newProduct.fabricCategoryGroup", stock.categoryGroup || "");
    form.setValue("newProduct.collectionBrand", stock.bcn || stock.id || "");
    form.setValue("newProduct.salesDescription", stock.itemName || stock.name || "");
    form.setValue("newProduct.mrp", stock.rrpWithGstRs || stock.mrp ? String(stock.rrpWithGstRs || stock.mrp) : "");
    form.setValue("newProduct.verticalRepeat", stock.verticalRepeatCms || "");
    form.setValue("newProduct.horizontalRepeat", stock.horizontalRepeatCms || "");
    fetchIMSQty(stock.bcn || stock.id);
  }, [bcnOptions, form]);

  const fetchIMSQty = useCallback(async (bcn: string) => {
    const normalizedBcn = String(bcn || "").trim();
    if (!normalizedBcn) return;
    setImsSearching(true);
    try {
      const query = new URLSearchParams({ bcn: normalizedBcn });
      const response = await fetch(`/api/ims-sheet?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) { setCurrentBcnimsQty(null); return; }
      const payload = await response.json();
      const imsQty = typeof payload?.qty === "number" && Number.isFinite(payload.qty) ? payload.qty : null;
      setCurrentBcnimsQty(imsQty !== null ? { qty: imsQty, date: payload.date ?? null } : null);
    } catch (error) {
      console.error("IMS Fetch Error:", error);
      setCurrentBcnimsQty(null);
    } finally {
      setImsSearching(false);
    }
  }, []);

  useEffect(() => {
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, []);

  return { bcnOptions, handleBcnSearch, handleBcnSelect, currentBcnimsQty, imsSearching };
}
