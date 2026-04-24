"use client";

import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { SalesmanIncentiveItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  getSalesmanConvertedOrdersAction,
  getSalesmanIncentiveOrderPreviewAction,
  getSalesmanIncentiveSalesmenAction,
  saveManualSalesmanIncentiveAction,
} from "./actions";
import type {
  SalesmanIncentiveOrderOption,
  SalesmanIncentiveOrderPreviewResult,
  SalesmanIncentiveSalesmanOption,
} from "./actions";

type LineDraft = {
  incentivePercent: string;
  incentiveAmount: string;
};

const formatInr = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const formatDate = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return format(parsed, "dd MMM yyyy");
};

const getRuleLabel = (ruleCode: SalesmanIncentiveItem["ruleCode"]) => {
  switch (ruleCode) {
    case "TASSEL":
      return "TASSEL 3%";
    case "PREFIX_ESC_ES":
      return "ESC/ES 2%";
    case "PREFIX_S_F_FS_RLM_W_WS":
      return "S/F/FS/RLM/W/WS 1%";
    default:
      return "Not Incentivable";
  }
};

const formatStockState = (item: SalesmanIncentiveItem) => {
  if (!item.requiresInStock) return "Not required";
  if (item.isInStock === true) return "In Stock";
  if (item.isInStock === false) return "Out of Stock";
  return "Pending Verification";
};

