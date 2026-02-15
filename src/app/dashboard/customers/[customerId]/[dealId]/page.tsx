"use client";
import React, { useEffect, useState, useMemo, useCallback, ReactNode, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Customer, Deal, User, Quotation, DealOrder, DealVisit, DealMeasurement, Cpd, Selection, Order, MeasurementEntry, DealProduct, DealProductsDoc, VasDetail, Receipt } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Calendar, Contact, FileText, GanttChartSquare, Home, MessageSquare, Package, Plane, Receipt as ReceiptIcon, ShoppingCart, User as UserIcon, Contact2, Eye, Loader2, RefreshCw, AlertTriangle, Pencil, Download, Menu, X, Phone, MapPin, MoreHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getCustomerById, getSalesmen } from "../../actions";
import { getDealById, getDealProducts, getQuotationsForDeal, getOrdersForDeal, getVisitsForDeal, getMeasurementsForDeal, getCpdsForDeal, getSelectionsForDeal, updateSelectionStatusAction, updateDealProducts, createSelectionAction, getReceiptsForDeal, getMeasurementById, updateQuotationStatusAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { QuotationDetailDialog } from "@/components/features/order-management/QuotationDetailDialog";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CpdForm } from "@/components/features/customer/CpdForm";
import { VisitForm } from "@/components/features/customer/VisitForm";
import { MeasurementForm } from "@/components/features/customer/MeasurementForm";
import { ProductForm } from "@/components/features/customer/ProductForm";
import { format } from "date-fns";
import { PrintableSelection } from "@/components/features/order-management/PrintableSelection";
import { PrintableCpd, PrintableCustomerCpd } from "@/components/features/customer/PrintableCpd";
import { Table, TableHeader, TableRow, TableBody, TableCell, TableHead } from "@/components/ui/table";
import { processMeasurementSubmission } from "@/services/measurement-selection-middleware";
import AddedProduct from "@/components/features/customer/AddedProduct";
import { VasForm } from "@/components/features/customer/VasForm";
import { CreateQuotationDialog } from "@/components/features/order-management/CreateQuotationDialog";
import { ReceiptsTab } from "@/components/features/customer/ReceiptsTab";
import { MeasurementPreviewDialog } from "@/components/features/measurement/MeasurementPreviewDialog";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SelectItem } from "@radix-ui/react-select";

const toText = (value: unknown) => String(value ?? "").trim();

const normalizeType = (value?: string) => {
  const text = toText(value);
  return text ? text.toUpperCase() : "";
};

const inferProductSource = (typeHint?: string) => {
  const text = toText(typeHint).toLowerCase();
  if (text.includes("wall")) return "wallpaper";
  if (text.includes("floor")) return "flooring";
  if (text.includes("hardware") || text.includes("accessory") || text.includes("channel")) return "Hardware";
  return "fabric";
};

const inferProductType = (typeHint?: string, isVas?: boolean) => {
  if (isVas) return "VAS";
  const normalized = normalizeType(typeHint);
  if (normalized.includes("HARDWARE") || normalized.includes("ACCESSORY") || normalized.includes("CHANNEL")) {
    return "Hardware";
  }
  if (!normalized) return "fabric";
  return normalized.toLowerCase();
};

const mapDealProductsDocToUi = (doc?: DealProductsDoc | null): DealProduct[] => {
  if (!doc?.sections) return [];
  const normalItems = doc.sections.NORMAL?.items || [];
  const vasItems = doc.sections.VAS?.items || [];

  const mapItem = (item: any, index: number, isVas: boolean) => {
    const meta = item?.meta && typeof item.meta === "object" ? item.meta : {};
    const type = normalizeType(item?.type);
    const productType = inferProductType(type, isVas);
    const productSource = productType === "Hardware" ? "Hardware" : inferProductSource(type || item?.category || item?.group);
    const bcn = toText(item?.bcn);
    const description = toText(item?.description);
    const category = toText(item?.category);
    const group = toText(item?.group);
    const itemName = toText(item?.itemName);
    const rate = typeof item?.rate === "number" ? item.rate : Number(item?.rate);
    const qty = item?.qty ?? "";
    const unit = toText(item?.unit);

    const labelBase = bcn || description || itemName || `item-${index}`;

    return {
      ...(meta as any),
      id: `${isVas ? "vas" : "normal"}-${labelBase}-${index}`,
      collectionBrand: isVas ? (description || category || "VAS") : (bcn || description || itemName || "N/A"),
      salesDescription: description || category || group,
      quantity: qty === "" || qty === null || qty === undefined ? "" : String(qty),
      rate: Number.isFinite(rate) ? rate : undefined,
      mrp: Number.isFinite(rate) ? String(rate) : undefined,
      room: toText(item?.roomName),
      productType,
      productSource,
      productCategory: category || group || productType,
      subCategory: description || category || group,
      VasType: isVas ? (group || category || "") : undefined,
      itemName: itemName || undefined,
      bcn: bcn || undefined,
      unit: unit || undefined,
      gstPercent: item?.gst ?? undefined,
      hsnOrSac: item?.hsn || undefined,
      category: category || undefined,
      group: group || undefined,
    } as DealProduct;
  };

  return [
    ...normalItems.map((item, index) => mapItem(item, index, false)),
    ...vasItems.map((item, index) => mapItem(item, index, true)),
  ];
};

