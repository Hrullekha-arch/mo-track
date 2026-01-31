"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
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
import { importStockData } from "@/app/dashboard/inventory/actions";

/**
 * Updated Inventory Row Type (matches latest headers)
 * If you already updated Stock type in "@/lib/types", you can remove this and use Stock.
 */
export type InventoryItem = {
  id?: string;
  bcn: string;
  productId?: string;
  bcnDigits?: string;
  name?: string;
  itemName?: string;
  category?: string;
  categoryGroup?: string;
  isService?: boolean;
  unit?: string;
  verticalRepeatCms?: number | string;
  horizontalRepeatCms?: number | string;
  costPriceRs?: number;
  rrpWithGstRs?: number;
  hsnOrSac?: string;
  gstPercent?: number;
  supplierCompanyName?: string;
  supplierCollectionName?: string;
  supplierCollectionCode?: string;
  totalQty?: number;
  availableQty?: number;
  reservedQty?: number;
  damagedQty?: number;
  cutQty?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
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

export function StockTableClient({ initialData }: { initialData: InventoryItem[] }) {
  const withNames = initialData.map((item) => ({
    ...item,
    name: item.name || item.itemName || "",
  }));
  const [stock, setStock] = React.useState<InventoryItem[]>(withNames);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [isImporting, setIsImporting] = React.useState(false);

  const { role } = useAuth();
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isAuthorized = role === "admin";

  React.useEffect(() => {
    setStock(
      initialData.map((item) => ({
        ...item,
        name: item.name || item.itemName || "",
      }))
    );
  }, [initialData]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
          toast({
            variant: "destructive",
            title: "File Read Error",
            description: "Could not read the selected file.",
          });
          return;
        }

        const base64Data = dataUrl.split(",")[1];
        const result = await importStockData(base64Data);

        if (result.success) {
          toast({
            title: "Import Successful",
            description: `${result.count ?? 0} items have been added/updated. Refreshing...`,
          });
          setTimeout(() => window.location.reload(), 1500);
        } else {
          toast({
            variant: "destructive",
            title: "Import Failed",
            description: result.message,
            duration: 7000,
          });
        }
      } catch (error) {
        console.error("Error importing stock:", error);
        toast({
          variant: "destructive",
          title: "Import Failed",
          description: `Import error: ${(error as Error).message}`,
        });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
        setIsImporting(false);
      }
    };

    reader.readAsDataURL(file);
  };

  const columns: ColumnDef<InventoryItem>[] = [
    { accessorKey: "bcn", header: "BCN" },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="px-0"
        >
          Item Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="font-medium">{row.getValue("name") || "-"}</div>,
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => {
        const v = row.getValue("category") as string;
        return v ? <Badge variant="secondary" className="uppercase">{v}</Badge> : "-";
      },
    },
    {
      accessorKey: "categoryGroup",
      header: "Category Group",
      cell: ({ row }) => {
        const v = row.getValue("categoryGroup") as string;
        return v ? <Badge variant="outline" className="uppercase">{v}</Badge> : "-";
      },
    },
    { accessorKey: "unit", header: "Unit", cell: ({ row }) => row.getValue("unit") || "-" },
    { accessorKey: "totalQty", header: "Total Qty", cell: ({ row }) => num(row.getValue("totalQty")) },
    { accessorKey: "availableQty", header: "Available", cell: ({ row }) => num(row.getValue("availableQty")) },
    { accessorKey: "reservedQty", header: "Reserved", cell: ({ row }) => num(row.getValue("reservedQty")) },
    { accessorKey: "damagedQty", header: "Damaged", cell: ({ row }) => num(row.getValue("damagedQty")) },
    { accessorKey: "cutQty", header: "Cut", cell: ({ row }) => num(row.getValue("cutQty")) },
    { accessorKey: "supplierCompanyName", header: "Supplier", cell: ({ row }) => row.getValue("supplierCompanyName") || "-" },
    { accessorKey: "supplierCollectionName", header: "Collection", cell: ({ row }) => row.getValue("supplierCollectionName") || "-" },
    { accessorKey: "supplierCollectionCode", header: "Collection Code", cell: ({ row }) => row.getValue("supplierCollectionCode") || "-" },
    { accessorKey: "horizontalRepeatCms", header: "H Repeat (cms)", cell: ({ row }) => num(row.getValue("horizontalRepeatCms")) },
    { accessorKey: "verticalRepeatCms", header: "V Repeat (cms)", cell: ({ row }) => num(row.getValue("verticalRepeatCms")) },
    { accessorKey: "costPriceRs", header: "Cost Price (Rs)", cell: ({ row }) => money(row.getValue("costPriceRs")) },
    { accessorKey: "rrpWithGstRs", header: "RRP w/ GST (Rs)", cell: ({ row }) => money(row.getValue("rrpWithGstRs")) },
    { accessorKey: "gstPercent", header: "GST %", cell: ({ row }) => num(row.getValue("gstPercent")) },
    { accessorKey: "hsnOrSac", header: "HSN/SAC", cell: ({ row }) => row.getValue("hsnOrSac") || "-" },
    { accessorKey: "productId", header: "Product ID", cell: ({ row }) => row.getValue("productId") || "-" },
    {
      accessorKey: "isActive",
      header: "Active",
      cell: ({ row }) => {
        const active = row.getValue("isActive");
        return <Badge variant={active ? "default" : "secondary"}>{active ? "Active" : "Inactive"}</Badge>;
      },
    },
  ];

  const table = useReactTable({
    data: stock,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { sorting, columnFilters, globalFilter },
  });

  const handleExport = () => {
    const dataToExport = table.getFilteredRowModel().rows.map((row) => row.original);
    if (dataToExport.length === 0) {
      toast({ variant: "destructive", title: "No data to export" });
      return;
    }

    // Export with nice column names
    const mapped = dataToExport.map((r) => ({
      id: r.id ?? "",
      bcn: r.bcn ?? "",
      name: r.name ?? "",
      productId: r.productId ?? "",
      "Category group": r.categoryGroup ?? "",
      category: r.category ?? "",
      Unit: r.unit ?? "",
      totalQty: r.totalQty ?? "",
      availableQty: r.availableQty ?? "",
      reservedQty: r.reservedQty ?? "",
      damagedQty: r.damagedQty ?? "",
      cutQty: r.cutQty ?? "",
      "supplier company name": r.supplierCompanyName ?? "",
      "supplier collection name": r.supplierCollectionName ?? "",
      "supplier collection code": r.supplierCollectionCode ?? "",
      "Horizontal Repeat (cms)": r.horizontalRepeatCms ?? "",
      "Vertical Repeat (cms)": r.verticalRepeatCms ?? "",
      "Cost Price (Rs)": r.costPriceRs ?? "",
      "RRP with GST (Rs)": r.rrpWithGstRs ?? "",
      "GST %": r.gstPercent ?? "",
      "HSN/SAC": r.hsnOrSac ?? "",
      isActive: r.isActive ?? "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(mapped);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");

    XLSX.writeFile(workbook, `motrack_inventory_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Export Complete!" });
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center py-4 gap-4">
          <Input
            placeholder="Search by BCN or item name..."
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="max-w-sm"
          />

          <div className="ml-auto flex items-center gap-2">
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
              {isImporting ? "Importing..." : "Import from XLS"}
            </Button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".xlsx, .xls"
            />

            <Button onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="whitespace-nowrap">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-end space-x-2 py-4">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
