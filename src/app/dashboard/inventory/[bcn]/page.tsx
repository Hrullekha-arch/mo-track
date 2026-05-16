"use client";

import React from "react";
import { useParams } from "next/navigation";

import {
  getStockById,
  getStockTransactions,
} from "@/app/dashboard/inventory/actions";

import { Stock, StockTransaction } from "@/lib/types";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import {
  Loader2,
  Package,
  History,
  CheckCircle2,
  AlertCircle,
  XCircle,
  BarChart3,
  Box,
  TrendingUp,
} from "lucide-react";

// ================= HELPERS =================
const formatQty = (value?: number | string | null) => {
  const num = Number(value);

  if (!Number.isFinite(num)) return "0.00";

  return num.toFixed(2);
};

const formatDate = (date: string | Date | null | undefined) => {
  if (!date) return "-";

  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ================= PAGE =================
export default function StockManagementV2() {
  const params = useParams();
  console.log("Params:", params);

  // BCN FROM URL
  const bcn = decodeURIComponent(params.bcn as string);

  console.log("BCN:", bcn);

  // STATES
  const [selected, setSelected] = React.useState<Stock | null>(null);

  const [transactions, setTransactions] = React.useState<
    StockTransaction[]
  >([]);

  const [loading, setLoading] = React.useState(true);

  // ================= LOAD STOCK =================
  React.useEffect(() => {
    const loadStock = async () => {
      if (!bcn) return;

      setLoading(true);

      try {
        // GET STOCK
        const stockData = await getStockById(bcn);

        if (!stockData) {
          setSelected(null);
          return;
        }

        // SAVE STOCK
        setSelected(stockData);

        // GET ALL TRANSACTIONS
        const txData = await getStockTransactions(
          stockData.id || stockData.bcn
        );

        setTransactions(txData || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadStock();
  }, [bcn]);

  // ================= SORT TRANSACTIONS =================
  const allTransactions = React.useMemo(() => {
    return [...transactions].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    );
  }, [transactions]);

  // ================= LOADING =================
  if (loading) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  // ================= NO STOCK =================
  if (!selected) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <div className="text-center">
          <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />

          <h2 className="text-3xl font-bold">
            Stock Not Found
          </h2>

          <p className="text-muted-foreground mt-2">
            BCN : {bcn}
          </p>
        </div>
      </div>
    );
  }

  // ================= METRICS =================
  const metrics = [
    {
      label: "Total",
      value: formatQty(selected.totalQty),
      icon: Box,
      color: "text-blue-600",
    },
    {
      label: "Available",
      value: formatQty(selected.availableQty),
      icon: CheckCircle2,
      color: "text-green-600",
    },
    {
      label: "Reserved",
      value: formatQty(selected.reservedQty),
      icon: AlertCircle,
      color: "text-orange-600",
    },
    {
      label: "Damaged",
      value: formatQty(selected.damagedQty),
      icon: XCircle,
      color: "text-red-600",
    },
    {
      label: "Cut",
      value: formatQty(selected.cutQty),
      icon: BarChart3,
      color: "text-purple-600",
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* ================= HEADER ================= */}
      <Card className="shadow-md">
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className="font-mono text-lg px-3 py-1"
                >
                  {selected.bcn}
                </Badge>

                <Badge
                  variant={
                    selected.isActive
                      ? "default"
                      : "secondary"
                  }
                >
                  {selected.isActive
                    ? "Active"
                    : "Inactive"}
                </Badge>
              </div>

              <h1 className="text-3xl font-bold mt-3">
                {selected.name || selected.itemName}
              </h1>

              <p className="text-muted-foreground mt-2">
                {selected.category} •{" "}
                {selected.categoryGroup} •{" "}
                {selected.unit}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================= METRICS ================= */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {metrics.map((m) => (
          <Card
            key={m.label}
            className="shadow-sm hover:shadow-md transition"
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">
                  {m.label}
                </p>

                <m.icon className={`h-5 w-5 ${m.color}`} />
              </div>

              <p className="text-3xl font-bold">
                {m.value}
              </p>

              <p className="text-xs text-muted-foreground mt-1">
                {selected.unit}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ================= DETAILS ================= */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>
            Stock Details
          </CardTitle>

          <CardDescription>
            Full stock information
          </CardDescription>
        </CardHeader>

        <CardContent className="grid md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-muted-foreground">
              Supplier
            </p>

            <p className="font-semibold">
              {selected.supplierCompanyName || "-"}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              Collection
            </p>

            <p className="font-semibold">
              {selected.supplierCollectionName || "-"}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              Collection Code
            </p>

            <p className="font-semibold">
              {selected.supplierCollectionCode || "-"}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              Rack
            </p>

            <p className="font-semibold">
              {selected.rack || "-"}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              GST %
            </p>

            <p className="font-semibold">
              {selected.gstPercent || 0}%
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              Cost Price
            </p>

            <p className="font-semibold">
              ₹ {selected.costPriceRs || 0}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              RRP
            </p>

            <p className="font-semibold">
              ₹ {selected.rrpWithGstRs || 0}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              HSN/SAC
            </p>

            <p className="font-semibold">
              {selected.hsnOrSac || "-"}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              Product ID
            </p>

            <p className="font-semibold">
              {selected.productId || "-"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ================= TRANSACTIONS ================= */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Stock Transactions
          </CardTitle>

          <CardDescription>
            Addition, Reservation, Release, Cut,
            Damage & All Stock Movements
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted z-10">
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left">
                      Date
                    </th>

                    <th className="px-4 py-3 text-left">
                      Type
                    </th>

                    <th className="px-4 py-3 text-right">
                      Qty
                    </th>

                    <th className="px-4 py-3 text-left">
                      Unit
                    </th>

                    <th className="px-4 py-3 text-left">
                      Order ID
                    </th>

                    <th className="px-4 py-3 text-left">
                      Customer
                    </th>

                    <th className="px-4 py-3 text-left">
                      Batch / Rack
                    </th>

                    <th className="px-4 py-3 text-left">
                      Created By
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {allTransactions.length ? (
                    allTransactions.map((tx, idx) => (
                      <tr
                        key={tx.id || idx}
                        className="border-b hover:bg-muted/40"
                      >
                        {/* DATE */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDate(tx.createdAt)}
                        </td>

                        {/* TYPE */}
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              tx.type === "addition"
                                ? "default"
                                : tx.type ===
                                  "reservation"
                                ? "destructive"
                                : tx.type ===
                                  "release"
                                ? "secondary"
                                : "outline"
                            }
                            className="gap-1"
                          >
                            {tx.type === "addition" && (
                              <TrendingUp className="h-3 w-3" />
                            )}

                            {tx.type ===
                              "reservation" && (
                              <AlertCircle className="h-3 w-3" />
                            )}

                            {tx.type === "release" && (
                              <CheckCircle2 className="h-3 w-3" />
                            )}

                            {tx.type}
                          </Badge>
                        </td>

                        {/* QTY */}
                        <td className="px-4 py-3 text-right font-semibold">
                          {tx.type === "addition" ||
                          tx.type === "release"
                            ? "+"
                            : "-"}

                          {formatQty(
                            Math.abs(
                              Number(
                                tx.quantityChange || 0
                              )
                            )
                          )}
                        </td>

                        {/* UNIT */}
                        <td className="px-4 py-3">
                          <Badge variant="outline">
                            {tx.unit ||
                              selected.unit}
                          </Badge>
                        </td>

                        {/* ORDER */}
                        <td className="px-4 py-3">
                          {tx.orderId ? (
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {tx.orderId}
                            </code>
                          ) : (
                            "-"
                          )}
                        </td>

                        {/* CUSTOMER */}
                        <td className="px-4 py-3">
                          {tx.customerName || "-"}
                        </td>

                        {/* BATCH */}
                        <td className="px-4 py-3">
                          {tx.batchNo ? (
                            <span className="text-xs">
                              Batch : {tx.batchNo}
                            </span>
                          ) : tx.rack ? (
                            <span className="text-xs">
                              Rack : {tx.rack}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>

                        {/* CREATED */}
                        <td className="px-4 py-3">
                          {tx.createdBy || "System"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center py-16"
                      >
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <History className="h-10 w-10 opacity-40" />

                          <p className="font-medium">
                            No Transactions Found
                          </p>

                          <p className="text-xs">
                            Stock movement history will
                            appear here
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}