function QuotationsTab({ customerId, dealId, deal, salesmen, cpds, onCloneQuotation }: { customerId: string, dealId: string, deal: Deal, salesmen: User[], cpds: Cpd[], onCloneQuotation: (quotation: Quotation) => void }) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const parseDate = (date: any): Date => {
    if (date instanceof Date) return date;
    if (date && date._seconds) {
      return new Date(date._seconds * 1000 + (date._nanoseconds || 0) / 1000000);
    }
    if (typeof date === 'string' || typeof date === 'number') {
      const parsed = new Date(date);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  }

  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    const data = await getQuotationsForDeal(customerId, dealId);
    setQuotations(data);
    setLoading(false);
  }, [customerId, dealId]);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  const handleConvertToOrder = (quotation: Quotation) => {
    router.push(`/dashboard/invoice/new?customerId=${customerId}&dealId=${dealId}&quotationId=${quotation.id}`);
  };

  const handleCloseQuotation = async (quotation: Quotation) => {
    if (quotation.status === "Converted to Order") {
      toast({ variant: "destructive", title: "Cannot Close", description: "Converted quotations cannot be closed." });
      return;
    }

    const result = await updateQuotationStatusAction(customerId, dealId, quotation.id, "Closed");
    if (result.success) {
      toast({ title: "Quotation Closed", description: result.message });
      fetchQuotations();
    } else {
      toast({ variant: "destructive", title: "Close Failed", description: result.message });
    }
  };

  const renderStatusBadge = (status: Quotation["status"]) => {
    if (status === "Closed") {
      return <Badge variant="secondary">Closed</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };
  console.log("Quotations:", quotations);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Quotation Details</CardTitle>
        </CardHeader>
        <CardContent>
          {quotations.length > 0 ? (
            <div className="space-y-3">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead >Action</TableHead>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Quotation No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Store</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotations.map((q, i) => (
                      <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedQuotation(q)}>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                              <DropdownMenuItem
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedQuotation(q);
                                }}
                              >
                                View / Print
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onCloneQuotation(q);
                                }}
                              >
                                Clone Quotation
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleConvertToOrder(q);
                                }}
                                disabled={q.status === "Converted to Order" || q.status === "Closed"}
                              >
                                Convert to Order
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleCloseQuotation(q);
                                }}
                                disabled={q.status === "Converted to Order" || q.status === "Closed"}
                              >
                                Close Quotation
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-medium">{q.quotationNo}</TableCell>
                        <TableCell>{format(parseDate(q.date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>{q.customerName}</TableCell>
                        <TableCell>
                          {renderStatusBadge(q.status)}
                        </TableCell>
                        <TableCell className="text-right">₹{q.totalAmount.toFixed(2)}</TableCell>
                        <TableCell>{q.store}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {quotations.map((q, i) => (
                  <Card key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedQuotation(q)}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{q.quotationNo}</p>
                          <p className="text-xs text-muted-foreground">{format(parseDate(q.date), 'dd/MM/yyyy')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {React.cloneElement(renderStatusBadge(q.status), { className: "text-xs" })}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                              <DropdownMenuItem
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedQuotation(q);
                                }}
                              >
                                View / Print
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onCloneQuotation(q);
                                }}
                              >
                                Clone Quotation
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleConvertToOrder(q);
                                }}
                                disabled={q.status === "Converted to Order" || q.status === "Closed"}
                              >
                                Convert to Order
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleCloseQuotation(q);
                                }}
                                disabled={q.status === "Converted to Order" || q.status === "Closed"}
                              >
                                Close Quotation
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Customer:</span>
                          <span className="font-medium">{q.customerName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Amount:</span>
                          <span className="font-semibold">₹{q.totalAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Store:</span>
                          <span>{q.store}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-2 opacity-50" />
              <p>No quotations have been generated for this deal yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedQuotation && (
        <QuotationDetailDialog
          isOpen={!!selectedQuotation}
          onClose={() => setSelectedQuotation(null)}
          quotation={selectedQuotation}
          deal={deal}
          salesmen={salesmen}
          cpds={cpds}
        />
      )}
    </>
  );
}

