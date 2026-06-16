"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Download, Loader2, Upload } from "lucide-react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { getAllStockForExportAction, importStockData } from "@/app/dashboard/inventory/actions";

export type InventoryItem = {
  id?: string;
  bcn: string;
  name?: string;
  category?: string;
  categoryGroup?: string;
  unit?: string;
  totalQty?: number;
  availableQty?: number;
  reservedQty?: number;
  damagedQty?: number;
  cutQty?: number;
  supplierCompanyName?: string;
  rrpWithGstRs?: number;
  gstPercent?: number;
  hsnOrSac?: string;
  isActive?: boolean;
  zohoItemId?: string;
  zohoId?: string;
  zohoAvailableQty?: number | null;
};

const money = (v: any) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return `Rs ${n.toLocaleString("en-IN")}`;
};

const num = (v: any) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("en-IN");
};

export function StockTableClient({
  initialData,
  initialLastDocId,
  totalCount,
}: {
  initialData: InventoryItem[];
  initialLastDocId: string | null;
  totalCount: number;
}) {
  const [data, setData] = React.useState(initialData);
  const [lastDocId, setLastDocId] =
    React.useState<string | null>(initialLastDocId);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [loadingInitial, setLoadingInitial] = React.useState(false);
  const [loadMessage, setLoadMessage] = React.useState("");
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [isImporting, setIsImporting] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [loadingZohoAvailability, setLoadingZohoAvailability] = React.useState(false);

  const { role } = useAuth();
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isAuthorized = role === "admin";

  const loadZohoAvailability = React.useCallback(async (items: InventoryItem[]) => {
    const lookups = items
      .filter((item) => item.bcn)
      .map((item) => ({
        key: item.id || item.bcn,
        bcn: item.bcn,
        name: item.name,
        zohoItemId: item.zohoItemId || item.zohoId,
      }));

    if (!lookups.length) return;

    setLoadingZohoAvailability(true);
    try {
      const response = await fetch("/api/zoho/items/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lookups }),
      });
      if (!response.ok) throw new Error("Zoho availability request failed.");

      const result = await response.json();
      const availability = new Map<string, number | null>(
        (Array.isArray(result.items) ? result.items : []).map((item: any) => [
          String(item.key),
          item.availableQty === null || item.availableQty === undefined
            ? null
            : Number(item.availableQty),
        ])
      );

      setData((current) =>
        current.map((item) => {
          const key = String(item.id || item.bcn);
          if (!availability.has(key)) return item;
          return { ...item, zohoAvailableQty: availability.get(key) };
        })
      );
    } catch (error) {
      console.error("Zoho availability load error:", error);
    } finally {
      setLoadingZohoAvailability(false);
    }
  }, []);

  const loadInitial = React.useCallback(async () => {
    setLoadingInitial(true);
    setLoadMessage("");
    try {
      const res = await fetch("/api/stocks", { cache: "no-store" });
      const result = await res.json();
      if (result.timedOut) {
        setLoadMessage("Firestore is throttling stock reads. Wait a moment and retry.");
        return;
      }
      const items = Array.isArray(result.items) ? result.items : [];
      setData(items);
      setLastDocId(result.lastDocId || null);
      setLoadMessage(items.length ? "" : "No stock rows returned.");
      void loadZohoAvailability(items);
    } catch (error) {
      console.error("Initial stock load error:", error);
      setLoadMessage("Could not load stock. Retry in a moment.");
    } finally {
      setLoadingInitial(false);
    }
  }, [loadZohoAvailability]);

  React.useEffect(() => {
    if (initialData.length === 0) {
      void loadInitial();
    } else {
      void loadZohoAvailability(initialData);
    }
  }, [initialData, loadInitial, loadZohoAvailability]);

  // 🔎 simple client filter (optional small filtering)
  const filteredData = React.useMemo(() => {
    if (!globalFilter) return data;
    return data.filter(
      (item) =>
        item.bcn?.toLowerCase().includes(globalFilter.toLowerCase()) ||
        item.name?.toLowerCase().includes(globalFilter.toLowerCase())
    );
  }, [data, globalFilter]);

  const columns: ColumnDef<InventoryItem>[] = [
    { accessorKey: "bcn", header: "BCN" },
    {
      accessorKey: "name",
      header: "Item Name",
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name") || "-"}</div>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => {
        const v = row.getValue("category") as string;
        return v ? (
          <Badge variant="secondary" className="uppercase">
            {v}
          </Badge>
        ) : (
          "-"
        );
      },
    },
    { accessorKey: "unit", header: "Unit" },
    { accessorKey: "totalQty", header: "Total Qty", cell: ({ row }) => num(row.getValue("totalQty")) },
    { accessorKey: "availableQty", header: "Available", cell: ({ row }) => num(row.getValue("availableQty")) },
    {
      accessorKey: "zohoAvailableQty",
      header: "Zoho Available",
      cell: ({ row }) => {
        const value = row.original.zohoAvailableQty;
        if (value === undefined && loadingZohoAvailability) {
          return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
        }
        return value === null || value === undefined ? "-" : num(value);
      },
    },
    { accessorKey: "reservedQty", header: "Reserved", cell: ({ row }) => num(row.getValue("reservedQty")) },
    { accessorKey: "damagedQty", header: "Damaged", cell: ({ row }) => num(row.getValue("damagedQty")) },
    { accessorKey: "cutQty", header: "Cut", cell: ({ row }) => num(row.getValue("cutQty")) },
    { accessorKey: "supplierCompanyName", header: "Supplier" },
    { accessorKey: "rrpWithGstRs", header: "RRP (Rs)", cell: ({ row }) => money(row.getValue("rrpWithGstRs")) },
    { accessorKey: "gstPercent", header: "GST %", cell: ({ row }) => num(row.getValue("gstPercent")) },
    { accessorKey: "hsnOrSac", header: "HSN/SAC" },
    {
      accessorKey: "isActive",
      header: "Active",
      cell: ({ row }) => {
        const active = row.getValue("isActive");
        return (
          <Badge variant={active ? "default" : "secondary"}>
            {active ? "Active" : "Inactive"}
          </Badge>
        );
      },
    },
  ];

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // 📥 LOAD MORE (Server Pagination)
  const loadMore = async () => {
    if (!lastDocId) return;

    setLoadingMore(true);

    try {
      const res = await fetch(`/api/stocks?lastDocId=${lastDocId}`);
      const result = await res.json();
      const newItems = Array.isArray(result.items) ? result.items : [];

      setData((prev) => [...prev, ...newItems]);
      setLastDocId(result.lastDocId);
      void loadZohoAvailability(newItems);
    } catch (error) {
      console.error("Load more error:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  // 📤 EXPORT
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const allStock = await getAllStockForExportAction();

      if (allStock.length === 0) {
        toast({ variant: "destructive", title: "No data to export" });
        return;
      }

      const exportRows = allStock.map((item) => ({
        BCN: item.bcn || item.id || "",
        "Item Name": item.name || (item as any).itemName || "",
        Category: item.category || "",
        "Category Group": item.categoryGroup || "",
        Unit: item.unit || "",
        "Total Qty": Number(item.totalQty ?? item.quantity ?? item.closingstock ?? 0),
        Available: Number(item.availableQty ?? 0),
        Reserved: Number(item.reservedQty ?? 0),
        Damaged: Number(item.damagedQty ?? 0),
        Cut: Number(item.cutQty ?? 0),
        Supplier: item.supplierCompanyName || (item as any).vendorName || "",
        "RRP (Rs)": Number(item.rrpWithGstRs ?? 0) || "",
        "GST %": Number(item.gstPercent ?? (item as any).tax ?? 0) || "",
        "HSN/SAC": item.hsnOrSac || (item as any).hsnCode || "",
        Active: item.isActive === false ? "Inactive" : "Active",
        Rack: item.rack || "",
        "Created At": item.createdAt || "",
        "Updated At": item.updatedAt || item.lastUpdatedAt || "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");

      XLSX.writeFile(
        workbook,
        `motrack_inventory_${new Date().toISOString().split("T")[0]}.xlsx`
      );

      toast({ title: "Export Complete!", description: `${allStock.length} stock item(s) exported.` });
    } catch (error) {
      console.error("Stock export error:", error);
      toast({ variant: "destructive", title: "Export failed" });
    } finally {
      setIsExporting(false);
    }
  };

  // 📥 IMPORT
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const dataUrl = e.target?.result as string;
        const base64Data = dataUrl.split(",")[1];
        const result = await importStockData(base64Data);

        if (result.success) {
          toast({
            title: "Import Successful",
            description: `${result.count ?? 0} items updated`,
          });
          window.location.reload();
        } else {
          toast({
            variant: "destructive",
            title: "Import Failed",
            description: result.message,
          });
        }
      } finally {
        setIsImporting(false);
      }
    };

    reader.readAsDataURL(file);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* SEARCH + ACTIONS */}
        <div className="flex items-center gap-4">
          <Input
            placeholder="Search by BCN or item name..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="max-w-sm"
          />

          <div className="ml-auto flex gap-2">
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              disabled={!isAuthorized || isImporting}
            >
              {isImporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Import
            </Button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".xlsx, .xls"
            />

            <Button onClick={() => { void handleExport(); }} disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isExporting ? "Exporting..." : "Export"}
            </Button>
          </div>
        </div>

        {/* TABLE */}
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody>
              {table.getRowModel().rows.length > 0 ? table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-28 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-muted-foreground">{loadMessage || "Stock rows are not loaded."}</p>
                      <Button onClick={loadInitial} disabled={loadingInitial} variant="outline">
                        {loadingInitial && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {loadingInitial ? "Loading..." : "Retry"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {loadingInitial && (
          <div className="flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* LOAD MORE */}
        {lastDocId && (!totalCount || data.length < totalCount) && (
          <div className="flex justify-center">
            <Button
              onClick={loadMore}
              disabled={loadingMore}
              variant="outline"
            >
              {loadingMore && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Load More
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