export function CreateIncentiveDialog({ effectiveFrom }: { effectiveFrom: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [loadingSalesmen, setLoadingSalesmen] = useState(false);
  const [salesmen, setSalesmen] = useState<SalesmanIncentiveSalesmanOption[]>([]);
  const [selectedSalesmanId, setSelectedSalesmanId] = useState("");

  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orders, setOrders] = useState<SalesmanIncentiveOrderOption[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<SalesmanIncentiveOrderPreviewResult | null>(null);
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>({});

  const [saving, setSaving] = useState(false);

  const resetSelectionState = () => {
    setSelectedSalesmanId("");
    setOrders([]);
    setSelectedOrderId("");
    setPreview(null);
    setLineDrafts({});
    setLoadingOrders(false);
    setLoadingPreview(false);
    setSaving(false);
  };

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetSelectionState();
      return;
    }

    if (salesmen.length > 0 || loadingSalesmen) return;

    setLoadingSalesmen(true);
    try {
      const salesmanOptions = await getSalesmanIncentiveSalesmenAction();
      setSalesmen(salesmanOptions);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to load salesmen",
        description: error?.message || "Could not fetch salesman list.",
      });
    } finally {
      setLoadingSalesmen(false);
    }
  };

  const handleSalesmanChange = async (salesmanId: string) => {
    setSelectedSalesmanId(salesmanId);
    setOrders([]);
    setSelectedOrderId("");
    setPreview(null);
    setLineDrafts({});

    if (!salesmanId) return;

    setLoadingOrders(true);
    try {
      const result = await getSalesmanConvertedOrdersAction({ salesmanId });
      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Failed to load orders",
          description: result.message || "Could not fetch converted orders.",
        });
        return;
      }
      setOrders(result.orders);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to load orders",
        description: error?.message || "Could not fetch converted orders.",
      });
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleOrderChange = async (orderId: string) => {
    setSelectedOrderId(orderId);
    setPreview(null);
    setLineDrafts({});

    if (!orderId || !selectedSalesmanId) return;

    setLoadingPreview(true);
    try {
      const result = await getSalesmanIncentiveOrderPreviewAction({
        salesmanId: selectedSalesmanId,
        orderId,
      });

      if (!result.success || !result.data) {
        toast({
          variant: "destructive",
          title: "Failed to build preview",
          description: result.message || "Could not build incentive preview.",
        });
        return;
      }

      const previewOrder = result.data.order;
      const nextDrafts: Record<string, LineDraft> = {};
      for (const line of previewOrder.fabricDetails) {
        nextDrafts[line.lineId] = {
          incentivePercent: String(line.incentivePercent ?? 0),
          incentiveAmount: String(line.incentiveAmount ?? 0),
        };
      }

      setLineDrafts(nextDrafts);
      setPreview(result.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to build preview",
        description: error?.message || "Could not build incentive preview.",
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleLineDraftChange = (
    lineId: string,
    field: keyof LineDraft,
    value: string
  ) => {
    setLineDrafts((previous) => ({
      ...previous,
      [lineId]: {
        incentivePercent: previous[lineId]?.incentivePercent ?? "0",
        incentiveAmount: previous[lineId]?.incentiveAmount ?? "0",
        [field]: value,
      },
    }));
  };

  const editableTotalAmount = useMemo(() => {
    if (!preview) return 0;
    return preview.order.fabricDetails.reduce((sum, line) => {
      const draftValue = Number(lineDrafts[line.lineId]?.incentiveAmount ?? line.incentiveAmount ?? 0);
      return sum + (Number.isFinite(draftValue) ? draftValue : 0);
    }, 0);
  }, [lineDrafts, preview]);

  const handleSave = async () => {
    if (!preview || !selectedSalesmanId || !selectedOrderId) {
      toast({ variant: "destructive", title: "Select salesman and order first." });
      return;
    }

    setSaving(true);
    try {
      const lineEdits = preview.order.fabricDetails.map((line) => ({
        lineId: line.lineId,
        incentivePercent: lineDrafts[line.lineId]?.incentivePercent ?? line.incentivePercent,
        incentiveAmount: lineDrafts[line.lineId]?.incentiveAmount ?? line.incentiveAmount,
      }));

      const result = await saveManualSalesmanIncentiveAction({
        salesmanId: selectedSalesmanId,
        orderId: selectedOrderId,
        lineEdits,
        actor: {
          id: user?.id,
          name: user?.name,
        },
      });

      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Save failed",
          description: result.message,
        });
        return;
      }

      toast({ title: "Incentive saved", description: result.message });
      setOpen(false);
      resetSelectionState();
      router.refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error?.message || "Unable to save incentive details.",
      });
    } finally {
      setSaving(false);
    }
  };

  const isBusy = loadingSalesmen || loadingOrders || loadingPreview || saving;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Incentive
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] w-[1240px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Create Manual Incentive</DialogTitle>
          <DialogDescription>
            Select a salesman, then choose a converted order after {formatDate(effectiveFrom)}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Salesman</Label>
            <Select value={selectedSalesmanId} onValueChange={handleSalesmanChange}>
              <SelectTrigger>
                <SelectValue placeholder={loadingSalesmen ? "Loading salesmen..." : "Select salesman"} />
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
          </div>

          <div className="space-y-2">
            <Label>Converted Order (after {formatDate(effectiveFrom)})</Label>
            <Select
              value={selectedOrderId}
              onValueChange={handleOrderChange}
              disabled={!selectedSalesmanId || loadingOrders}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !selectedSalesmanId
                      ? "Select salesman first"
                      : loadingOrders
                        ? "Loading orders..."
                        : "Select converted order"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {orders.map((order) => (
                  <SelectItem key={order.orderId} value={order.orderId}>
                    {order.orderId}
                    {order.incentiveExists ? " (Already Exists)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!selectedSalesmanId && (
          <p className="text-sm text-muted-foreground">
            Choose a salesman to view eligible converted orders.
          </p>
        )}

        {selectedSalesmanId && !loadingOrders && orders.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No converted orders found for this salesman after {formatDate(effectiveFrom)}.
          </p>
        )}

        <div className="flex-1 overflow-auto border rounded-md">
          {loadingPreview ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Building incentive preview...
            </div>
          ) : !preview ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
              Select an order to auto-calculate item-wise incentive. You can then edit percentage and
              amount before saving.
            </div>
          ) : (
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap gap-3 text-sm">
                <Badge variant="secondary">{preview.order.orderId}</Badge>
                <span>Customer: {preview.order.customerSnapshot?.name || "-"}</span>
                <span>Order Date: {formatDate(preview.order.orderDate || preview.order.createdAt)}</span>
                <span className="font-medium">Editable Total: {formatInr(editableTotalAmount)}</span>
              </div>

              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Rule</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Discount %</TableHead>
                      <TableHead className="text-right">Total Rate</TableHead>
                      <TableHead>In Stock</TableHead>
                      <TableHead className="text-right">Incentive %</TableHead>
                      <TableHead className="text-right">Incentive Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.order.fabricDetails.map((line) => (
                      <TableRow key={`${preview.order.orderId}-${line.lineId}`}>
                        <TableCell>
                          <div className="font-medium">{line.itemName || line.bcn || "-"}</div>
                          {line.bcn && (
                            <div className="text-xs text-muted-foreground mt-1">{line.bcn}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={line.isIncentivable ? "default" : "outline"}>
                            {getRuleLabel(line.ruleCode)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{line.qty}</TableCell>
                        <TableCell className="text-right">{formatInr(line.rate)}</TableCell>
                        <TableCell className="text-right">{line.discountPercent ?? 0}%</TableCell>
                        <TableCell className="text-right">{formatInr(line.totalItemRate)}</TableCell>
                        <TableCell>{formatStockState(line)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-8 text-right w-28 ml-auto"
                            value={lineDrafts[line.lineId]?.incentivePercent ?? "0"}
                            onChange={(event) =>
                              handleLineDraftChange(
                                line.lineId,
                                "incentivePercent",
                                event.target.value
                              )
                            }
                            disabled={!line.isIncentivable || saving}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-8 text-right w-32 ml-auto"
                            value={lineDrafts[line.lineId]?.incentiveAmount ?? "0"}
                            onChange={(event) =>
                              handleLineDraftChange(
                                line.lineId,
                                "incentiveAmount",
                                event.target.value
                              )
                            }
                            disabled={!line.isIncentivable || saving}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isBusy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!preview || isBusy}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Incentive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