function OrdersTab({ customerId, dealId }: { customerId: string, dealId: string }) {
  const [orders, setOrders] = useState<DealOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    const q = collection(db, 'customers', customerId, 'deals', dealId, 'orders');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DealOrder));
      setOrders(ordersData.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching orders:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load orders for this deal." });
      setLoading(false);
    });
    return () => unsubscribe();
  }, [customerId, dealId, toast]);

  const parseDate = (date: any): Date => {
    if (date instanceof Date) return date;
    if (date && date._seconds) {
      return new Date(date._seconds * 1000 + (date._nanoseconds || 0) / 1000000);
    }
    if (typeof date === 'string' || typeof date === 'number') {
      const parsed = new Date(date);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Orders Details</CardTitle>
      </CardHeader>
      <CardContent>
        {orders.length > 0 ? (
          <div className="space-y-3">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Order No</TableHead>
                    <TableHead>Remark</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order, i) => (
                    <TableRow key={order.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{order.orderNo}</TableCell>
                      <TableCell>{order.remark || '-'}</TableCell>
                      <TableCell>{format(parseDate(order.orderDate), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{order.status}</Badge>
                      </TableCell>
                      <TableCell>{order.createdBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {orders.map((order, i) => (
                <Card key={order.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">{order.orderNo}</p>
                        <p className="text-xs text-muted-foreground">{format(parseDate(order.orderDate), 'dd/MM/yyyy')}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{order.status}</Badge>
                    </div>
                    <Separator />
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Remark:</span>
                        <span>{order.remark || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Created By:</span>
                        <span>{order.createdBy}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <ShoppingCart className="mx-auto h-12 w-12 mb-2 opacity-50" />
            <p>No orders have been generated for this deal yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VisitsTab({ customerId, dealId, salesmen, visits, onVisitAdded, orders, selections, customer }: { 
  customerId: string; 
  dealId: string; 
  salesmen: User[]; 
  visits: DealVisit[]; 
  onVisitAdded: (visit: DealVisit) => void; 
  orders: DealOrder[]; 
  selections: Selection[]; 
  customer?: Customer;
}) {
  const [selectedVisit, setSelectedVisit] = useState<DealVisit | null>(null);

  const parseDate = (date: any): Date | null => {
    if (!date) return null;
    if (date instanceof Date && !isNaN(date.getTime())) return date;
    if (date && typeof date === "object" && "_seconds" in date) {
      const ms = date._seconds * 1000 + (date._nanoseconds ? date._nanoseconds / 1e6 : 0);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    const d2 = new Date(date);
    return isNaN(d2.getTime()) ? null : d2;
  };

  const safeFormat = (val: any, fmt = "PPP p") => {
    const d = parseDate(val);
    if (!d) return "N/A";
    try {
      return format(d, fmt);
    } catch {
      return "N/A";
    }
  };

  const asArray = (val: any) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const clean = (arr: any[]) => (arr || []).filter(Boolean);
  const repName = (repIdOrName: any) => salesmen.find((s) => s.id === repIdOrName)?.name || repIdOrName || "-";

  const InfoRow = ({ label, value }: { label: string; value: any }) => (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );

  const Pill = ({ children }: { children: React.ReactNode }) => (
    <Badge variant="secondary" className="text-xs">{children}</Badge>
  );

  const renderMeasurementDetails = (visit: any) => {
    const measurements = asArray(visit.measurements);
    const blinds = asArray(visit.blinds);
    const curtain = asArray(visit.curtain);

    return (
      <div className="space-y-4">
        {visit.selectionId && <InfoRow label="Selection ID" value={visit.selectionId} />}
        {visit.remark && <InfoRow label="Remark" value={visit.remark} />}
        
        <div>
          <p className="text-sm font-semibold mb-2">Measurements Selected</p>
          <div className="flex flex-wrap gap-1.5">
            {measurements.length ? measurements.map((m: string) => <Pill key={m}>{m}</Pill>) : <span className="text-sm text-muted-foreground">—</span>}
          </div>
        </div>

        {measurements.includes("blinds-measurement") && (
          <div>
            <p className="text-sm font-semibold mb-2">Blinds</p>
            <div className="flex flex-wrap gap-1.5">
              {blinds.length ? blinds.map((b: string) => <Pill key={b}>{b}</Pill>) : <span className="text-sm text-muted-foreground">—</span>}
            </div>
          </div>
        )}

        {measurements.includes("curtain-measurement") && (
          <div>
            <p className="text-sm font-semibold mb-2">Curtain</p>
            <div className="flex flex-wrap gap-1.5">
              {curtain.length ? curtain.map((c: string) => <Pill key={c}>{c}</Pill>) : <span className="text-sm text-muted-foreground">—</span>}
              {visit.otherCurtain && <Pill>Other: {visit.otherCurtain}</Pill>}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDeliveryDetails = (visit: any) => {
    const deliveryInstallations = clean(asArray(visit.deliveryInstallations));
    const subDeliveryInstallations = clean(asArray(visit.subDeliveryInstallations));

    return (
      <div className="space-y-4">
        {visit.otherDelivery && <InfoRow label="Other Delivery" value={visit.otherDelivery} />}
        {visit.remark && <InfoRow label="Remark" value={visit.remark} />}
        
        <div>
          <p className="text-sm font-semibold mb-2">Delivery/Installation Selected</p>
          {deliveryInstallations.length ? (
            <div className="space-y-2">
              {deliveryInstallations.map((x: any, idx: number) => (
                <div key={idx} className="flex justify-between text-sm bg-muted/50 p-2 rounded">
                  <span>{x.id || "-"}</span>
                  <span className="font-medium">{x.noOfPcs || "1"} pcs</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>

        {subDeliveryInstallations.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2">Sub Items</p>
            <div className="space-y-2">
              {subDeliveryInstallations.map((x: any, idx: number) => (
                <div key={idx} className="flex justify-between text-sm bg-muted/50 p-2 rounded">
                  <span>{x.id || "-"}</span>
                  <span className="font-medium">{x.noOfPcs || "1"} pcs</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <VisitForm
        salesmen={salesmen}
        customer={customer}
        customerId={customerId}
        dealId={dealId}
        onVisitAdded={onVisitAdded}
        visits={visits}
        orders={orders}
        selections={selections}
      />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Visit History</CardTitle>
        </CardHeader>
        <CardContent>
          {visits.length > 0 ? (
            <div className="space-y-3">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Representative</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Created At</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visits.map((visit, i) => (
                      <TableRow key={visit.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="capitalize">{visit.typeOfVisit}</TableCell>
                        <TableCell>
                          {visit.dueDate ? safeFormat(visit.dueDate) : <Badge variant="secondary" className="text-xs">Not Set</Badge>}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate">
                          {visit.location?.address || visit.customerSnapshot?.address}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{visit.status || "requested"}</Badge>
                        </TableCell>
                        <TableCell>{repName(visit.representative)}</TableCell>
                        <TableCell>{visit.createdBy}</TableCell>
                        <TableCell>{safeFormat(visit.createdAt, "dd/MM/yy")}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => setSelectedVisit(visit)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {visits.map((visit, i) => (
                  <Card key={visit.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedVisit(visit)}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm capitalize">{visit.typeOfVisit}</p>
                          <p className="text-xs text-muted-foreground">
                            {visit.dueDate ? safeFormat(visit.dueDate, "dd/MM/yy") : "Not Set"}
                          </p>
                        </div>
                        <Badge variant="outline" className="capitalize text-xs">{visit.status || "requested"}</Badge>
                      </div>
                      <Separator />
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Representative:</span>
                          <span>{repName(visit.representative)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Address:</span>
                          <span className="text-right">{visit.customerAddress || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Created By:</span>
                          <span>{visit.createdBy}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Created:</span>
                          <span>{safeFormat(visit.createdAt, "dd/MM/yy")}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="mx-auto h-12 w-12 mb-2 opacity-50" />
              <p>No visits have been logged for this deal yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedVisit && (
        <Dialog open={!!selectedVisit} onOpenChange={() => setSelectedVisit(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Visit Details</DialogTitle>
              <DialogDescription>
                Details for visit on {selectedVisit.dueDate ? safeFormat(selectedVisit.dueDate) : "N/A"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {selectedVisit.typeOfVisit === "measurement" ? renderMeasurementDetails(selectedVisit) : renderDeliveryDetails(selectedVisit)}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedVisit(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function MeasurementsTab({ customerId, dealId, measurements, onRefresh }: { 
  customerId: string; 
  dealId: string; 
  measurements: DealMeasurement[]; 
  onRefresh: () => void; 
}) {
  const { role } = useAuth();
  const router = useRouter();
  const [viewingMeasurement, setViewingMeasurement] = useState<DealMeasurement | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const { toast } = useToast();

  const handleViewPdf = async (measurementId: string) => {
    const fullMeasurement = await getMeasurementById(customerId, dealId, measurementId);
    const customerData = await getCustomerById(customerId);
    const dealData = await getDealById(customerId, dealId);

    if (fullMeasurement && customerData && dealData) {
      setCustomer(customerData);
      setDeal(dealData);
      setViewingMeasurement(fullMeasurement);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load measurement details.' });
    }
  };

  const handleDownloadPdf = async () => {
    const elementToCapture = document.getElementById("measurement-preview-content");
    if (!elementToCapture) return;

    setPdfLoading(true);
    try {
      const canvas = await html2canvas(elementToCapture, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 0;

      pdf.addImage(imgData, "PNG", imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`Measurement-${deal?.dealId || "details"}.pdf`);
    } catch (error) {
      console.error("Failed to generate PDF", error);
      toast({ variant: 'destructive', title: 'PDF Generation Failed', description: 'Could not generate the measurement PDF.' });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {role !== 'installer' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Measurement History</CardTitle>
          </CardHeader>
          <CardContent>
            {measurements.length > 0 ? (
              <div className="space-y-3">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Doer</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Selection ID</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {measurements.map((m, i) => (
                        <TableRow key={m.id}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>{m.typeOf || "-"}</TableCell>
                          <TableCell>{m.doerName || "-"}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{m.createdBy}</div>
                              <div className="text-muted-foreground">{m.createdAt ? format(new Date(m.createdAt), "dd/MM/yy") : "-"}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{m.status || "Unknown"}</Badge>
                          </TableCell>
                          <TableCell>
                            {m.selectionId ? (
                              <Badge variant="secondary">{m.selectionId}</Badge>
                            ) : (
                              <span className="text-muted-foreground">None</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/customers/${customerId}/${dealId}/measurement/${m.id}/edit`)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleViewPdf(m.id)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3">
                  {measurements.map((m, i) => (
                    <Card key={m.id}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-sm">{m.typeOf || "Measurement"}</p>
                            <p className="text-xs text-muted-foreground">by {m.doerName || "-"}</p>
                          </div>
                          <Badge variant="outline" className="text-xs">{m.status || "Unknown"}</Badge>
                        </div>
                        <Separator />
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Created By:</span>
                            <span>{m.createdBy}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Created:</span>
                            <span>{m.createdAt ? format(new Date(m.createdAt), "dd/MM/yy") : "-"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Selection ID:</span>
                            {m.selectionId ? (
                              <Badge variant="secondary" className="text-xs">{m.selectionId}</Badge>
                            ) : (
                              <span className="text-muted-foreground">None</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => router.push(`/dashboard/customers/${customerId}/${dealId}/measurement/${m.id}/edit`)}>
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => handleViewPdf(m.id)}>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <GanttChartSquare className="mx-auto h-12 w-12 mb-2 opacity-50" />
                <p>No measurements have been logged for this deal yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {role === 'installer' && <MeasurementForm customerId={customerId} dealId={dealId} onRefresh={onRefresh} />}

      <Dialog open={!!viewingMeasurement} onOpenChange={() => setViewingMeasurement(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Measurement Preview</DialogTitle>
            <DialogDescription>
              Review the measurement details before downloading the PDF.
            </DialogDescription>
          </DialogHeader>
          <div id="measurement-preview-content">
            {viewingMeasurement && customer && deal && (
              <MeasurementPreviewDialog
                open={!!viewingMeasurement}
                onOpenChange={() => setViewingMeasurement(null)}
                data={{
                  customerName: customer.name,
                  dealId: deal.dealId,
                  doerName: viewingMeasurement.doerName,
                  rooms: viewingMeasurement.rooms || []
                }}
                onSave={() => {}}
                saving={false}
                saveStep="idle"
              />
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setViewingMeasurement(null)}>Close</Button>
            <Button onClick={handleDownloadPdf} disabled={pdfLoading}>
              {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CrmActivitySkeleton() {
  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function CrmActivityTrackerPage({ params: paramsPromise }: { params: Promise<{ customerId: string, dealId: string }> }) {
  const params = use(paramsPromise);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { customerId, dealId } = params;
  const { toast } = useToast();
  const { user } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [salesmen, setSalesmen] = useState<User[]>([]);
  const [visits, setVisits] = useState<DealVisit[]>([]);
  const [measurements, setMeasurements] = useState<DealMeasurement[]>([]);
  const [cpds, setCpds] = useState<Cpd[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [orders, setOrders] = useState<DealOrder[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [activityLoading, setActivityLoading] = useState(false);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [isQuotationDialogOpen, setIsQuotationDialogOpen] = useState(false);
  const [quotationInitialItems, setQuotationInitialItems] = useState<DealProduct[]>([]);
  const [quotationInitialVas, setQuotationInitialVas] = useState<VasDetail[]>([]);
  const [quotationInitialData, setQuotationInitialData] = useState<Quotation | null>(null);
  const [viewingSelection, setViewingSelection] = useState<Selection | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const defaultTab = searchParams.get('tab') || 'visits';
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Single source of truth for products in UI
  const [products, setProducts] = useState<DealProduct[]>([]);

    const getProductKey = (p: any) => p.id || p.collectionBrand || p.label || p.bcn ||p.rrpWithGstRs || p.type || `${products.indexOf(p)}`;

    // ✅ derive groupedProducts from products
    const groupedProducts = useMemo(() => {
      return (products || []).reduce((acc, product, index) => {
        const room = (product.room || "Unassigned").trim();
        if (!acc[room]) acc[room] = [];
        // keep originalIndex for delete mapping
        acc[room].push({ ...(product as any), originalIndex: index });
        return acc;
      }, {} as Record<string, (DealProduct & { originalIndex?: number })[]>);
    }, [products]);

    // ✅ Blind dialog state (since you're passing setBlindDialogState)
    const [blindDialogState, setBlindDialogState] = useState<{ isOpen: boolean; roomName: string | null }>({
      isOpen: false,
      roomName: null,
    });

    // ✅ Save products to DB + also update UI immediately
    const handleProductsUpdated = async (updatedProducts: DealProduct[]) => {
      if (!deal) return;

      // ✅ update UI first (instant)
      setProducts(updatedProducts);

      setActivityLoading(true);
      const result = await updateDealProducts(customerId, dealId, updatedProducts, {
        id: user?.id,
        name: user?.name,
      });

      if (result.success) {
        toast({ title: "Activity Updated", description: "Product list has been saved." });
        fetchData(); // pulls fresh deal from DB
      } else {
        toast({ variant: "destructive", title: "Update Failed", description: result.message });
      }

      setActivityLoading(false);
    };

    // Update Activity should save current UI products to dealProducts doc
    const handleUpdateActivity = async () => {
      if (!deal) return;
      await handleProductsUpdated(products);
    };

    // ✅ Create Selection should read from CURRENT UI products
    const handleCreateSelection = async () => {
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

      const selectedProducts = (products || []).filter((p) => p.id && selectedProductIds.includes(p.id));
      setSelectionLoading(true);

      try {
        const result = await createSelectionAction(customerId, dealId, selectedProducts, user.name);
        if (result.success) {
          toast({
            title: "Selection Created!",
            description: `Selection #${result.selection?.id} has been saved.`,
          });
          setSelectedRows({});
          fetchData();
        } else {
          toast({ variant: "destructive", title: "Failed to Create Selection", description: result.message });
        }
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
      } finally {
        setSelectionLoading(false);
      }
    };

    // ✅ Quotation click should read from CURRENT UI products
    const handleQuotationClick = () => {
  console.group("🧾 [CREATE QUOTATION] Click Flow");

  console.log("1️⃣ Raw selectedRows:", selectedRows);

  const selectedProductIds = Object.keys(selectedRows).filter(
    (id) => selectedRows[id]
  );

  console.log("2️⃣ Selected Product IDs (from selectedRows):", selectedProductIds);

  console.log(
    "3️⃣ All Products Keys:",
    (products || []).map((p) => ({
      product: p,
      key: getProductKey(p),
    }))
  );

  const itemsToQuote = (products || []).filter((p) =>
    selectedProductIds.includes(getProductKey(p))
  );

  console.log("4️⃣ Matched itemsToQuote:", itemsToQuote);

  if (itemsToQuote.length === 0) {
    console.warn("❌ NO ITEMS MATCHED FOR QUOTATION");

    toast({
      variant: "destructive",
      title: "No Products Selected",
      description: "Please select products to create a quotation.",
    });

    console.groupEnd();
    return;
  }

  const regularItems = itemsToQuote.filter(
    (item) => item.productType !== "VAS"
  );

  const vasItems = itemsToQuote.filter(
    (item) => item.productType === "VAS"
  );

  console.log("5️⃣ Regular Items:", regularItems);
  console.log("6️⃣ VAS Items:", vasItems);

  const initialVas = vasItems.map((item, index) => ({
    vasName: item.subCategory || item.collectionBrand,
    rate: item.rate?.toString() || "0",
    quantity: item.quantity?.toString() || "1",
    room: item.room || "",
  }));

  console.log("7️⃣ Initial VAS Payload:", initialVas);

  setQuotationInitialItems(regularItems);
  setQuotationInitialVas(initialVas);
  setQuotationInitialData(null);
  setIsQuotationDialogOpen(true);

  console.log("✅ Quotation Dialog Opened Successfully");

  console.groupEnd();
};

  const handleCloneQuotation = (quotation: Quotation) => {
    const clonedItems = quotation.items.map((item, index) => ({
      id: item.id || `quotation-item-${index + 1}`,
      collectionBrand: item.collectionBrand,
      serialNo: item.serialNo || "",
      salesDescription: item.salesDescription || item.collectionBrand,
      quantity: String(item.quantity ?? 0),
      rate: item.rate ?? 0,
      mrp: item.rate != null ? String(item.rate) : undefined,
      discountPercent: item.discountPercent ?? 0,
      room: item.room || "",
      noOfPcs: "1",
      remarks: item.remark || "",
    })) as DealProduct[];

    setQuotationInitialItems(clonedItems);
    setQuotationInitialVas(quotation.vasDetails || []);
    setQuotationInitialData(quotation);
    setIsQuotationDialogOpen(true);
  };

  const handleQuotationDialogChange = (open: boolean) => {
    setIsQuotationDialogOpen(open);
    if (!open) {
      setQuotationInitialItems([]);
      setQuotationInitialVas([]);
      setQuotationInitialData(null);
    }
  };






  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [customerData, dealData, salesmenData, visitsData, measurementsData, cpdsData, quotationsData, ordersData, selectionsData, receiptsData, dealProductsData] = await Promise.all([
        getCustomerById(customerId),
        getDealById(customerId, dealId),
        getSalesmen(),
        getVisitsForDeal(customerId, dealId),
        getMeasurementsForDeal(customerId, dealId),
        getCpdsForDeal(customerId, dealId),
        getQuotationsForDeal(customerId, dealId),
        getOrdersForDeal(customerId, dealId),
        getSelectionsForDeal(customerId, dealId),
        getReceiptsForDeal(customerId, dealId),
        getDealProducts(dealId)
      ]);

      if (!customerData) throw new Error("Customer not found");
      if (!dealData) throw new Error("Deal not found");

      setCustomer(customerData);
      setDeal(dealData);
      setSalesmen(salesmenData);
      setVisits(visitsData);
      setMeasurements(measurementsData);
      setCpds(cpdsData);
      setQuotations(quotationsData);
      setOrders(ordersData);
      setSelections(selectionsData);
      setReceipts(receiptsData);
      setProducts(mapDealProductsDocToUi(dealProductsData));
    } catch (error) {
      console.error("Failed to fetch CRM activity data:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Could not load activity data.",
      });
    } finally {
      setLoading(false);
    }
  }, [customerId, dealId, toast]);


  const handleUpdateSelectionStatus = async (selectionId: string, status: 'draft' | 'final') => {
    const result = await updateSelectionStatusAction(customerId, dealId, selectionId, status);
    if (result.success) {
      toast({ title: 'Status Updated', description: result.message });
      fetchData();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
  };

  const savedAddresses = useMemo(() => {
      const list = Array.isArray(customer?.savedAddresses)
        ? customer.savedAddresses.filter((addr) => addr?.address)
        : [];
      if (list.length > 0) return list;
      if (customer?.billingAddress?.line1 || customer?.addressPinCode) {
        return [{ address: customer?.billingAddress?.line1 || customer.addressPinCode, landmark: customer.landmark }];
      }
      return [];
    }, [customer]);
  
    const [addressMode, setAddressMode] = useState<"saved" | "new">(
      savedAddresses.length > 0 ? "saved" : "new"
    );


  useEffect(() => {
    if (!customerId || !dealId) return;
    fetchData();
  }, [customerId, dealId, fetchData]);

  if (loading) {
    return <CrmActivitySkeleton />;
  }

  if (!customer || !deal) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Data not found</h2>
        <p className="text-muted-foreground mb-6 text-center">The requested customer or deal could not be loaded.</p>
        <Link href="/dashboard/customers">
          <Button>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
          </Button>
        </Link>
      </div>
    );
  }

  const representativeId = deal.assignedSalesPerson?.id || deal.representativeId;
  const representative = salesmen.find(s => s.id === representativeId);

  const tabItems = [
    { value: 'visits', label: 'Visits', icon: Calendar },
    { value: 'measurement', label: 'Measurement', icon: GanttChartSquare },
    { value: 'cpd', label: 'CPD', icon: FileText },
    { value: 'added-product', label: 'Added Product', icon: Package },
    { value: 'products', label: 'Products', icon: ShoppingCart },
    { value: 'quotations', label: 'Quotations', icon: FileText },
    { value: 'orders', label: 'Orders', icon: ShoppingCart },
    { value: 'invoice', label: 'Invoice', icon: ReceiptIcon },
    { value: 'receipt', label: 'Receipt', icon: ReceiptIcon },
    { value: 'reminder', label: 'Reminder/Notes', icon: MessageSquare },
  ];

  


  return (
    <>
      <div className="min-h-screen bg-background">
        {/* Mobile Header */}
        <div className="lg:hidden sticky top-0 z-50 bg-background border-b">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="font-semibold text-lg">CRM Activity</h1>
                <p className="text-xs text-muted-foreground">{deal.dealId}</p>
              </div>
            </div>
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] p-0">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <div className="py-2">
                  {tabItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.value}
                        onClick={() => {
                          setActiveTab(item.value);
                          setMobileMenuOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors",
                          activeTab === item.value
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:block border-b bg-muted/30">
          <div className="container mx-auto px-6 py-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <Link href="/dashboard/customers">
                  <Button variant="ghost" size="icon">
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </Link>
                <div>
                  <h1 className="text-3xl font-bold">CRM Activity Tracker</h1>
                  <p className="text-muted-foreground">Manage all deal activities in one place</p>
                </div>
              </div>
            </div>

            {/* Deal Info Cards - Desktop */}
            <Card className="w-full overflow-hidden">
            <CardContent className="p-0">
              {/* Header Section - Deal Summary */}
              <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-2xl font-bold">{deal.title || deal.dealName}</h3>
                      <Badge className="h-6">
                       {deal.status || 'Deal Created'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">ID: {deal.dealId}</p>
                  </div>
                  <div className="text-left lg:text-right">
                    <div className="text-sm text-muted-foreground mb-1">Deal Amount</div>
                    <div className="text-3xl font-bold text-primary">
                      ₹{((typeof deal.expectedValue === "number" ? deal.expectedValue : deal.dealAmount) || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Content Section */}
              <div className="p-6 space-y-6">
                {/* Deal Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Store Info */}
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <MapPin className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Customer Address
                      </div>
                      <div className="font-semibold text-foreground flex flex-wrap gap-1 w-1/2 break-words">
                        {savedAddresses.map((addr, index) => {
                          const addressText = addr.address || `Address ${index + 1}`;
                          const landmarkText = addr.landmark ? ` - ${addr.landmark}` : "";

                          return (
                            <div
                              key={`${addressText}-${index}`}
                              className="whitespace-normal"
                            >
                              {`${addressText}${landmarkText}`}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Representative Info */}
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <UserIcon className="h-5 w-5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Sales Representative
                      </div>
                      <div className="font-semibold text-foreground truncate">
                        {representative?.name || 'Not Assigned'}
                      </div>
                    </div>
                  </div>

                  {/* Contact Person Info */}
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <Contact2 className="h-5 w-5 text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Contact Person
                      </div>
                      <div className="font-semibold text-foreground truncate">
                        {customer.name}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {customer.phone || customer.mobileNo || "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Deal Description */}
                {deal.description && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Deal Description
                      </div>
                      <p className="text-sm text-foreground/90 leading-relaxed">
                        {deal.description}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
          </div>
        </div>

        {/* Mobile Info Cards */}
        <div className="lg:hidden p-4 space-y-3">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Deal Name</div>
                  <div className="font-semibold text-sm">{deal.title || deal.dealName}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Amount</div>
                  <div className="font-semibold text-sm">₹{((typeof deal.expectedValue === "number" ? deal.expectedValue : deal.dealAmount) || 0).toFixed(2)}</div>
                </div>
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer Address:</span>
                  <span className="font-medium flex flex-wrap gap-1 w-1/2 break-words">{customer.billingAddress?.line1 || customer.addressPinCode || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Representative:</span>
                  <span className="font-medium ">{representative?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contact:</span>
                  <span className="font-medium">{customer.name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Mobile:</span>
                  <span>{customer.phone || customer.mobileNo || "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {deal.description && (
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-2">Description</div>
                <p className="text-sm">{deal.description}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Content Area */}
        <div className="container mx-auto px-4 lg:px-6 py-6">
          {/* Desktop Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="hidden lg:block">
            <TabsList className="grid grid-cols-5 lg:grid-cols-10 mb-6">
              {tabItems.map((item) => {
                const Icon = item.icon;
                return (
                  <TabsTrigger key={item.value} value={item.value} className="gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="hidden xl:inline">{item.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="visits">
              <VisitsTab
                customer={customer}
                customerId={customerId}
                dealId={dealId}
                salesmen={salesmen}
                visits={visits}
                onVisitAdded={(visit) => setVisits([...visits, visit])}
                orders={orders}
                selections={selections}
              />
            </TabsContent>

            <TabsContent value="measurement">
              <MeasurementsTab
                customerId={customerId}
                dealId={dealId}
                measurements={measurements}
                onRefresh={fetchData}
              />
            </TabsContent>

            <TabsContent value="cpd">
              <CpdTab
                customer={customer}
                salesmen={salesmen}
                deal={deal}
                onRefresh={fetchData}
                quotations={quotations}
                cpds={cpds}
              />
            </TabsContent>

            <TabsContent value="added-product">
              <AddedProduct
                groupedProducts={groupedProducts}
                fields={products}
                selections={selections}
                selectedRows={selectedRows}
                setSelectedRows={setSelectedRows}
                selectionLoading={selectionLoading}
                activityLoading={activityLoading}
                handleUpdateActivity={handleUpdateActivity}
                handleDeleteItem={(index) => {
                  const next = [...products];
                  next.splice(index, 1);
                  handleProductsUpdated(next);
                }}
                handleViewSelection={setViewingSelection}
                handleCreateSelection={handleCreateSelection}
                handleQuotationClick={handleQuotationClick}
                handleUpdateSelectionStatus={handleUpdateSelectionStatus}
                setBlindDialogState={setBlindDialogState}
                getProductKey={getProductKey}
              />
            </TabsContent>

            <TabsContent value="products">
              <ProductForm
                initialProducts={products}
                onProductsUpdated={(next) => setProducts(next)} // ✅ just stage locally
                onRefresh={fetchData}
              />
            </TabsContent>



            <TabsContent value="quotations">
              <QuotationsTab
                customerId={customerId}
                dealId={dealId}
                deal={deal}
                salesmen={salesmen}
                cpds={cpds}
                onCloneQuotation={handleCloneQuotation}
              />
            </TabsContent>

            <TabsContent value="orders">
              <OrdersTab customerId={customerId} dealId={dealId} />
            </TabsContent>

            <TabsContent value="invoice">
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <ReceiptIcon className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>Invoice management coming soon</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="receipt">
              <ReceiptsTab
                customerId={customerId}
                dealId={dealId}
                receipts={receipts}
                onRefresh={fetchData}
              />
            </TabsContent>

            <TabsContent value="reminder">
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>Reminder and notes feature coming soon</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Mobile Content */}
          <div className="lg:hidden">
            {activeTab === 'visits' && (
              <VisitsTab
                customer={customer}
                customerId={customerId}
                dealId={dealId}
                salesmen={salesmen}
                visits={visits}
                onVisitAdded={(visit) => setVisits([...visits, visit])}
                orders={orders}
                selections={selections}
              />
            )}
            {activeTab === 'measurement' && (
              <MeasurementsTab
                customerId={customerId}
                dealId={dealId}
                measurements={measurements}
                onRefresh={fetchData}
              />
            )}
            {activeTab === 'cpd' && (
              <CpdTab
                customer={customer}
                salesmen={salesmen}
                deal={deal}
                onRefresh={fetchData}
                quotations={quotations}
                cpds={cpds}
              />
            )}
            {activeTab === "added-product" && (
              <AddedProduct
                groupedProducts={groupedProducts}
                fields={products}
                selections={selections}
                selectedRows={selectedRows}
                setSelectedRows={setSelectedRows}
                selectionLoading={selectionLoading}
                activityLoading={activityLoading}
                handleUpdateActivity={handleUpdateActivity}
                handleDeleteItem={(index) => {
                  const next = [...products];
                  next.splice(index, 1);
                  handleProductsUpdated(next);
                }}
                handleViewSelection={setViewingSelection}
                handleCreateSelection={handleCreateSelection}
                handleQuotationClick={handleQuotationClick}
                handleUpdateSelectionStatus={handleUpdateSelectionStatus}
                setBlindDialogState={setBlindDialogState}
                getProductKey={getProductKey}
              />
            )}

            {activeTab === "products" && (
              <ProductForm
                initialProducts={products}
                onProductsUpdated={(next) => setProducts(next)}
                onRefresh={fetchData}
              />
            )}

            {activeTab === 'quotations' && (
              <QuotationsTab
                customerId={customerId}
                dealId={dealId}
                deal={deal}
                salesmen={salesmen}
                cpds={cpds}
                onCloneQuotation={handleCloneQuotation}
              />
            )}
            {activeTab === 'orders' && (
              <OrdersTab customerId={customerId} dealId={dealId} />
            )}
            {activeTab === 'invoice' && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <ReceiptIcon className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>Invoice management coming soon</p>
                </CardContent>
              </Card>
            )}
            {activeTab === 'receipt' && (
              <ReceiptsTab
                customerId={customerId}
                dealId={dealId}
                receipts={receipts}
                onRefresh={fetchData}
              />
            )}
            {activeTab === 'reminder' && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>Reminder and notes feature coming soon</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Quotation Dialog */}
      <CreateQuotationDialog
        isOpen={isQuotationDialogOpen}
        onOpenChange={handleQuotationDialogChange}
        onSuccess={fetchData}
        deal={deal}
        customer={customer}
        initialItems={quotationInitialItems}
        initialVasDetails={quotationInitialVas}
        initialQuotation={quotationInitialData}
        cpds={cpds}
      />

      {/* Selection View Dialog */}
      <Dialog open={!!viewingSelection} onOpenChange={() => setViewingSelection(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selection Details: #{viewingSelection?.id}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {viewingSelection && (
              <PrintableSelection
                selection={viewingSelection}
                customer={customer}
                deal={deal}
                salesmen={salesmen}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingSelection(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// CPD Tab Component
function CpdTab({ customer, salesmen, deal, onRefresh, quotations, cpds }: { 
  customer: Customer, 
  salesmen: User[], 
  deal: Deal, 
  onRefresh: () => void, 
  quotations: Quotation[], 
  cpds: Cpd[] 
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCpd, setSelectedCpd] = useState<Cpd | null>(null);
  const [customerCpd, setCustomerCpd] = useState<Cpd | null>(null);
  const [isQuotationDialogOpen, setIsQuotationDialogOpen] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    onRefresh();
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsRefreshing(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Saved CPDs</CardTitle>
              <CardDescription>Previously saved Customer Product Details for this deal.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {cpds.length > 0 ? (
            <div className="space-y-3">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CPD ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Representative</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cpds.map(cpd => {
                      const isQuotationCreated = quotations.some(q => q.cpdId === cpd.id);
                      return (
                        <TableRow key={cpd.id}>
                          <TableCell className="font-medium cursor-pointer" onClick={() => setSelectedCpd(cpd)}>
                            {cpd.cpdId}
                          </TableCell>
                          <TableCell>{cpd.date ? format(new Date(cpd.date), 'PPP') : 'N/A'}</TableCell>
                          <TableCell>{cpd.createdBy}</TableCell>
                          <TableCell>{salesmen.find(s => s.id === cpd.representative)?.name || 'N/A'}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => setCustomerCpd(cpd)}>
                                Customer CPD
                              </Button>
                              {isQuotationCreated ? (
                                <Badge variant="secondary">Quotation Created</Badge>
                              ) : (
                                <Button size="sm" variant="default" onClick={() => setIsQuotationDialogOpen(true)}>
                                  Convert to Quotation
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {cpds.map(cpd => {
                  const isQuotationCreated = quotations.some(q => q.cpdId === cpd.id);
                  return (
                    <Card key={cpd.id}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-sm cursor-pointer" onClick={() => setSelectedCpd(cpd)}>
                              {cpd.cpdId}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {cpd.date ? format(new Date(cpd.date), 'dd/MM/yyyy') : 'N/A'}
                            </p>
                          </div>
                          {isQuotationCreated && (
                            <Badge variant="secondary" className="text-xs">Quotation Created</Badge>
                          )}
                        </div>
                        <Separator />
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Created By:</span>
                            <span>{cpd.createdBy}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Representative:</span>
                            <span>{salesmen.find(s => s.id === cpd.representative)?.name || 'N/A'}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => setCustomerCpd(cpd)}>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          {!isQuotationCreated && (
                            <Button size="sm" variant="default" className="flex-1" onClick={() => setIsQuotationDialogOpen(true)}>
                              <FileText className="h-4 w-4 mr-1" />
                              Quotation
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-2 opacity-50" />
              <p>No CPDs saved for this deal yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CPD Detail Dialog */}
      <Dialog open={!!selectedCpd} onOpenChange={() => setSelectedCpd(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>CPD Details: {selectedCpd?.cpdId}</DialogTitle>
            <DialogDescription>A printable view of the Customer Product Details.</DialogDescription>
          </DialogHeader>
          {selectedCpd && <PrintableCpd cpd={selectedCpd} customer={customer} deal={deal} salesmen={salesmen} />}
        </DialogContent>
      </Dialog>

      {/* Customer CPD Dialog */}
      <Dialog open={!!customerCpd} onOpenChange={() => setCustomerCpd(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer CPD: {customerCpd?.cpdId}</DialogTitle>
            <DialogDescription>A simplified, printable view of the Customer Product Details.</DialogDescription>
          </DialogHeader>
          {customerCpd && <PrintableCustomerCpd cpd={customerCpd} customer={customer} deal={deal} salesmen={salesmen} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
