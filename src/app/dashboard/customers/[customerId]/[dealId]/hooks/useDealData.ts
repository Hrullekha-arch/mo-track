"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Deal, Selection, DealProduct, Customer } from "@/lib/types";
import {
  getDealById,
  getSelectionsForDeal,
  getDealProducts,
} from "../actions";
import { mapDealProductsDocToUi } from "../utils/productMappers";
import { getCustomerById } from "../../../actions";

// Tab data requirements
// hooks/useDealData.ts

const TAB_DATA_MAP: Record<string, string[]> = {
  visits: [],
  measurement: [],
  "added-product": [],
  products: ["dealProducts"],                       // ✅ Fetch when this tab loads
  quotations: [],
  orders: [],
  receipt: [],
};

export function useDealData(customerId: string, dealId: string) {
  const { toast } = useToast();
  const fetchedRef = useRef<Set<string>>(new Set());
  const [coreLoading, setCoreLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);

  const [data, setData] = useState<{
    deal: Deal | null;           // ✅ Contains EVERYTHING for header
    customer: Customer | null;   // ✅ Contains EVERYTHING for header
    selections: Selection[];     // 🔄 Lazy loaded per tab
    products: DealProduct[];     // 🔄 Lazy loaded per tab
    receipts: any[];             // 🔄 Lazy loaded per tab
  }>({
    deal: null,
    customer: null,
    selections: [],
    products: [],
    receipts: [],
  });

  // ══════════════════════════════════════════════════════════
  // ONLY ONE QUERY ON PAGE LOAD! 🚀
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    let cancelled = false;
    
    (async () => {
      setCoreLoading(true);
      try {
        // ✅ Single Firestore read - deal doc contains:
        //    - customer info (name, phone, address, billing)
        //    - representative info (name, id)
        //    - visits[]
        //    - order
        //    - quotations[s[]]
        //    - status, title, dealAmount, etc.
        const [deal, customer] = await Promise.all([
          getDealById(customerId, dealId),
          getCustomerById(customerId),
        ]);
        
        if (cancelled) return;
        if (!customer) throw new Error("Customer not found");
        if (!deal) throw new Error("Deal not found");
        

        fetchedRef.current.add("deal");
        fetchedRef.current.add("customer");
        setData((prev) => ({ ...prev, deal, customer }));
        
      } catch (error: any) {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Error loading deal",
            description: error.message,
          });
        }
      } finally {
        if (!cancelled) setCoreLoading(false);
      }
    })();
    
    return () => { cancelled = true; };
  }, [customerId, dealId, toast]);

  // ══════════════════════════════════════════════════════════
  // Fetch tab-specific data on demand
  // ══════════════════════════════════════════════════════════
  const fetchTabData = useCallback(
    async (tab: string) => {
      const neededKeys = TAB_DATA_MAP[tab] || [];
      const toFetch = neededKeys.filter((k) => !fetchedRef.current.has(k));
      
      if (toFetch.length === 0) return;

      setTabLoading(true);
      try {
        const results = await Promise.all(
          toFetch.map(async (key) => {
            let result: any;
            switch (key) {
              case "selections":
                result = await getSelectionsForDeal(customerId, dealId);
                break;
              case "dealProducts":
                result = await getDealProducts(dealId);
                break;
              case "receipts": {
                const { getReceiptsForDeal } = await import("../actions");
                result = await getReceiptsForDeal(customerId, dealId);
                break;
              }
              default:
                result = null;
            }
            return [key, result] as const;
          })
        );

        setData((prev) => {
          const next = { ...prev };
          for (const [key, result] of results) {
            if (key === "dealProducts") {
              next.products = mapDealProductsDocToUi(result);
            } else if (key === "receipts") {
              next.receipts = result;
            } else if (key === "selections") {
              next.selections = result;
            }
          }
          return next;
        });

        toFetch.forEach((k) => fetchedRef.current.add(k));
      } catch (error) {
        console.error("Failed to fetch tab data:", error);
      } finally {
        setTabLoading(false);
      }
    },
    [customerId, dealId]
  );

  // ══════════════════════════════════════════════════════════
  // Quick refresh - just refetch the deal document
  // ══════════════════════════════════════════════════════════
  const refreshDeal = useCallback(async () => {
    try {
      const deal = await getDealById(customerId, dealId);
      setData((prev) => ({ ...prev, deal }));
    } catch (error) {
      console.error("Failed to refresh deal:", error);
      toast({
        variant: "destructive",
        title: "Refresh failed",
        description: "Could not reload deal data",
      });
    }
  }, [customerId, dealId, toast]);

  // ══════════════════════════════════════════════════════════
  // Full refresh - refetch everything (rare, only after major changes)
  // ══════════════════════════════════════════════════════════
  const refreshAll = useCallback(async () => {
    fetchedRef.current.clear();
    setTabLoading(true);
    
    try {
      const deal = await getDealById(customerId, dealId);
      
      setData((prev) => ({
        deal,
        customer: prev.customer,
        selections: [],
        products: [],
        receipts: [],
      }));
      
      fetchedRef.current.add("deal");
    } catch (error) {
      console.error("Refresh failed:", error);
    } finally {
      setTabLoading(false);
    }
  }, [customerId, dealId]);

  // ══════════════════════════════════════════════════════════
  // Invalidate specific cached data (for mutations)
  // ══════════════════════════════════════════════════════════
  const invalidateCache = useCallback((keys: string[]) => {
    keys.forEach((key) => fetchedRef.current.delete(key));
  }, []);

  return {
    data,
    coreLoading,
    tabLoading,
    fetchTabData,
    refreshDeal,      // ✅ Fast: just refetch deal doc
    refreshAll,       // 🔄 Nuclear: clear everything
    invalidateCache,  // 🎯 Surgical: invalidate specific keys
  };
}
