import { DealProduct, Selection } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Eye, Loader2, MoreHorizontal, Trash2 } from "lucide-react";

interface AddedProductProps {
  groupedProducts: Record<string, (DealProduct & { originalIndex?: number; productType?: string; items?: any, subCategory?: string })[]>;
  selections: Selection[];
  fields: DealProduct[];
  selectedRows: Record<string, boolean>;
  setSelectedRows: (rows: Record<string, boolean>) => void;
  selectionLoading: boolean;
  activityLoading: boolean;
  handleUpdateActivity: () => void;
  handleDeleteItem: (index: number) => void;
  handleViewSelection: (selection: Selection) => void;
  handleCreateSelection: () => void;
  handleQuotationClick: () => void;
  handleUpdateSelectionStatus: (id: string, status: 'draft' | 'final') => void;
  setBlindDialogState: (state: { isOpen: boolean; roomName: string | null }) => void;
}

export default function AddedProduct({
  groupedProducts = {},
  selections = [],
  fields = [],
  selectedRows,
  setSelectedRows,
  selectionLoading,
  activityLoading,
  handleUpdateActivity,
  handleDeleteItem,
  handleViewSelection,
  handleCreateSelection,
  handleQuotationClick,
  handleUpdateSelectionStatus,
  setBlindDialogState,
}: AddedProductProps) {
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
      : fields.findIndex((p) => p.id === product.id);

      const getProductLabel = (product: any) => {
        if (product.isBlind) return "Blind";
        if (product.productSource === "wallpaper") return "Wallpaper";
        if (product.productSource === "flooring") return "Flooring";
        return "Fabric";
        };

      

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Previously Added Products</h3>
          <Button type="button" onClick={handleUpdateActivity} disabled={activityLoading}>
            {activityLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Activity
          </Button>
        </div>
        {Object.keys(groupedProducts ?? {}).length === 0 ? (
             <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                No products have been added to this deal yet.
            </div>
        ) : Object.entries(groupedProducts ?? {}).map(([room, productsInRoom]) => (
          <div key={room}>
            <div className="flex items-center justify-between bg-muted/50 p-2 rounded-t-md">
              <h4 className="font-semibold">{room}</h4>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setBlindDialogState({ isOpen: true, roomName: room })}
              >
                Add Blind
              </Button>
            </div>
            <div className="border border-t-0 rounded-b-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Checkbox
                        checked={productsInRoom.every((p) => p.id && selectedRows[p.id])}
                        onCheckedChange={(checked) => toggleRoomSelection(productsInRoom, !!checked)}
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
                            const isHardware = product.productSource === "Hardware" || product.productType === "Hardware";
                            const isVAS = product.productType === "VAS";

                            return (
                            <TableRow key={product.id || product.collectionBrand}>
                                {/* Checkbox */}
                                <TableCell>
                                <Checkbox
                                    checked={!!product.id && !!selectedRows[product.id]}
                                    disabled={!product.id}
                                    onCheckedChange={(checked) => product.id && toggleRow(product.id, !!checked)}
                                />
                                </TableCell>

                                {/* Badge */}
                                <TableCell>
                                {isHardware ? (
                                    <Badge variant="destructive">Hardware</Badge>
                                ) : isVAS ? (
                                  <Badge variant="outline" className="text-blue-600 border-blue-600">VAS</Badge>
                                ) : (
                                    <Badge variant={product.isBlind ? "secondary" : "outline"}>
                                    {getProductLabel(product)}
                                    </Badge>
                                )}
                                </TableCell>

                                {/* Display Name */}
                                <TableCell>
                                {isHardware
                                    ? <div className="flex flex-col gap-1">{product.productCategory}<Badge variant={"outline"}>{product.subCategory}</Badge></div>
                                    : isVAS ? <div className="flex flex-col gap-1">{product.productCategory}<Badge variant={"outline"}>{product.subCategory} -&gt; {product.VasType}</Badge></div> 
                                    : product.collectionBrand}
                                </TableCell>

                                {/* Details Column */}
                                <TableCell className="text-xs">
                                {isHardware ? (
                                    <>
                                    <p>MRP: ₹ {product.rate}</p>
                                    </>
                                ) : product.isBlind ? (
                                    <>
                                    <p>Type: {product.blindType || "N/A"}</p>
                                    <p>Op: {product.operating || "N/A"}</p>
                                    </>
                                ) :isVAS ? (
                                  <>
                                  <p>MRP: ₹ {product.rate}</p>
                                  </>
                                ):(
                                    <p>MRP: ₹ {product.mrp}</p>
                                )}

                                </TableCell>

                                {/* Quantity */}
                                <TableCell>
                                {isHardware
                                    ? product.quantity || "-"
                                    : product.isBlind
                                    ? (product as any).noOfBlind
                                    : product.quantity}
                                </TableCell>

                                {/* Description */}
                                <TableCell>
                                {isHardware ? (
                                    <>
                                    {product.type}
                                    {product.bcn ? ` (BCN: ${product.bcn})` : ""}
                                    </>
                                ) : isVAS ? (
                                  <>
                                  {product.productCategory}
                                  </>
                              ) : (
                                    <>
                                    {product.salesDescription}
                                    {product.productSource === "flooring"
                                        ? ` — ${product.Type}`
                                        : ""}
                                    </>
                                )}
                                </TableCell>

                                {/* Delete */}
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
        ))}
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Saved Selection</h3>
        <div className="border rounded-md">
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
              {(selections ?? []).length > 0 ? (selections ?? []).map((selection) => (
                <TableRow key={selection.id}>
                  <TableCell>
                    <Checkbox />
                  </TableCell>
                  <TableCell>{selection.id}</TableCell>
                  <TableCell>{selection.totalRooms}</TableCell>
                  <TableCell>{selection.totalMrp !== undefined ? selection.totalMrp.toFixed(2) : "-"}</TableCell>
                  <TableCell>{selection.totalPcs}</TableCell>
                  <TableCell>
                    <Badge variant={selection.status === "final" ? "default" : "secondary"} className={selection.status === "final" ? "bg-green-500" : ""}>
                      {selection.status || "draft"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleViewSelection(selection)}>
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
                          <DropdownMenuItem onClick={() => handleUpdateSelectionStatus(selection.id, "draft")}>
                            Remove Final Selection
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleUpdateSelectionStatus(selection.id, "final")}>
                            Final Selection
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )) : (
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

      <div className="flex justify-between items-center pt-4 border-t">
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
