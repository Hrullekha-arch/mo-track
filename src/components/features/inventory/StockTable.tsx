
"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, Download, MoreHorizontal, ShieldAlert, Trash2, Upload } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { collection, onSnapshot, query, doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Stock } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";

export function StockTable() {
  const [stock, setStock] = React.useState<Stock[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const { role } = useAuth();
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const isAuthorized = role === 'admin';

  React.useEffect(() => {
    const stockQuery = query(collection(db, "stocks"));
    const unsubscribe = onSnapshot(stockQuery, (snapshot) => {
      const stockData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stock));
      setStock(stockData);
      setLoading(false);
    }, (error) => {
        console.error("Error fetching stock data:", error);
        toast({
            variant: "destructive",
            title: "Error fetching stock",
            description: "Could not load stock data. Please check Firestore permissions for the 'stocks' collection."
        });
        setLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);
  
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (json.length < 2) {
            toast({ variant: "destructive", title: "Import Failed", description: "The Excel sheet is empty."});
            return;
        }

        const headers: string[] = (json[0] as string[]).map(h => h.trim().toLowerCase());
        const requiredHeaders = [
            'bcn', 'distributor collection name', 'serial no', 'hsn code', 
            'rl price', 'cl price', 'mrp', 'caterogary', 'vendor name'
        ];

        // This is a loose check. A more robust check would verify exact column positions if needed.
        const missingHeaders = requiredHeaders.filter(rh => !headers.includes(rh));
        if (missingHeaders.length > 0) {
            toast({
                variant: "destructive",
                title: "Invalid Headers",
                description: `Missing required columns: ${missingHeaders.join(', ')}`,
                duration: 7000,
            });
            return;
        }

        try {
            const batch = writeBatch(db);
            const stockItems: Stock[] = [];

            for (let i = 1; i < json.length; i++) {
                const row = json[i] as any[];
                if (!row || row.length === 0) continue; // Skip empty rows

                const stockItem: Partial<Stock> = {
                    bcn: String(row[0] || ''),
                    itemName: String(row[1] || ''), // Distributor Collection Name
                    serialNo: String(row[2] || ''),
                    hsnCode: String(row[3] || ''),
                    rlPrice: Number(row[4] || 0),
                    clPrice: Number(row[5] || 0),
                    mrp: Number(row[6] || 0),
                    category: String(row[7] || ''), // caterogary
                    vendorName: String(row[8] || ''),
                    quantity: 1, // Default quantity
                    unit: 'pcs', // Default unit
                    type: String(row[7] || 'fabric').toLowerCase(), // Use category as type
                    lastUpdatedAt: new Date().toISOString(),
                };
                
                // Use BCN as the document ID if available and unique, otherwise let Firestore generate one
                const docId = stockItem.bcn ? stockItem.bcn : doc(collection(db, 'stocks')).id;
                const stockRef = doc(db, "stocks", docId);
                batch.set(stockRef, stockItem);
                stockItems.push({ id: docId, ...stockItem } as Stock);
            }

            await batch.commit();
            
            toast({
                title: "Import Successful",
                description: `${stockItems.length} items have been added to the stock.`,
            });
        } catch (error) {
            console.error("Error importing stock:", error);
            toast({ variant: "destructive", title: "Import Failed", description: "An error occurred during the import process." });
        } finally {
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };
    reader.readAsArrayBuffer(file);
  };

  const columns: ColumnDef<Stock>[] = [
    {
      accessorKey: "bcn",
      header: "BCN",
    },
    {
      accessorKey: "itemName",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Item Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div>{row.getValue("itemName")}</div>,
    },
    {
      accessorKey: "serialNo",
      header: "Serial No",
    },
    {
      accessorKey: "vendorName",
      header: "Vendor",
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => <Badge variant="outline" className="capitalize">{row.getValue("category")}</Badge>,
    },
    {
      accessorKey: "hsnCode",
      header: "HSN Code",
    },
    {
      accessorKey: "mrp",
      header: "MRP",
      cell: ({ row }) => `₹${row.getValue("mrp")}`,
    },
    {
      accessorKey: "lastUpdatedAt",
      header: "Last Updated",
      cell: ({ row }) => new Date(row.getValue("lastUpdatedAt")).toLocaleDateString(),
    },
  ];

  const table = useReactTable({
    data: stock,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  });

  const handleExport = () => {
    const dataToExport = table.getFilteredRowModel().rows.map(row => row.original);
    if (dataToExport.length === 0) {
        toast({ variant: "destructive", title: "No data to export" });
        return;
    }
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock");
    XLSX.writeFile(workbook, `motrack_stock_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: "Export Complete!" });
  }

  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center py-4 gap-4">
          <Input
            placeholder="Filter by item name..."
            value={(table.getColumn("itemName")?.getFilterValue() as string) ?? ""}
            onChange={(event) =>
              table.getColumn("itemName")?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => fileInputRef.current?.click()} variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import from XLS
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
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-end space-x-2 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
