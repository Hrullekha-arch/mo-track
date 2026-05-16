"use client";
import React, { useState, useMemo, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { DealProduct, Deal } from "@/lib/types";
import { getProductKey } from "../utils/productMappers";
import { createSelectionAction, updateDealProducts } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";

export function useProducts(
  customerId: string,
  dealId: string,
  deal: Deal | null,
  initialProducts: DealProduct[],
  user: any,
  onRefresh: () => Promise<void>
) {
  const { toast } = useToast();
  const [products, setProducts] = useState<DealProduct[]>(initialProducts);
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [activityLoading, setActivityLoading] = useState(false);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [blindDialogState, setBlindDialogState] = useState<{
    isOpen: boolean;
    roomName: string | null;
  }>({ isOpen: false, roomName: null });

  // Sync with initial data when it changes
  React.useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  const groupedProducts = useMemo(() => {
    return (products || []).reduce((acc, product, index) => {
      const room = (product.room || "Unassigned").trim();
      if (!acc[room]) acc[room] = [];
      acc[room].push({ ...product, originalIndex: index });
      return acc;
    }, {} as Record<string, (DealProduct & { originalIndex?: number })[]>);
  }, [products]);

  const handleProductsUpdated = useCallback(
    async (updatedProducts: DealProduct[]) => {
      if (!deal) return;
      setProducts(updatedProducts); // optimistic UI
      setActivityLoading(true);
      const result = await updateDealProducts(customerId, dealId, updatedProducts, {
        id: user?.id,
        name: user?.name,
      });
      if (result.success) {
        toast({ title: "Activity Updated", description: "Product list has been saved." });
        onRefresh();
      } else {
        toast({ variant: "destructive", title: "Update Failed", description: result.message });
      }
      setActivityLoading(false);
    },
    [deal, customerId, dealId, user, onRefresh, toast]
  );

  const handleUpdateActivity = useCallback(async () => {
    if (!deal) return;
    await handleProductsUpdated(products);
  }, [deal, products, handleProductsUpdated]);

  const handleCreateSelection = useCallback(async () => {
    if (!user) return toast({ variant: "destructive", title: "Authentication error" });
    const selectedProductIds = Object.keys(selectedRows).filter((id) => selectedRows[id]);
    if (selectedProductIds.length === 0) {
      toast({
        variant: "destructive",
        title: "No Products Selected",
        description: "Please select products to create a selection.",
      });
      return;
    }
    const selectedProducts = products.filter(
      (p) => p.id && selectedProductIds.includes(p.id)
    );
    setSelectionLoading(true);
    try {
      const result = await createSelectionAction(customerId, dealId, selectedProducts, user.name);
      if (result.success) {
        toast({ title: "Selection Created!", description: `Selection #${result.selection?.id} has been saved.` });
        setSelectedRows({});
        onRefresh();
      } else {
        toast({ variant: "destructive", title: "Failed", description: result.message });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
    } finally {
      setSelectionLoading(false);
    }
  }, [user, selectedRows, products, customerId, dealId, onRefresh, toast]);

  const handleQuotationClick = useCallback(() => {
    const selectedProductIds = Object.keys(selectedRows).filter((id) => selectedRows[id]);
    const itemsToQuote = products.filter((p) =>
      selectedProductIds.includes(getProductKey(p))
    );
    if (itemsToQuote.length === 0) {
      toast({
        variant: "destructive",
        title: "No Products Selected",
        description: "Please select products to create a quotation.",
      });
      return { items: [], vas: [] };
    }
    const regularItems = itemsToQuote.filter((item) => item.productType !== "VAS");
    const vasItems = itemsToQuote.filter((item) => item.productType === "VAS");
    const initialVas = vasItems.map((item) => ({
      vasName: item.subCategory || item.collectionBrand,
      rate: item.rate?.toString() || "0",
      quantity: item.quantity?.toString() || "1",
      room: item.room || "",
    }));
    return { items: regularItems, vas: initialVas };
  }, [selectedRows, products, toast]);

  const handleDeleteItem = useCallback(
    (index: number) => {
      const next = [...products];
      next.splice(index, 1);
      handleProductsUpdated(next);
    },
    [products, handleProductsUpdated]
  );

  return {
    products,
    setProducts,
    groupedProducts,
    selectedRows,
    setSelectedRows,
    activityLoading,
    selectionLoading,
    blindDialogState,
    setBlindDialogState,
    handleProductsUpdated,
    handleUpdateActivity,
    handleCreateSelection,
    handleQuotationClick,
    handleDeleteItem,
    getProductKey,
  };
}