
"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import Link from 'next/link';
import { getPendingPoItems, createPurchaseRequestAction, PendingPoItem } from "./actions";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


const columns: ColumnDef<PendingPoItem>[] = [
    {
      id: "select",
      header: ({ table }) => ( <Checkbox checked={table.getIsAllPageRowsSelected()} onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)} aria-label="Select all" /> ),
      cell: ({ row }) => ( <Checkbox checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(!!value)} aria-label="Select row" /> ),
      enableSorting: false,
      enableHiding: false,
    },
    { accessorKey: "collectionBrand", header: "Collection/Brand" },
    { accessorKey: "serialNo", header: "Serial No" },
    { accessorKey: "hsnCode", header: "HSN Code" },
    { accessorKey: "mrp", header: "MRP" },
    { accessorKey: "totalOrderQty", header: "Total Order Qty" },
    { accessorKey: "stock", header: "Stock" },
    { accessorKey: "vendorName", header: "Vendor Name" },
  ];


export default function PendingPOPage() {
  const [data, setData] = React.useState<PendingPoItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useAuth();

  React.useEffect(() => {
      const fetchData = async () => {
          setLoading(true);
          try {
              const items = await getPendingPoItems();
              setData(items);
          } catch (error) {
              console.error("Failed to fetch pending PO items:", error);
              toast({
                  variant: "destructive",
                  title: "Error",
                  description: "Could not load data for pending purchase orders.",
              });
          } finally {
              setLoading(false);
          }
      };
      fetchData();
  }, [toast]);


  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: {
      globalFilter,
    },
  });
  
  const handleProceed = async () => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Authentication Error' });
      return;
    }
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    if (selectedRows.length === 0) {
      toast({ variant: 'destructive', title: 'No Items Selected', description: 'Please select items to proceed.' });
      return;
    }
    
    setIsSubmitting(true);
    try {
      const selectedItems = selectedRows.map(row => row.original);
      const result = await createPurchaseRequestAction(selectedItems, { id: user.id, name: user.name });

      if (result.success) {
        toast({ title: 'Success!', description: result.message });
        router.push('/dashboard/purchase');
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full p-4 md:p-6 lg:p-8">
        <header className="flex items-center justify-between mb-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Pending Purchase Order Report</h1>
                <p className="text-muted-foreground">Select items to generate a Purchase Order.</p>
            </div>
            <Button variant="outline" asChild>
                <Link href="/dashboard/purchase">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Purchases
                </Link>
            </Button>
        </header>
        
        <Card>
            <CardContent className="p-4">
                 <div className="flex items-center py-4">
                    <div className="relative flex-grow">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search in table..."
                            value={globalFilter}
                            onChange={(event) => setGlobalFilter(event.target.value)}
                            className="w-full max-w-sm pl-9"
                        />
                    </div>
                </div>

                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                <TableHead key={header.id}>
                                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                </TableHead>
                                ))}
                            </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={columns.length} className="h-24 text-center">
                                       <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={columns.length} className="h-24 text-center">
                                    No items require purchasing at this time.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                 <div className="flex items-center justify-between space-x-2 py-4">
                    <div className="flex-1 text-sm text-muted-foreground">
                        {table.getFilteredSelectedRowModel().rows.length} of{" "}
                        {table.getFilteredRowModel().rows.length} row(s) selected.
                    </div>
                     <div className="space-x-2">
                        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                               <Button disabled={isSubmitting || table.getFilteredSelectedRowModel().rows.length === 0}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Proceed To PO
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will create a new Purchase Request with {table.getFilteredSelectedRowModel().rows.length} item(s). This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleProceed}>Continue</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
  )
}
