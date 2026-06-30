"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import {
  Cpd,
  Customer,
  Deal,
  DealOrder,
  DealVisit,
  Quotation,
  Selection,
  User,
} from "@/lib/types";
import { QuotationDetailDialog } from "@/components/features/order-management/QuotationDetailDialog";
import { VisitForm } from "@/components/features/customer/VisitForm";
import {
  deleteQuotationCascadeAction,
  getOrdersForDeal,
  getQuotationsForDeal,
  updateQuotationStatusAction,
} from "./actions";
import {
  Calendar,
  Eye,
  FileText,
  MoreHorizontal,
  ShoppingCart,
} from "lucide-react";

type QuotationsTabProps = {
  customerId: string;
  dealId: string;
  customer: Customer;
  deal: Deal;
  salesmen: User[];
  cpds: Cpd[];
  onCloneQuotation: (quotation: Quotation) => void;
};

export function QuotationsTab({
  customerId,
  dealId,
  customer,
  deal,
  salesmen,
  cpds,
  onCloneQuotation,
}: QuotationsTabProps) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingQuotationId, setDeletingQuotationId] = useState<string | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { role, user } = useAuth();
  const isAdmin = role === "admin";

  const parseDate = (date: any): Date => {
    if (date instanceof Date) return date;
    if (date && date._seconds) {
      return new Date(date._seconds * 1000 + (date._nanoseconds || 0) / 1000000);
    }
    if (typeof date === "string" || typeof date === "number") {
      const parsed = new Date(date);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  };

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
    router.push(
      `/dashboard/invoice/new?customerId=${customerId}&dealId=${dealId}&quotationId=${quotation.id}`,
    );
  };

  const handleCloseQuotation = async (quotation: Quotation) => {
    if (quotation.status === "Converted to Order") {
      toast({
        variant: "destructive",
        title: "Cannot Close",
        description: "Converted quotations cannot be closed.",
      });
      return;
    }

    const result = await updateQuotationStatusAction(
      customerId,
      dealId,
      quotation.id,
      "Closed",
    );
    if (result.success) {
      toast({ title: "Quotation Closed", description: result.message });
      fetchQuotations();
    } else {
      toast({
        variant: "destructive",
        title: "Close Failed",
        description: result.message,
      });
    }
  };

  const handleDeleteQuotation = async (quotation: Quotation) => {
    if (!isAdmin) {
      toast({
        variant: "destructive",
        title: "Access denied",
        description: "Only admin can delete quotation with cascade.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Delete quotation ${quotation.quotationNo}? This will also delete linked order, order allocation, and generated invoices.`,
    );
    if (!confirmed) return;

    try {
      setDeletingQuotationId(quotation.id);
      const result = await deleteQuotationCascadeAction(customerId, dealId, quotation.id, {
        id: user?.id,
        name: user?.name || user?.email || "System",
        role: role || undefined,
      });
      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Delete Failed",
          description: result.message,
        });
        return;
      }
      toast({ title: "Quotation Deleted", description: result.message });
      await fetchQuotations();
      if (selectedQuotation?.id === quotation.id) {
        setSelectedQuotation(null);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error?.message || "Unable to delete quotation.",
      });
    } finally {
      setDeletingQuotationId(null);
    }
  };

  const renderStatusBadge = (status: Quotation["status"]) => {
    if (status === "Closed") return <Badge variant="secondary">Closed</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

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
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
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
                    {quotations.map((quotation, index) => (
                      <TableRow
                        key={quotation.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedQuotation(quotation)}
                      >
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
                            <DropdownMenuContent
                              align="end"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <DropdownMenuItem onClick={() => setSelectedQuotation(quotation)}>
                                View / Print
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onCloneQuotation(quotation)}>
                                Clone Quotation
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleConvertToOrder(quotation)}
                                disabled={
                                  quotation.status === "Converted to Order" ||
                                  quotation.status === "Closed"
                                }
                              >
                                Convert to Order
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCloseQuotation(quotation)}
                                disabled={
                                  quotation.status === "Converted to Order" ||
                                  quotation.status === "Closed"
                                }
                              >
                                Close Quotation
                              </DropdownMenuItem>
                              {isAdmin ? (
                                <DropdownMenuItem
                                  onClick={() => handleDeleteQuotation(quotation)}
                                  disabled={deletingQuotationId === quotation.id}
                                  className="text-destructive focus:text-destructive"
                                >
                                  {deletingQuotationId === quotation.id
                                    ? "Deleting..."
                                    : "Delete Quotation"}
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{quotation.quotationNo}</TableCell>
                        <TableCell>{format(parseDate(quotation.date), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{quotation.customerName}</TableCell>
                        <TableCell>{renderStatusBadge(quotation.status)}</TableCell>
                        <TableCell className="text-right">
                          Rs. {quotation.totalAmount.toFixed(2)}
                        </TableCell>
                        <TableCell>{quotation.store}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {quotations.map((quotation) => (
                  <Card
                    key={quotation.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedQuotation(quotation)}
                  >
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold">{quotation.quotationNo}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseDate(quotation.date), "dd/MM/yyyy")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {React.cloneElement(renderStatusBadge(quotation.status), {
                            className: "text-xs",
                          })}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedQuotation(quotation)}>
                                View / Print
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onCloneQuotation(quotation)}>
                                Clone Quotation
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleConvertToOrder(quotation)}
                                disabled={
                                  quotation.status === "Converted to Order" ||
                                  quotation.status === "Closed"
                                }
                              >
                                Convert to Order
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCloseQuotation(quotation)}
                                disabled={
                                  quotation.status === "Converted to Order" ||
                                  quotation.status === "Closed"
                                }
                              >
                                Close Quotation
                              </DropdownMenuItem>
                              {isAdmin ? (
                                <DropdownMenuItem
                                  onClick={() => handleDeleteQuotation(quotation)}
                                  disabled={deletingQuotationId === quotation.id}
                                  className="text-destructive focus:text-destructive"
                                >
                                  {deletingQuotationId === quotation.id
                                    ? "Deleting..."
                                    : "Delete Quotation"}
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Customer:</span>
                          <span className="font-medium">{quotation.customerName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Amount:</span>
                          <span className="font-semibold">
                            Rs. {quotation.totalAmount.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Store:</span>
                          <span>{quotation.store}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <FileText className="mx-auto mb-2 h-12 w-12 opacity-50" />
              <p>No quotations have been generated for this deal yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedQuotation ? (
        <QuotationDetailDialog
          isOpen={!!selectedQuotation}
          onClose={() => setSelectedQuotation(null)}
          quotation={selectedQuotation}
          deal={deal}
          customer={customer}
          salesmen={salesmen}
          cpds={cpds}
        />
      ) : null}
    </>
  );
}

export function OrdersTab({
  customerId,
  dealId,
}: {
  customerId: string;
  dealId: string;
}) {
  const [orders, setOrders] = useState<DealOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getOrdersForDeal(customerId, dealId)
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch((error) => {
        console.error("Error fetching orders:", error);
        if (!cancelled)
          toast({
            variant: "destructive",
            title: "Error",
            description: "Could not load orders for this deal.",
          });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [customerId, dealId]);

  const parseDate = (date: any): Date => {
    if (date instanceof Date) return date;
    if (date && date._seconds) {
      return new Date(date._seconds * 1000 + (date._nanoseconds || 0) / 1000000);
    }
    if (typeof date === "string" || typeof date === "number") {
      const parsed = new Date(date);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  };

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
            <div className="hidden overflow-x-auto md:block">
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
                  {orders.map((order, index) => (
                    <TableRow key={order.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{order.orderNo}</TableCell>
                      <TableCell>{order.remark || "-"}</TableCell>
                      <TableCell>{format(parseDate(order.orderDate), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{order.status}</Badge>
                      </TableCell>
                      <TableCell>{order.createdBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 md:hidden">
              {orders.map((order) => (
                <Card key={order.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold">{order.orderNo}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseDate(order.orderDate), "dd/MM/yyyy")}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {order.status}
                      </Badge>
                    </div>
                    <Separator />
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Remark:</span>
                        <span>{order.remark || "-"}</span>
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
          <div className="py-8 text-center text-muted-foreground">
            <ShoppingCart className="mx-auto mb-2 h-12 w-12 opacity-50" />
            <p>No orders have been generated for this deal yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type VisitsTabProps = {
  customerId: string;
  dealId: string;
  salesmen: User[];
  visits: DealVisit[];
  onVisitAdded: (visit: DealVisit) => void;
  orders: DealOrder[];
  selections: Selection[];
  customer?: Customer;
  deal?: Deal;
};

export function VisitsTab({
  customerId,
  dealId,
  salesmen,
  visits,
  onVisitAdded,
  orders,
  selections,
  customer,
  deal,
}: VisitsTabProps) {
  const [selectedVisit, setSelectedVisit] = useState<DealVisit | null>(null);

  const parseDate = (date: any): Date | null => {
    if (!date) return null;
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
    if (date && typeof date === "object" && "_seconds" in date) {
      const milliseconds =
        date._seconds * 1000 + (date._nanoseconds ? date._nanoseconds / 1e6 : 0);
      const parsed = new Date(milliseconds);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const safeFormat = (value: any, formatString = "PPP p") => {
    const parsed = parseDate(value);
    if (!parsed) return "N/A";
    try {
      return format(parsed, formatString);
    } catch {
      return "N/A";
    }
  };

  const asArray = (value: any) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const clean = (items: any[]) => (items || []).filter(Boolean);
  const repName = (representative: any) =>
    salesmen.find((salesman) => salesman.id === representative)?.name ||
    representative ||
    "-";

  const InfoRow = ({ label, value }: { label: string; value: any }) => (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "-"}</span>
    </div>
  );

  const Pill = ({ children }: { children: React.ReactNode }) => (
    <Badge variant="secondary" className="text-xs">
      {children}
    </Badge>
  );

  const renderMeasurementDetails = (visit: any) => {
    const measurements = asArray(visit.measurements);
    const blinds = asArray(visit.blinds);
    const curtain = asArray(visit.curtain);

    return (
      <div className="space-y-4">
        {visit.selectionId ? <InfoRow label="Selection ID" value={visit.selectionId} /> : null}
        {visit.remark ? <InfoRow label="Remark" value={visit.remark} /> : null}
        <div>
          <p className="mb-2 text-sm font-semibold">Measurements Selected</p>
          <div className="flex flex-wrap gap-1.5">
            {measurements.length ? (
              measurements.map((measurement: string) => (
                <Pill key={measurement}>{measurement}</Pill>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">-</span>
            )}
          </div>
        </div>
        {measurements.includes("blinds-measurement") ? (
          <div>
            <p className="mb-2 text-sm font-semibold">Blinds</p>
            <div className="flex flex-wrap gap-1.5">
              {blinds.length ? (
                blinds.map((blind: string) => <Pill key={blind}>{blind}</Pill>)
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </div>
          </div>
        ) : null}
        {measurements.includes("curtain-measurement") ? (
          <div>
            <p className="mb-2 text-sm font-semibold">Curtain</p>
            <div className="flex flex-wrap gap-1.5">
              {curtain.length ? (
                curtain.map((item: string) => <Pill key={item}>{item}</Pill>)
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
              {visit.otherCurtain ? <Pill>Other: {visit.otherCurtain}</Pill> : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderDeliveryDetails = (visit: any) => {
    const deliveryInstallations = clean(asArray(visit.deliveryInstallations));
    const subDeliveryInstallations = clean(asArray(visit.subDeliveryInstallations));

    return (
      <div className="space-y-4">
        {visit.otherDelivery ? (
          <InfoRow label="Other Delivery" value={visit.otherDelivery} />
        ) : null}
        {visit.remark ? <InfoRow label="Remark" value={visit.remark} /> : null}
        <div>
          <p className="mb-2 text-sm font-semibold">
            Delivery/Installation Selected
          </p>
          {deliveryInstallations.length ? (
            <div className="space-y-2">
              {deliveryInstallations.map((item: any, index: number) => (
                <div
                  key={`${item.id}-${index}`}
                  className="flex justify-between rounded bg-muted/50 p-2 text-sm"
                >
                  <span>{item.id || "-"}</span>
                  <span className="font-medium">{item.noOfPcs || "1"} pcs</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          )}
        </div>
        {subDeliveryInstallations.length ? (
          <div>
            <p className="mb-2 text-sm font-semibold">Sub Items</p>
            <div className="space-y-2">
              {subDeliveryInstallations.map((item: any, index: number) => (
                <div
                  key={`${item.id}-${index}`}
                  className="flex justify-between rounded bg-muted/50 p-2 text-sm"
                >
                  <span>{item.id || "-"}</span>
                  <span className="font-medium">{item.noOfPcs || "1"} pcs</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <VisitForm
        salesmen={salesmen}
        customer={customer}
        deal={deal}
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
              <div className="hidden overflow-x-auto md:block">
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
                    {visits.map((visit, index) => (
                      <TableRow key={visit.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="capitalize">{visit.typeOfVisit}</TableCell>
                        <TableCell>
                          {visit.dueDate ? (
                            safeFormat(visit.dueDate)
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              Not Set
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate">
                          {visit.location?.address || visit.customerSnapshot?.address}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {visit.status || "requested"}
                          </Badge>
                        </TableCell>
                        <TableCell>{repName(visit.representative)}</TableCell>
                        <TableCell>{visit.createdBy}</TableCell>
                        <TableCell>{safeFormat(visit.createdAt, "dd/MM/yy")}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedVisit(visit)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {visits.map((visit) => (
                  <Card
                    key={visit.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedVisit(visit)}
                  >
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold capitalize">
                            {visit.typeOfVisit}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {visit.dueDate
                              ? safeFormat(visit.dueDate, "dd/MM/yy")
                              : "Not Set"}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs capitalize">
                          {visit.status || "requested"}
                        </Badge>
                      </div>
                      <Separator />
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Representative:</span>
                          <span>{repName(visit.representative)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Address:</span>
                          <span className="text-right">{visit.customerAddress || "-"}</span>
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
            <div className="py-8 text-center text-muted-foreground">
              <Calendar className="mx-auto mb-2 h-12 w-12 opacity-50" />
              <p>No visits have been logged for this deal yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedVisit ? (
        <Dialog open={!!selectedVisit} onOpenChange={() => setSelectedVisit(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Visit Details</DialogTitle>
              <DialogDescription>
                Details for visit on{" "}
                {selectedVisit.dueDate ? safeFormat(selectedVisit.dueDate) : "N/A"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {selectedVisit.typeOfVisit === "measurement"
                ? renderMeasurementDetails(selectedVisit)
                : renderDeliveryDetails(selectedVisit)}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedVisit(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
