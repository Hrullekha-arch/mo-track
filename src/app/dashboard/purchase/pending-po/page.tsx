
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const columns: ColumnDef<PendingPoItem>[] = [
    {
      id: "select",
      header: ({ table }) => ( <Checkbox checked={table.getIsAllPageRowsSelected()} onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)} aria-label="Select all" /> ),
      cell: ({ row }) => ( <Checkbox checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(!!value)} aria-label="Select row" /> ),
      enableSorting: false,
      enableHiding: false,
    },
    { accessorKey: "orderId", header: "Order ID" },
    { accessorKey: "collectionBrand", header: "Collection/Brand" },
    { accessorKey: "serialNo", header: "Serial No" },
    { accessorKey: "hsnCode", header: "HSN Code" },
    { accessorKey: "mrp", header: "MRP" },
    { accessorKey: "neededQty", header: "Needed Qty" },
    { accessorKey: "stock", header: "Stock" },
    { accessorKey: "vendorName", header: "Vendor Name" },
  ];

const createPoSchema = z.object({
    vendor: z.string().optional(),
    courier: z.string().min(1, "Courier is required."),
    mode: z.enum(['AIR', 'SURFACE'], { required_error: "Mode is required." }),
});

type CreatePoFormValues = z.infer<typeof createPoSchema>;

function CreatePoDialog({ isOpen, onClose, selectedItems, creator }: { isOpen: boolean, onClose: () => void, selectedItems: PendingPoItem[], creator: { id: string, name: string } | null }) {
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const { toast } = useToast();
    const router = useRouter();

    const form = useForm<CreatePoFormValues>({
        resolver: zodResolver(createPoSchema),
        defaultValues: {
            vendor: selectedItems[0]?.vendorName || "",
        }
    });
    
    React.useEffect(() => {
        if (selectedItems.length > 0) {
            form.setValue('vendor', selectedItems[0]?.vendorName || "");
        }
    }, [selectedItems, form]);

    const handleSubmit = async (values: CreatePoFormValues) => {
        if (!creator) {
            toast({ variant: 'destructive', title: 'Authentication Error' });
            return;
        }
        setIsSubmitting(true);
        try {
            const result = await createPurchaseRequestAction(selectedItems, creator, values);

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
            onClose();
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Create Purchase Order</DialogTitle>
                </DialogHeader>
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
                        <div className="grid grid-cols-3 gap-4">
                            <FormField name="vendor" control={form.control} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Vendor</FormLabel>
                                    <FormControl><Input {...field} readOnly /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField name="courier" control={form.control} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Courier</FormLabel>
                                     <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Select Courier" /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="S M COURIER">S M COURIER</SelectItem>
                                            <SelectItem value="NITCO LOGISTICS PVT LTD">NITCO LOGISTICS PVT LTD</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField name="mode" control={form.control} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Mode</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Select Mode" /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="AIR">AIR</SelectItem>
                                            <SelectItem value="SURFACE">SURFACE</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                        </div>

                        <div className="border rounded-md max-h-60 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>Order ID</TableHead>
                                        <TableHead>BCN/Item Name</TableHead>
                                        <TableHead>Needed Qty</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {selectedItems.map((item, index) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell>{item.orderId}</TableCell>
                                            <TableCell>{item.collectionBrand}</TableCell>
                                            <TableCell>{item.neededQty}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        
                        <DialogFooter className="pt-4">
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Submit
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}

export default function PendingPOPage() {
  const [data, setData] = React.useState<PendingPoItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const { toast } = useToast();
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
  
  const handleProceedClick = () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    if (selectedRows.length === 0) {
        toast({ variant: 'destructive', title: 'No Items Selected', description: 'Please select items to proceed.' });
        return;
    }
    const vendors = new Set(selectedRows.map(row => row.original.vendorName));
    if (vendors.size > 1) {
        toast({ variant: 'destructive', title: 'Multiple Vendors Selected', description: 'Please select items from only one vendor to create a PO.' });
        return;
    }
    setIsDialogOpen(true);
  };
  
  const selectedItems = table.getFilteredSelectedRowModel().rows.map(row => row.original);

  return (
    <>
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
                        <Button variant="outline" onClick={() => table.toggleAllPageRowsSelected(false)}>Cancel</Button>
                        <Button onClick={handleProceedClick}>Proceed To PO</Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
    <CreatePoDialog 
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        selectedItems={selectedItems}
        creator={user ? { id: user.id, name: user.name } : null}
    />
    </>
  )
}
