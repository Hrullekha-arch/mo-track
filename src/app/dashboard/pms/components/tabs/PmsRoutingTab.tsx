import {
  Download,
  GripVertical,
  Loader2,
  Package,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { REQUIRED_ROUTING_FINISH_STEPS, ROUTING_QUICK_ADD_STEPS, normalizeText, toNumber } from "../../utils/pmsHelpers";
import {
  PMS_CARD_DESCRIPTION_CLASS,
  PMS_CARD_HEADER_CLASS,
  PMS_CARD_TITLE_CLASS,
  PMS_SECTION_CARD_CLASS,
  PMS_TABLE_HEAD_CLASS,
  PMS_TABLE_HEADER_ROW_CLASS,
} from "../../utils/pmsStyles";

type Props = { ctx: any };

export function PmsRoutingTab({ ctx }: Props) {
  return (
    <TabsContent value="routing" className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <Card className={`h-fit ${PMS_SECTION_CARD_CLASS}`}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <CardTitle className={PMS_CARD_TITLE_CLASS}>Product Selection</CardTitle>
            <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>Choose a product to configure its routing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={ctx.productSearch}
                onChange={(event) => ctx.setProductSearch(event.target.value)}
                className="pl-9"
              />
            </div>

            <div className="rounded-lg border bg-amber-50/60 p-3">
              <div className="mb-2">
                <div className="text-sm font-semibold text-amber-900">Routing Not Entered</div>
                <div className="text-xs text-amber-700">
                  Show here to create a routing for an item whose routing has not been entered.
                </div>
              </div>
              {ctx.routingNotEnteredItems.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  No PMS items are currently waiting for routing creation.
                </div>
              ) : (
                <div className="space-y-2">
                  {ctx.routingNotEnteredItems.map((item: any) => (
                    <div
                      key={`missing-routing-${item.productId}`}
                      className="flex items-center justify-between rounded-md border bg-white p-2"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="truncate text-sm font-medium">{item.productName}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          Order: {item.orderNo} | Customer: {item.customer}
                        </div>
                        <div className="truncate text-xs text-amber-700">VAS: {item.vasName}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="ml-2 shrink-0"
                        onClick={() => ctx.handleStartRoutingCreation(item.productId)}
                      >
                        Show Here
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <ScrollArea className="h-[300px] rounded-md border">
              <div className="space-y-2 p-4">
                {ctx.filteredProducts.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">No products found</div>
                )}
                {ctx.filteredProducts.map((product: any) => (
                  <div
                    key={product.id}
                    onClick={() => ctx.setSelectedProductId(product.id)}
                    className={cn(
                      "cursor-pointer rounded-lg border p-3 transition-all hover:border-primary",
                      ctx.selectedProductId === product.id && "border-primary bg-primary/5"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{product.name}</p>
                        <Badge variant="secondary" className="text-xs">
                          {product.category}
                        </Badge>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              ctx.setDeleteDialog({
                                open: true,
                                type: "product",
                                id: product.id,
                                name: product.name,
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete product</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <Separator />

            <div className="space-y-3">
              <Input
                placeholder="Product name"
                value={ctx.newProduct.name}
                onChange={(event) =>
                  ctx.setNewProduct((prev: any) => ({ ...prev, name: event.target.value }))
                }
              />
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <div className="text-xs font-medium text-muted-foreground">Add New Category</div>
                <div className="flex gap-2">
                  <Input
                    placeholder="New category name"
                    value={ctx.newCategoryName}
                    onChange={(event) => ctx.setNewCategoryName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        ctx.handleAddCategory();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={ctx.handleAddCategory}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Category
                  </Button>
                </div>
              </div>
              <Select
                value={ctx.newProduct.category}
                onValueChange={(value) =>
                  ctx.setNewProduct((prev: any) => ({ ...prev, category: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {ctx.categories.map((category: string) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={ctx.handleAddProduct} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className={PMS_CARD_TITLE_CLASS}>Routing Steps</CardTitle>
                <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
                  {ctx.selectedProductId
                    ? `Configure process steps for ${ctx.products.find((item: any) => item.id === ctx.selectedProductId)?.name}`
                    : "Select a product to configure routing"}
                </CardDescription>
                {ctx.selectedProductId && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Embelshment work is optional. Q&amp;Q, Final Complete Kitting, and Packaging will be included in all routings.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => ctx.exportData(ctx.routingRows, "routing.json")}
                      disabled={!ctx.selectedProductId || ctx.routingRows.length === 0}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export routing</TooltipContent>
                </Tooltip>
                <Button size="sm" variant="outline" onClick={() => ctx.openImportDialog("routing")}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>
                <Button size="sm" onClick={ctx.handleAddRoutingRow} disabled={!ctx.selectedProductId}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Step
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {ctx.selectedProductId ? (
              <>
                <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
                  {ROUTING_QUICK_ADD_STEPS.map((process) => (
                    <Button
                      key={process}
                      size="sm"
                      variant={process === "Embelshment work" ? "secondary" : "outline"}
                      onClick={() => ctx.handleQuickAddRoutingProcesses([process])}
                    >
                      {process === "Embelshment work" && <Plus className="mr-2 h-4 w-4" />}
                      {process}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      ctx.handleQuickAddRoutingProcesses(REQUIRED_ROUTING_FINISH_STEPS)
                    }
                  >
                    Add Standard Finish Steps
                  </Button>
                </div>

                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                        <TableHead className={`${PMS_TABLE_HEAD_CLASS} w-[60px]`}>
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                        </TableHead>
                        <TableHead className={`${PMS_TABLE_HEAD_CLASS} w-[100px]`}>Step</TableHead>
                        <TableHead className={PMS_TABLE_HEAD_CLASS}>Process</TableHead>
                        <TableHead className={`${PMS_TABLE_HEAD_CLASS} w-[140px]`}>Cycle (min)</TableHead>
                        <TableHead className={PMS_TABLE_HEAD_CLASS}>Machine</TableHead>
                        <TableHead className={`${PMS_TABLE_HEAD_CLASS} w-[100px]`}>OPS</TableHead>
                        <TableHead className={`${PMS_TABLE_HEAD_CLASS} w-[80px]`}>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ctx.routingRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-32 text-center">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Package className="h-8 w-8 opacity-50" />
                              <p className="text-sm">No routing steps configured</p>
                              <p className="text-xs">Click "Add Step" or use the quick-add buttons above.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        ctx.routingRows.map((row: any, index: number) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <div className="flex items-center justify-center">
                                <GripVertical className="h-4 w-4 cursor-move text-muted-foreground" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.stepNo}
                                type="number"
                                min={1}
                                className="w-20"
                                onChange={(event) => {
                                  const stepNo = toNumber(event.target.value);
                                  ctx.setRoutingRows((prev: any[]) => {
                                    const next = [...prev];
                                    next[index] = { ...next[index], stepNo };
                                    return next;
                                  });
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.process}
                                placeholder="e.g., Assembly"
                                onChange={(event) => {
                                  const process = event.target.value;
                                  ctx.setRoutingRows((prev: any[]) => {
                                    const next = [...prev];
                                    next[index] = { ...next[index], process };
                                    return next;
                                  });
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step={0.1}
                                value={row.cycleMinutes}
                                onChange={(event) => {
                                  const cycleMinutes = toNumber(event.target.value);
                                  ctx.setRoutingRows((prev: any[]) => {
                                    const next = [...prev];
                                    next[index] = { ...next[index], cycleMinutes };
                                    return next;
                                  });
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex max-w-[220px] flex-wrap gap-1">
                                {ctx.machines
                                  .filter(
                                    (machine: any) =>
                                      machine.active !== false &&
                                      normalizeText(machine.process) === normalizeText(row.process)
                                  )
                                  .map((machine: any) => (
                                    <Badge key={`${row.id}-${machine.id}`} variant="outline" className="text-[10px]">
                                      {machine.name}
                                    </Badge>
                                  ))}
                                {ctx.machines.filter(
                                  (machine: any) =>
                                    machine.active !== false &&
                                    normalizeText(machine.process) === normalizeText(row.process)
                                ).length === 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {row.process ? "No machine match" : "Enter process"}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={1}
                                value={row.ops}
                                onChange={(event) => {
                                  const ops = toNumber(event.target.value);
                                  ctx.setRoutingRows((prev: any[]) => {
                                    const next = [...prev];
                                    next[index] = { ...next[index], ops };
                                    return next;
                                  });
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      ctx.setRoutingRows((prev: any[]) => prev.filter((_: any, i: number) => i !== index))
                                    }
                                  >
                                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete step</TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between pt-4">
                  <div className="text-sm text-muted-foreground">
                    {ctx.routingRows.length} step{ctx.routingRows.length !== 1 ? "s" : ""} configured
                  </div>
                  <Button onClick={ctx.handleSaveRouting} disabled={ctx.savingRouting || ctx.routingRows.length === 0}>
                    {ctx.savingRouting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Routing
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
                <Package className="mb-4 h-16 w-16 opacity-50" />
                <p className="text-lg font-medium">No Product Selected</p>
                <p className="text-sm">Select a product from the left panel to configure routing</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
