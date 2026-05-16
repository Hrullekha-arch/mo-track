"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { DealProduct, Selection } from "@/lib/types";
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
  getDealProducts,
  getSelectionsForDeal,
  updateDealProducts,
  updateSelectionStatusAction,
} from "../../actions";
import { mapDealProductsDocToUi } from "../../utils/productMappers";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

interface AddedProductTabProps {
  customerId: string;
  dealId: string;
}

export default function AddedProductTab({ customerId, dealId }: AddedProductTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<DealProduct[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);

  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

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
    } finally {
      setLoading(false);
    }
  }, [customerId, dealId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const groupedProducts = useMemo(() => {
    return products.reduce((acc, product, index) => {
      const room = (product.room || "Unassigned").trim();
      if (!acc[room]) acc[room] = [];
      acc[room].push({ ...product, originalIndex: index });
      return acc;
    }, {} as Record<string, (DealProduct & { originalIndex?: number; isBlind?: boolean })[]>);
  }, [products]);

  // ================= HANDLERS =================

  const persistProducts = useCallback(
    async (nextProducts: DealProduct[], successTitle: string) => {
      setActivityLoading(true);
      try {
        const actor = {
          id: (user as any)?.id,
          name: (user as any)?.name || (user as any)?.email || "System",
        };
        const result = await updateDealProducts(
          customerId,
          dealId,
          nextProducts,
          actor
        );
        if (!result.success) {
          toast({
            variant: "destructive",
            title: "Update Failed",
            description: result.message,
          });
          return false;
        }
        toast({
          title: successTitle,
          description: result.message,
        });
        setProducts(nextProducts);
        await fetchData();
        return true;
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Error",
          description: error?.message || "Could not update products.",
        });
        return false;
      } finally {
        setActivityLoading(false);
      }
    },
    [customerId, dealId, fetchData, toast, user]
  );

  const handleUpdateActivity = useCallback(async () => {
    await persistProducts(products, "Activity Updated");
  }, [persistProducts, products]);

  const handleDeleteItem = useCallback(
    async (index: number) => {
      if (index < 0 || index >= products.length) return;
      const next = [...products];
      next.splice(index, 1);
      await persistProducts(next, "Product Deleted");
    },
    [persistProducts, products]
  );

  const handleViewSelection = (_selection: Selection) => {};

   // ✅ CREATE SELECTION HANDLER
  const handleCreateSelection = async () => {
    if (!user) {
      toast({ 
        variant: "destructive", 
        title: "Authentication error",
        description: "You must be logged in to create a selection"
      });
      return;
    }

    // Get selected product IDs
    const selectedProductIds = Object.keys(selectedRows).filter(
      (id) => selectedRows[id]
    );

    if (selectedProductIds.length === 0) {
      toast({
        variant: "destructive",
        title: "No Products Selected",
        description: "Please select at least one product to create a selection.",
      });
      return;
    }

    // Filter selected products
    const selectedProducts = products.filter((p) => 
      p.id && selectedProductIds.includes(p.id)
    );

    setSelectionLoading(true);

    try {
      // ✅ BACKEND CALL
      const result = await createSelectionAction(
        customerId,
        dealId,
        selectedProducts,
        (user as any)?.name || (user as any)?.email || "System"
      );

      if (result.success) {
        toast({
          title: "Selection Created!",
          description: `Selection #${result.selection?.id} has been saved.`,
        });
        
        // Clear selection checkboxes
        setSelectedRows({});
        
        // Refresh data
        await fetchData();

      } else {
        toast({
          variant: "destructive",
          title: "Failed to create selection",
          description: result.message,
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "An unexpected error occurred.",
      });
    } finally {
      setSelectionLoading(false);
    }
  };

  const handleQuotationClick = () => {
    toast({
      title: "Use Quotations Tab",
      description: "Create quotation flow is available in the Quotations tab.",
    });
  };

  const handleUpdateSelectionStatus = useCallback(
    async (id: string, status: "draft" | "final") => {
      const result = await updateSelectionStatusAction(
        customerId,
        dealId,
        id,
        status
      );
      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Status Update Failed",
          description: result.message,
        });
        return;
      }
      toast({
        title: "Selection Updated",
        description: result.message,
      });
      await fetchData();
    },
    [customerId, dealId, fetchData, toast]
  );

  const setBlindDialogState = (_state: { isOpen: boolean; roomName: string | null }) => {};

  // ================= HELPERS =================

  const toggleRoomSelection = (productsInRoom: any[], checked: boolean) => {
    const newSelection = { ...selectedRows };
    productsInRoom.forEach((p) => {
      if (!p.id) return;
      if (checked) newSelection[p.id] = true;
      else delete newSelection[p.id];
    });
    setSelectedRows(newSelection);
  };

  const toggleRow = (productId: string, checked: boolean) => {
    const newSelection = { ...selectedRows };
    if (checked) newSelection[productId] = true;
    else delete newSelection[productId];
    setSelectedRows(newSelection);
  };

  const resolveIndex = (product: any) =>
    typeof product.originalIndex === "number"
      ? product.originalIndex
      : products.findIndex((p) => p.id === product.id);

  const getProductLabel = (product: any) => {
    if (product.isBlind) return "Blind";
    if (product.productSource === "wallpaper") return "Wallpaper";
    if (product.productSource === "flooring") return "Flooring";
    return "Fabric";
  };

  // ================= UI =================

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
          <p className="text-sm text-muted-foreground">Customer ID: {customerId}</p>
          <p className="text-sm text-muted-foreground">Deal ID: {dealId}</p>
        </div>

        <Button type="button" onClick={handleUpdateActivity} disabled={activityLoading}>
          {activityLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Update Activity
        </Button>
      </div>

      {/* Products */}
      <div className="space-y-4">
        {Object.keys(groupedProducts).length === 0 ? (
          <div className="rounded-lg border-2 border-dashed py-12 text-center text-muted-foreground">
            No products have been added yet.
          </div>
        ) : (
          Object.entries(groupedProducts).map(([room, productsInRoom]) => (
            <div key={room}>

              {/* Room Header */}
              <div className="flex items-center justify-between rounded-t-md bg-muted/50 p-3">
                <h3 className="font-semibold">{room}</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setBlindDialogState({ isOpen: true, roomName: room })}
                >
                  Add Blind
                </Button>
              </div>

              {/* Table */}
              <div className="rounded-b-md border border-t-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Checkbox
                          checked={productsInRoom.every((p) => p.id && selectedRows[p.id])}
                          onCheckedChange={(checked) =>
                            toggleRoomSelection(productsInRoom, !!checked)
                          }
                        />
                      </TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>BCN/Shade No</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Qty/Pcs</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {productsInRoom.map((product) => {
                      const isHardware =
                        product.productSource === "Hardware" ||
                        product.productType === "Hardware";
                      const isVAS = product.productType === "VAS";

                      const hardwareLabel =
                        product.itemName && product.bcn
                          ? String(product.subCategory || "").replace(product.bcn, product.itemName)
                          : product.itemName || product.subCategory || product.productCategory;

                      const hasHardwareBcn = Boolean(product.bcn);

                      return (
                        <TableRow key={product.id || product.collectionBrand}>

                          <TableCell>
                            <Checkbox
                              checked={!!product.id && !!selectedRows[product.id]}
                              disabled={!product.id}
                              onCheckedChange={(checked) =>
                                product.id && toggleRow(product.id, !!checked)
                              }
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
                              onClick={() => {
                                const targetIndex = resolveIndex(product);
                                if (targetIndex !== -1) handleDeleteItem(targetIndex);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>

                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}
      </div>

      <Separator />

      {/* Selections */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Saved Selections</h3>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Modify</TableHead>
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
                    <TableCell><Checkbox /></TableCell>
                    <TableCell>{selection.id}</TableCell>
                    <TableCell>{selection.totalRooms}</TableCell>
                    <TableCell>{selection.totalMrp?.toFixed(2) || "-"}</TableCell>
                    <TableCell>{selection.totalPcs}</TableCell>
                    <TableCell>
                      <Badge variant={selection.status === "final" ? "default" : "secondary"}>
                        {selection.status || "draft"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewSelection(selection)}
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
                              onClick={() => handleUpdateSelectionStatus(selection.id, "draft")}
                            >
                              Remove Final
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleUpdateSelectionStatus(selection.id, "final")}
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
                  <TableCell colSpan={8} className="h-24 text-center">
                    No selections saved yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button type="button" onClick={handleCreateSelection} disabled={selectionLoading}>
          {selectionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Selection
        </Button>

        <Button type="button" onClick={handleQuotationClick}>
          Create Quotation
        </Button>
      </div>

    </div>
  );
}
