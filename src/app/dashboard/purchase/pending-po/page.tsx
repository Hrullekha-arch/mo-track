

"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
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
import Link from 'next/link';
import { getPendingPoItems, createPurchaseRequestAction, PendingPoItem, PoCreationData } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const createPoSchema = z.object({
  vendor: z.string().min(1, "Vendor name is required."),
  courier: z.string().min(1, "Courier is required."),
  mode: z.enum(['AIR', 'SURFACE'], { required_error: "Mode is required." }),
  purchaseQty: z.number().min(0.01, "Quantity must be greater than 0."),
});

type CreatePoFormValues = z.infer<typeof createPoSchema>;

function CreatePoDialog({ 
    isOpen, 
    onClose, 
    item, 
    creator,
    onSuccess,
    isNewVendor
}: { 
    isOpen: boolean;
    onClose: () => void; 
    item: PendingPoItem | null; 
    creator: { id: string; name: string; } | null;
    onSuccess: () => void;
    isNewVendor: boolean;
}) {
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const { toast } = useToast();

    const form = useForm<CreatePoFormValues>({
        resolver: zodResolver(createPoSchema),
        defaultValues: { vendor: '', courier: '', mode: 'SURFACE' }
    });

    React.useEffect(() => {
        if (item) {
            form.reset({
                vendor: item.vendorName || '',
                courier: '',
                mode: 'SURFACE',
                purchaseQty: item.neededQty
            });
        }
    }, [item, form]);

    const handleSubmit = async (values: CreatePoFormValues) => {
        if (!creator || !item) {
            toast({ variant: 'destructive', title: 'Error', description: 'Missing required data to create a PO.' });
            return;
        }
        setIsSubmitting(true);
        try {
            const poData: PoCreationData = {
                vendor: values.vendor,
                courier: values.courier,
                mode: values.mode,
                item: {
                    ...item,
                    neededQty: values.purchaseQty, // Use the editable purchaseQty
                },
                isNewVendor,
            };
            const result = await createPurchaseRequestAction(poData, creator);

            if (result.success) {
                toast({ title: 'Success!', description: result.message });
                onSuccess(); // This will trigger a data refresh in the parent
                onClose();
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
    
    if (!item) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Create Purchase Order</DialogTitle>
                </DialogHeader>
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField name="vendor" control={form.control} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Vendor</FormLabel>
                                    <FormControl><Input {...field} /></FormControl>
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
                        
                        <Separator />
                        
                        <div>
                             <div className="grid grid-cols-12 px-4 py-2 font-medium text-muted-foreground text-sm">
                                <div className="col-span-1">#</div>
                                <div className="col-span-5">BCN/Item Name</div>
                                <div className="col-span-2 text-right">Stock Qty</div>
                                <div className="col-span-2 text-right">Order Qty</div>
                                <div className="col-span-2 text-right">Purchase Qty</div>
                            </div>
                            <div className="border rounded-md px-4 py-3">
                                 <div className="grid grid-cols-12 items-center">
                                    <div className="col-span-1 font-semibold">1</div>
                                    <div className="col-span-5">
                                        <p className="font-semibold text-primary">{item.collectionBrand}</p>
                                        <p className="text-sm text-muted-foreground">{item.itemName}</p>
                                        <p className="text-xs text-muted-foreground">SN: {item.serialNo}</p>
                                        <p className="text-xs text-muted-foreground capitalize">Category: {item.category}</p>
                                    </div>
                                    <div className="col-span-2 text-right font-bold text-blue-600">{item.stock.toFixed(2)}</div>
                                    <div className="col-span-2 text-right font-bold text-orange-600">{item.neededQty.toFixed(2)}</div>
                                    <div className="col-span-2 text-right font-bold">
                                        <FormField 
                                            name="purchaseQty"
                                            control={form.control}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Input 
                                                            {...field}
                                                            type="number"
                                                            className="text-right"
                                                            onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                                        />
                                                    </FormControl>
                                                     <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>
                            </div>
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

function VendorVerificationDialog({
    isOpen,
    onClose,
    onConfirm
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (isNew: boolean) => void;
}) {
    const [selection, setSelection] = React.useState<string>("");

    return (
         <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Vendor Verification</DialogTitle>
                    <DialogDescription>Is the selected vendor a new or existing vendor?</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Select value={selection} onValueChange={setSelection}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select one..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="yes">Yes (Existing Vendor)</SelectItem>
                            <SelectItem value="no">No (New Vendor)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => onConfirm(selection === 'no')} disabled={!selection}>Continue</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default function PendingPOPage() {
  const [data, setData] = React.useState<PendingPoItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [itemForPo, setItemForPo] = React.useState<PendingPoItem | null>(null);
  const [isVerificationOpen, setIsVerificationOpen] = React.useState(false);
  const [isCreatePoOpen, setIsCreatePoOpen] = React.useState(false);
  const [isNewVendor, setIsNewVendor] = React.useState(false);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const { toast } = useToast();
  const { user } = useAuth();
  
  const fetchData = React.useCallback(async () => {
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
  }, [toast]);

  React.useEffect(() => {
      fetchData();
  }, [fetchData]);

  const handleCreatePoClick = (item: PendingPoItem) => {
    setItemForPo(item);
    setIsVerificationOpen(true);
  };

  const handleVerificationConfirm = (isNew: boolean) => {
      setIsNewVendor(isNew);
      setIsVerificationOpen(false);
      setIsCreatePoOpen(true);
  }

  const columns: ColumnDef<PendingPoItem>[] = [
    { accessorKey: "orderId", header: "Order ID" },
    { accessorKey: "salesman", header: "Salesman" },
    { accessorKey: "collectionBrand", header: "Collection/Brand" },
    { accessorKey: "serialNo", header: "Serial No" },
    { accessorKey: "neededQty", header: "Order Qty" },
    { accessorKey: "vendorName", header: "Vendor Name" },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCreatePoClick(row.original)}
        >
          Create PO
        </Button>
      ),
    },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getCoreRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: {
      globalFilter,
    },
  });

  return (
    <>
    <div className="w-full p-4 md:p-6 lg:p-8">
        <header className="flex items-center justify-between mb-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">SO to PO Generation</h1>
                <p className="text-muted-foreground">Select an item to generate a Purchase Order.</p>
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
                                    <TableRow key={row.id}>
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
                 <div className="flex items-center justify-end space-x-2 py-4">
                    <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button>
                    <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button>
                </div>
            </CardContent>
        </Card>
    </div>
    <VendorVerificationDialog
        isOpen={isVerificationOpen}
        onClose={() => setIsVerificationOpen(false)}
        onConfirm={handleVerificationConfirm}
    />
    <CreatePoDialog 
        isOpen={isCreatePoOpen}
        onClose={() => setIsCreatePoOpen(false)}
        item={itemForPo}
        creator={user ? { id: user.id, name: user.name } : null}
        onSuccess={fetchData}
        isNewVendor={isNewVendor}
    />
    </>
  )
}
