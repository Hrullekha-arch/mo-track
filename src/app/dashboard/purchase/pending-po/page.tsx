
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
import Link from 'next/link';
import { getPendingPoItems, createPurchaseRequestAction, PendingPoItem, PoCreationData } from "./actions";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const poGroupSchema = z.object({
    vendor: z.string(),
    courier: z.string().min(1, "Courier is required."),
    mode: z.enum(['AIR', 'SURFACE'], { required_error: "Mode is required." }),
    items: z.array(z.any()),
});

const createPoFormSchema = z.object({
  poGroup: poGroupSchema,
});

type CreatePoFormValues = z.infer<typeof createPoFormSchema>;

function CreatePoDialog({ isOpen, onClose, item, creator }: { isOpen: boolean, onClose: () => void, item: PendingPoItem | null, creator: { id: string, name: string } | null }) {
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const { toast } = useToast();
    const router = useRouter();

    const form = useForm<CreatePoFormValues>({
        resolver: zodResolver(createPoFormSchema),
        defaultValues: {
            poGroup: {
                vendor: '',
                courier: '',
                mode: 'SURFACE',
                items: [],
            }
        }
    });

    React.useEffect(() => {
        if (item) {
            form.setValue('poGroup', {
                vendor: item.vendorName || 'Unknown Vendor',
                courier: '',
                mode: 'SURFACE',
                items: [item]
            });
        }
    }, [item, form]);

    const handleSubmit = async (values: CreatePoFormValues) => {
        if (!creator) {
            toast({ variant: 'destructive', title: 'Authentication Error' });
            return;
        }
        setIsSubmitting(true);
        try {
            const result = await createPurchaseRequestAction(values.poGroup, creator);

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
    
    if (!item) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Create Purchase Order</DialogTitle>
                    <DialogDescription>
                        A PO will be created for the selected item.
                    </DialogDescription>
                </DialogHeader>
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                         <Card className="p-4 border-0 shadow-none">
                            <CardHeader className="p-0 pb-4">
                                <CardTitle className="text-base">Vendor: {form.getValues('poGroup.vendor')}</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0 space-y-4">
                                 <div className="grid grid-cols-2 gap-4">
                                    <FormField name="poGroup.courier" control={form.control} render={({ field }) => (
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
                                    <FormField name="poGroup.mode" control={form.control} render={({ field }) => (
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
                                <div className="border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Order ID</TableHead>
                                                <TableHead>BCN/Item Name</TableHead>
                                                <TableHead>Needed Qty</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            <TableRow key={item.id}>
                                                <TableCell>{item.orderId}</TableCell>
                                                <TableCell>{item.collectionBrand}</TableCell>
                                                <TableCell>{item.neededQty.toFixed(2)}</TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                        
                        <DialogFooter className="pt-2">
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Submit PO
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
  const [itemForPo, setItemForPo] = React.useState<PendingPoItem | null>(null);
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
  
  const handleCreatePoClick = (item: PendingPoItem) => {
    setItemForPo(item);
  };

  const columns: ColumnDef<PendingPoItem>[] = [
    { accessorKey: "orderId", header: "Order ID" },
    { accessorKey: "salesman", header: "Salesman" },
    { accessorKey: "collectionBrand", header: "Collection/Brand" },
    { accessorKey: "serialNo", header: "Serial No" },
    { accessorKey: "hsnCode", header: "HSN Code" },
    { accessorKey: "mrp", header: "MRP" },
    { accessorKey: "neededQty", header: "Needed Qty" },
    { accessorKey: "stock", header: "Stock" },
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
    getFilteredRowModel: getFilteredRowModel(),
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
                <p className="text-muted-foreground">Select an item to generate a Purchase Request.</p>
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
    <CreatePoDialog 
        isOpen={!!itemForPo}
        onClose={() => setItemForPo(null)}
        item={itemForPo}
        creator={user ? { id: user.id, name: user.name } : null}
    />
    </>
  )
}
