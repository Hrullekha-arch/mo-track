"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Customer, Deal, DealProduct, Quotation, Selection, VasDetail } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Eye, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { 
  createSelectionAction, 
  deleteDealProduct, 
  getDealById, 
  getDealProducts, 
  getSelectionsForDeal,
  updateDealProducts,
} from "../../actions";
import { mapDealProductsDocToUi } from "../../utils/productMappers";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { CreateQuotationDialog } from "@/components/features/order-management/CreateQuotationDialog";
import { getCustomerById } from "@/app/dashboard/customers/actions";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface AddedProductTabProps {
  customerId: string;
  dealId: string;
  onRefresh?: () => void;
}

interface GroupedProduct extends DealProduct {
  originalIndex: number;
}

type ProductGroup = Record<string, GroupedProduct[]>;

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS (Extracted for Reusability)
// ═══════════════════════════════════════════════════════════

const getProductKey = (p: DealProduct, index: number): string => 
  p.id || p.collectionBrand || `product-${index}`;

const getProductLabel = (product: DealProduct): string => {
  if (product.isBlind) return "Blind";
  if (product.productSource === "wallpaper") return "Wallpaper";
  if (product.productSource === "flooring") return "Flooring";
  return "Fabric";
};

const isHardwareProduct = (product: DealProduct): boolean =>
  product.productSource === "Hardware" || product.productType === "Hardware";

const isVASProduct = (product: DealProduct): boolean =>
  product.productType === "VAS";

