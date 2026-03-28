"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { CheckCircle2, Loader2, RefreshCcw, ShieldAlert } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  completeOrdersMilestonesBulkAction,
  getOrdersForSalesmanBulkCompleteAction,
  getSalesmenForBulkCompleteAction,
  SalesmanOrderSummary,
} from "./actions";

type SalesmanOption = {
  id: string;
  name: string;
  salesmanCode?: string;
};

const formatDateSafe = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "dd MMM yyyy");
};

export default function BulkCompleteOrdersPage() {
  const { role, user } = useAuth();
  const { toast } = useToast();

  const [salesmen, setSalesmen] = React.useState<SalesmanOption[]>([]);
  const [selectedSalesmanId, setSelectedSalesmanId] = React.useState("");
  const [orders, setOrders] = React.useState<SalesmanOrderSummary[]>([]);
  const [orderSearch, setOrderSearch] = React.useState("");
  const [selectedOrderIds, setSelectedOrderIds] = React.useState<Record<string, boolean>>({});

  const [isLoadingSalesmen, setIsLoadingSalesmen] = React.useState(true);
  const [isLoadingOrders, setIsLoadingOrders] = React.useState(false);
  const [isCompleting, setIsCompleting] = React.useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);

  const selectedIds = React.useMemo(
    () => Object.entries(selectedOrderIds).filter(([, checked]) => checked).map(([id]) => id),
    [selectedOrderIds]
  );

  const filteredOrders = React.useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) => {
      const haystack = [
        order.orderNo,
        order.id,
        order.customerName,
        order.status,
        order.orderType,
        order.salesPerson,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, orderSearch]);

  const selectedFilteredCount = React.useMemo(
    () => filteredOrders.filter((order) => Boolean(selectedOrderIds[order.id])).length,
    [filteredOrders, selectedOrderIds]
  );

  const selectedCount = selectedIds.length;
  const allRowsSelected = filteredOrders.length > 0 && selectedFilteredCount === filteredOrders.length;
  const incompleteCount = orders.filter((order) => !order.isCompleted).length;

  const loadSalesmen = React.useCallback(async () => {
    setIsLoadingSalesmen(true);
    try {
      const result = await getSalesmenForBulkCompleteAction();
      if (!result.success) {
        toast({ variant: "destructive", title: "Failed", description: result.message });
        setSalesmen([]);
        return;
      }
      setSalesmen(result.salesmen);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "Could not load salesmen." });
    } finally {
      setIsLoadingSalesmen(false);
    }
  }, [toast]);

  const loadOrders = React.useCallback(
    async (salesmanId: string) => {
      const id = String(salesmanId || "").trim();
      if (!id) {
        setOrders([]);
        setSelectedOrderIds({});
        return;
      }
      setIsLoadingOrders(true);
      try {
        const result = await getOrdersForSalesmanBulkCompleteAction(id);
        if (!result.success) {
          toast({ variant: "destructive", title: "Failed", description: result.message });
          setOrders([]);
          setSelectedOrderIds({});
          return;
        }
        setOrders(result.orders);
        setOrderSearch("");
        setSelectedOrderIds({});
      } catch (error) {
        console.error(error);
        toast({ variant: "destructive", title: "Error", description: "Could not load orders." });
        setOrders([]);
        setSelectedOrderIds({});
      } finally {
        setIsLoadingOrders(false);
      }
    },
    [toast]
  );

  React.useEffect(() => {
    loadSalesmen();
  }, [loadSalesmen]);

  const handleToggleAll = (checked: boolean) => {
    if (!checked) {
      setSelectedOrderIds((prev) => {
        const next = { ...prev };
        filteredOrders.forEach((order) => {
          delete next[order.id];
        });
        return next;
      });
      return;
    }
    setSelectedOrderIds((prev) => {
      const next = { ...prev };
      filteredOrders.forEach((order) => {
        next[order.id] = true;
      });
      return next;
    });
  };

  const handleToggleRow = (orderId: string, checked: boolean) => {
    setSelectedOrderIds((prev) => ({
      ...prev,
      [orderId]: checked,
    }));
  };

  const handleCompleteSelected = async () => {
    if (!selectedIds.length) return;
    setIsCompleting(true);
    try {
      const result = await completeOrdersMilestonesBulkAction({
        orderIds: selectedIds,
        completedBy: user?.name || "Admin",
      });

      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Bulk completion failed",
          description: result.message,
        });
        return;
      }

      const skippedText =
        result.skippedCount > 0
          ? ` ${result.skippedCount} order(s) were skipped.`
          : "";
      toast({
        title: "Orders updated",
        description: `${result.updatedCount} order(s) marked complete.${skippedText}`,
      });

      await loadOrders(selectedSalesmanId);
      setSelectedOrderIds({});
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not complete selected orders.",
      });
    } finally {
      setIsCompleting(false);
      setIsConfirmOpen(false);
    }
  };

  if (role !== "admin") {
    return (
      <div className="p-6">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Access Restricted
            </CardTitle>
            <CardDescription>Only admins can use bulk order completion.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bulk Complete Order Milestones</CardTitle>
          <CardDescription>
            Select a salesman, choose orders, then mark all milestones as completed in one action.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
            <Select
              value={selectedSalesmanId}
              onValueChange={(value) => {
                setSelectedSalesmanId(value);
                void loadOrders(value);
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={isLoadingSalesmen ? "Loading salesmen..." : "Select salesman"}
                />
              </SelectTrigger>
              <SelectContent>
                {salesmen.map((salesman) => (
                  <SelectItem key={salesman.id} value={salesman.id}>
                    {salesman.name}
                    {salesman.salesmanCode ? ` (${salesman.salesmanCode})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => loadOrders(selectedSalesmanId)}
              disabled={!selectedSalesmanId || isLoadingOrders}
              className="gap-2"
            >
              {isLoadingOrders ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              Refresh Orders
            </Button>

            <Button
              onClick={() => setIsConfirmOpen(true)}
              disabled={selectedCount === 0 || isCompleting}
              className="gap-2"
            >
              {isCompleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Complete Selected ({selectedCount})
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              placeholder="Search order no, customer, status..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              disabled={!selectedSalesmanId || isLoadingOrders}
            />
          </div>

          {selectedSalesmanId && !isLoadingOrders && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">Total: {orders.length}</Badge>
              <Badge variant="outline">Showing: {filteredOrders.length}</Badge>
              <Badge variant="outline">Incomplete: {incompleteCount}</Badge>
              <Badge variant="outline">Selected: {selectedCount}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
          <CardDescription>
            {selectedSalesmanId
              ? "Use checkboxes to select orders for bulk completion."
              : "Select a salesman to load orders."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingOrders ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {selectedSalesmanId && orders.length > 0
                ? "No orders match this search."
                : selectedSalesmanId
                ? "No orders found for this salesman."
                : "Choose a salesman to view orders."}
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allRowsSelected}
                        onCheckedChange={(checked) => handleToggleAll(Boolean(checked))}
                        aria-label="Select all orders"
                      />
                    </TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Order Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Milestones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Checkbox
                          checked={Boolean(selectedOrderIds[order.id])}
                          onCheckedChange={(checked) =>
                            handleToggleRow(order.id, Boolean(checked))
                          }
                          aria-label={`Select order ${order.orderNo || order.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link
                          href={`/dashboard/orders/${order.id}`}
                          className="hover:underline text-primary"
                        >
                          {order.orderNo || order.id}
                        </Link>
                      </TableCell>
                      <TableCell>{order.customerName || "-"}</TableCell>
                      <TableCell className="capitalize">
                        {String(order.orderType || "-").replace("+", " + ")}
                      </TableCell>
                      <TableCell>{order.status || "-"}</TableCell>
                      <TableCell>{formatDateSafe(order.createdAt)}</TableCell>
                      <TableCell>
                        {order.isCompleted ? (
                          <Badge className="bg-green-600 hover:bg-green-700">Completed</Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete selected orders?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark all milestones as completed for {selectedCount} selected order(s).
              This action updates live order data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCompleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCompleteSelected} disabled={isCompleting}>
              {isCompleting ? "Completing..." : "Yes, Complete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
