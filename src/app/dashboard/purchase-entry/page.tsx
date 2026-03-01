"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PendingPurchaseEntry } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getPendingPurchaseEntriesAction, markPendingPurchaseEntryDoneAction } from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw } from "lucide-react";

type StatusFilter = "all" | "Pending" | "Done";

const formatDateTimeIST = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
};

export default function PurchaseEntryPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [rows, setRows] = useState<PendingPurchaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Pending");

  const loadRows = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await getPendingPurchaseEntriesAction();
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load purchase entries:", error);
      toast({
        variant: "destructive",
        title: "Failed to load purchase entries",
        description: "Please refresh and try again.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadRows(false);
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const status = row.purchaseEntryStatus || row.status || "Pending";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!query) return true;

      const haystack = [
        row.poNumber,
        row.dealId,
        row.customerName,
        row.bcn,
        row.itemName,
        row.vendorName,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");

      return haystack.includes(query);
    });
  }, [rows, search, statusFilter]);

  const pendingCount = useMemo(
    () =>
      rows.filter((row) => (row.purchaseEntryStatus || row.status || "Pending") === "Pending")
        .length,
    [rows]
  );
  const doneCount = rows.length - pendingCount;

  const handleMarkDone = async (row: PendingPurchaseEntry) => {
    const entryId = String(row.id || "").trim();
    if (!entryId) {
      toast({
        variant: "destructive",
        title: "Invalid entry",
        description: "Entry id is missing.",
      });
      return;
    }

    setMarkingId(entryId);
    try {
      const result = await markPendingPurchaseEntryDoneAction({
        entryId,
        actor: {
          id: user?.id,
          name: user?.name,
          role: user?.role,
        },
      });

      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: result.message || "Could not mark purchase entry as done.",
        });
        return;
      }

      const now = new Date().toISOString();
      setRows((prev) =>
        prev.map((item) =>
          item.id === entryId
            ? {
                ...item,
                status: "Done",
                purchaseEntryStatus: "Done",
                doneAt: now,
                updatedAt: now,
                doneBy: {
                  id: user?.id,
                  name: user?.name,
                  role: user?.role,
                },
              }
            : item
        )
      );

      toast({
        title: "Purchase entry completed",
        description: `PO ${row.poNumber} / BCN ${row.bcn} is now marked done.`,
      });
    } catch (error) {
      console.error("Failed to mark purchase entry done:", error);
      toast({
        variant: "destructive",
        title: "Update failed",
        description: "Could not update the purchase entry.",
      });
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Create Purchase Entry</CardTitle>
          <CardDescription>
            Accounts desk for received PO lengths. Mark each entry done before allocation can use it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-muted-foreground">Total Entries</p>
            <p className="text-2xl font-bold">{rows.length}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-amber-700">{pendingCount}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs text-muted-foreground">Done</p>
            <p className="text-2xl font-bold text-emerald-700">{doneCount}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Purchase Entry Queue</CardTitle>
            <CardDescription>PO length records synced from inbound receiving.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={statusFilter === "Pending" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("Pending")}
            >
              Pending
            </Button>
            <Button
              variant={statusFilter === "Done" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("Done")}
            >
              Done
            </Button>
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("all")}
            >
              All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadRows(true)}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Search by PO, deal, customer, BCN, vendor..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Deal</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>BCN / Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Received At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                      Loading purchase entries...
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No purchase entries found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => {
                    const status = row.purchaseEntryStatus || row.status || "Pending";
                    const isDone = status === "Done";
                    const isBusy = markingId === row.id;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.poNumber || "-"}</TableCell>
                        <TableCell>{row.dealId || "-"}</TableCell>
                        <TableCell>{row.customerName || "-"}</TableCell>
                        <TableCell>
                          <div className="font-medium">{row.bcn || "-"}</div>
                          <div className="text-xs text-muted-foreground">{row.itemName || "-"}</div>
                        </TableCell>
                        <TableCell>
                          {Number(row.quantity || 0).toFixed(2)} {row.unit || ""}
                        </TableCell>
                        <TableCell>{formatDateTimeIST(row.receivedAt || row.createdAt)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              isDone
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }
                          >
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {isDone ? (
                            <div className="text-xs text-muted-foreground">
                              Done {row.doneBy?.name ? `by ${row.doneBy.name}` : ""}
                              <div>{formatDateTimeIST(row.doneAt || row.updatedAt)}</div>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => void handleMarkDone(row)}
                              disabled={isBusy}
                            >
                              {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              Mark Done
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