const getHardwareLabel = (product: DealProduct): string => {
  if (product.itemName && product.bcn) {
    return String(product.subCategory || "").replace(product.bcn, product.itemName);
  }
  return product.itemName || product.subCategory || product.productCategory || "";
};

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export default function AddedProductTab({ 
  customerId, 
  dealId,
  onRefresh 
}: AddedProductTabProps) {
  const { user } = useAuth();

  // ─── State ───────────────────────────────────────────────
  const [products, setProducts] = useState<DealProduct[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  // Loading states
  const [loading, setLoading] = useState(true);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  // Quotation dialog state
  const [quotationDialog, setQuotationDialog] = useState({
    isOpen: false,
    items: [] as DealProduct[],
    vas: [] as VasDetail[],
    deal: null as Deal | null,
    customer: null as Customer | null,
  });

  // ─── Memoized Values ─────────────────────────────────────
  
  const groupedProducts = useMemo<ProductGroup>(() => {
    return products.reduce((acc, product, index) => {
      const room = (product.room || "Unassigned").trim();
      if (!acc[room]) acc[room] = [];
      acc[room].push({ ...product, originalIndex: index });
      return acc;
    }, {} as ProductGroup);
  }, [products]);

  const selectedProductsCount = useMemo(
    () => Object.values(selectedRows).filter(Boolean).length,
    [selectedRows]
  );

  // ─── Data Fetching ───────────────────────────────────────
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [productsDoc, selectionsData] = await Promise.all([
        getDealProducts(dealId),
        getSelectionsForDeal(customerId, dealId),
      ]);
      
      setProducts(productsDoc ? mapDealProductsDocToUi(productsDoc) : []);
      setSelections(selectionsData ?? []);
    } catch (err) {
      console.error("AddedProductTab fetch error:", err);
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [customerId, dealId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Selection Handlers ──────────────────────────────────
  
  const toggleRoomSelection = useCallback((productsInRoom: GroupedProduct[], checked: boolean) => {
    setSelectedRows((prev) => {
      const updated = { ...prev };
      productsInRoom.forEach((p) => {
        const key = getProductKey(p, p.originalIndex);
        if (checked) {
          updated[key] = true;
        } else {
          delete updated[key];
        }
      });
      return updated;
    });
  }, []);

  const toggleRow = useCallback((productKey: string, checked: boolean) => {
    setSelectedRows((prev) => {
      const updated = { ...prev };
      if (checked) {
        updated[productKey] = true;
      } else {
        delete updated[productKey];
      }
      return updated;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedRows({});
  }, []);

  // ─── Product Handlers ────────────────────────────────────
  

  const handleDeleteItem = useCallback(async (productId: string) => {
    setDeleteLoading(productId);
    try {
      // Optimistic update
      setProducts((prev) => prev.filter((p) => getProductKey(p, 0) !== productId));
      
      const result = await deleteDealProduct({ dealId, productId });
      
      if (result.success) {
        toast.success("Product deleted");
        onRefresh?.();
      } else {
        // Revert on failure
        await fetchData();
        toast.error(result.message || "Failed to delete product");
      }
    } catch (error) {
      console.error("Delete error:", error);
      await fetchData();
      toast.error("An error occurred");
    } finally {
      setDeleteLoading(null);
    }
  }, [customerId, dealId, fetchData, onRefresh]);

  // ─── Selection Creation ──────────────────────────────────
  
  const handleCreateSelection = useCallback(async () => {
    if (!user) {
      toast.error("Authentication required");
      return;
    }

    const selectedProductIds = Object.keys(selectedRows).filter((id) => selectedRows[id]);

    if (selectedProductIds.length === 0) {
      toast.error("Please select at least one product");
      return;
    }

    const selectedProducts = products.filter((p, idx) => 
      selectedProductIds.includes(getProductKey(p, idx))
    );

    setSelectionLoading(true);
    try {
      const result = await createSelectionAction(
        customerId,
        dealId,
        selectedProducts,
        user.name
      );

      if (result.success) {
        toast.success(`Selection #${result.selection?.id} created`);
        clearSelection();
        await fetchData();
        onRefresh?.();
      } else {
        toast.error(result.message || "Failed to create selection");
      }
    } catch (error: any) {
      console.error("Create selection error:", error);
      toast.error(error.message || "An error occurred");
    } finally {
      setSelectionLoading(false);
    }
  }, [user, selectedRows, products, customerId, dealId, clearSelection, fetchData, onRefresh]);

  // ─── Quotation Creation ──────────────────────────────────
  
  const handleQuotationClick = useCallback(async () => {
    const selectedProductIds = Object.keys(selectedRows).filter((id) => selectedRows[id]);

    const itemsToQuote = products.filter((p, idx) =>
      selectedProductIds.includes(getProductKey(p, idx))
    );

    if (itemsToQuote.length === 0) {
      toast.error("Please select products to create a quotation");
      return;
    }

    try {
      const [dealData, customerData] = await Promise.all([
        getDealById(customerId, dealId),
        getCustomerById(customerId),
      ]);

      if (!dealData || !customerData) {
        toast.error("Failed to load deal or customer data");
        return;
      }

      const regularItems = itemsToQuote.filter((item) => item.productType !== "VAS");
      const vasItems = itemsToQuote.filter((item) => item.productType === "VAS");

      const initialVas: VasDetail[] = vasItems.map((item) => ({
        vasName: item.subCategory || item.collectionBrand || "",
        rate: item.rate?.toString() || "0",
        quantity: item.quantity?.toString() || "1",
        room: item.room || "",
        gstPercent: 0,
      }));

      setQuotationDialog({
        isOpen: true,
        items: regularItems,
        vas: initialVas,
        deal: dealData,
        customer: customerData,
      });
    } catch (error) {
      console.error("Quotation dialog error:", error);
      toast.error("Failed to open quotation dialog");
    }
  }, [selectedRows, products, customerId, dealId]);

  const handleQuotationDialogClose = useCallback(() => {
    setQuotationDialog({
      isOpen: false,
      items: [],
      vas: [],
      deal: null,
      customer: null,
    });
  }, []);

  const handleQuotationSuccess = useCallback(async () => {
    await fetchData();
    onRefresh?.();
    clearSelection();
  }, [fetchData, onRefresh, clearSelection]);

  // ─── Selection Actions ───────────────────────────────────
  
  const handleViewSelection = useCallback((selection: Selection) => {
    console.log("View Selection:", selection);
    // TODO: Implement view logic
  }, []);

  const handleUpdateSelectionStatus = useCallback(
    async (id: string, status: "draft" | "final") => {
      console.log("Update Selection Status:", id, status);
      // TODO: Implement status update
    },
    []
  );

  // ─── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Added Products</h2>
          <p className="text-sm text-muted-foreground">
            {selectedProductsCount > 0 && `${selectedProductsCount} selected`}
          </p>
        </div>
      </div>

      {/* Products by Room */}
      <div className="space-y-4">
        {Object.keys(groupedProducts).length === 0 ? (
          <div className="rounded-lg border-2 border-dashed py-12 text-center text-muted-foreground">
            No products have been added yet.
          </div>
        ) : (
          Object.entries(groupedProducts).map(([room, productsInRoom]) => (
            <ProductRoomSection
              key={room}
              room={room}
              products={productsInRoom}
              selectedRows={selectedRows}
              deleteLoading={deleteLoading}
              onToggleRoom={toggleRoomSelection}
              onToggleRow={toggleRow}
              onDelete={handleDeleteItem}
            />
          ))
        )}
      </div>

      <Separator />

      {/* Selections Table */}
      <SelectionsTable
        selections={selections}
        onView={handleViewSelection}
        onUpdateStatus={handleUpdateSelectionStatus}
      />

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button
          type="button"
          onClick={handleCreateSelection}
          disabled={selectionLoading || selectedProductsCount === 0}
        >
          {selectionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Selection ({selectedProductsCount})
        </Button>

        <Button
          type="button"
          onClick={handleQuotationClick}
          disabled={selectedProductsCount === 0}
        >
          Create Quotation ({selectedProductsCount})
        </Button>
      </div>

      {/* Quotation Dialog */}
      {quotationDialog.deal && quotationDialog.customer && (
        <CreateQuotationDialog
          isOpen={quotationDialog.isOpen}
          onOpenChange={(open) => !open && handleQuotationDialogClose()}
          onSuccess={handleQuotationSuccess}
          deal={quotationDialog.deal}
          customer={quotationDialog.customer}
          initialItems={quotationDialog.items}
          initialVasDetails={quotationDialog.vas}
          initialQuotation={null}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTS (Extracted for Performance)
// ═══════════════════════════════════════════════════════════

interface ProductRoomSectionProps {
  room: string;
  products: GroupedProduct[];
  selectedRows: Record<string, boolean>;
  deleteLoading: string | null;
  onToggleRoom: (products: GroupedProduct[], checked: boolean) => void;
  onToggleRow: (key: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}

const ProductRoomSection = React.memo(function ProductRoomSection({
  room,
  products,
  selectedRows,
  deleteLoading,
  onToggleRoom,
  onToggleRow,
  onDelete,
}: ProductRoomSectionProps) {
  const allSelected = products.every((p) => {
    const key = getProductKey(p, p.originalIndex);
    return selectedRows[key];
  });

  return (
    <div>
      {/* Room Header */}
      <div className="flex items-center justify-between rounded-t-md bg-muted/50 p-3">
        <h3 className="font-semibold">{room}</h3>
      </div>

      {/* Table */}
      <div className="rounded-b-md border border-t-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => onToggleRoom(products, !!checked)}
                />
              </TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>BCN/Shade No</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Qty/Pcs</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {products.map((product) => {
              const productKey = getProductKey(product, product.originalIndex);
              const isSelected = selectedRows[productKey];
              const isDeleting = deleteLoading === productKey;

              return (
                <ProductRow
                  key={productKey}
                  product={product}
                  productKey={productKey}
                  isSelected={isSelected}
                  isDeleting={isDeleting}
                  onToggle={onToggleRow}
                  onDelete={onDelete}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
});

interface ProductRowProps {
  product: DealProduct;
  productKey: string;
  isSelected: boolean;
  isDeleting: boolean;
  onToggle: (key: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}

const ProductRow = React.memo(function ProductRow({
  product,
  productKey,
  isSelected,
  isDeleting,
  onToggle,
  onDelete,
}: ProductRowProps) {
  const isHardware = isHardwareProduct(product);
  const isVAS = isVASProduct(product);
  const hardwareLabel = getHardwareLabel(product);
  const hasHardwareBcn = Boolean(product.bcn);


  return (
    <TableRow>
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onToggle(productKey, !!checked)}
        />
      </TableCell>

      <TableCell>
        {isHardware ? (
          <Badge variant="destructive">Hardware</Badge>
        ) : isVAS ? (
          <Badge variant="outline" className="border-blue-600 text-blue-600">
            VAS
          </Badge>
        ) : (
          <Badge variant={product.isBlind ? "secondary" : "outline"}>
            {getProductLabel(product)}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {product.fabricCategoryGroup === "MAIN" ? (
          <Badge
            variant="outline"
            className="border-amber-600 bg-amber-50 text-amber-700"
          >
            MAIN
          </Badge>

        ) : product.fabricCategoryGroup === "SHEER" ? (
          <Badge
            variant="outline"
            className="border-cyan-600 bg-cyan-50 text-cyan-700"
          >
            SHEER
          </Badge>

        ) : product.fabricCategoryGroup === "SOFA" ? (
          <Badge
            variant="outline"
            className="border-violet-600 bg-violet-50 text-violet-700"
          >
            SOFA
          </Badge>

        ) : (
          <Badge
            variant="outline"
            className="border-stone-600 bg-stone-50 text-stone-700"
          >
            LINING
          </Badge>
        )}
      </TableCell>

      <TableCell>
        {isHardware ? (
          hasHardwareBcn ? (
            <div className="flex flex-col gap-1">
              <span className="font-medium">{product.bcn}</span>
              {product.itemName && (
                <span className="text-xs text-muted-foreground">
                  {product.itemName}
                </span>
              )}
            </div>
          ) : (
            <span>{hardwareLabel}</span>
          )
        ) : isVAS ? (
          <div className="flex flex-col gap-1">
            {product.productCategory}
            <Badge variant="outline">{product.subCategory}</Badge>
          </div>
        ) : (
          product.collectionBrand
        )}
      </TableCell>

      <TableCell className="text-xs">
        <p>MRP: ₹ {product.mrp || product.rate || "-"}</p>
      </TableCell>

      <TableCell>{product.quantity || "-"}</TableCell>

      <TableCell>{product.salesDescription || "-"}</TableCell>

      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(product.id)}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 text-destructive" />
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
});

interface SelectionsTableProps {
  selections: Selection[];
  onView: (selection: Selection) => void;
  onUpdateStatus: (id: string, status: "draft" | "final") => void;
}

const SelectionsTable = React.memo(function SelectionsTable({
  selections,
  onView,
  onUpdateStatus,
}: SelectionsTableProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Saved Selections</h3>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Selection Id</TableHead>
              <TableHead>Total Rooms</TableHead>
              <TableHead>Total MRP</TableHead>
              <TableHead>Total Pcs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>View</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {selections.length > 0 ? (
              selections.map((selection) => (
                <TableRow key={selection.id}>
                  <TableCell>{selection.id}</TableCell>
                  <TableCell>{selection.totalRooms}</TableCell>
                  <TableCell>{selection.totalMrp?.toFixed(2) || "-"}</TableCell>
                  <TableCell>{selection.totalPcs}</TableCell>
                  <TableCell>
                    <Badge
                      variant={selection.status === "final" ? "default" : "secondary"}
                    >
                      {selection.status || "draft"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onView(selection)}
                    >
                      <Eye className="h-5 w-5" />
                    </Button>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {selection.status === "final" ? (
                          <DropdownMenuItem
                            onClick={() => onUpdateStatus(selection.id, "draft")}
                          >
                            Remove Final
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => onUpdateStatus(selection.id, "final")}
                          >
                            Final Selection
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No selections saved yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
});