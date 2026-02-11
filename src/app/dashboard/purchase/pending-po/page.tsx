

"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  RowSelectionState,
} from "@tanstack/react-table";
import { ArrowLeft, Search, Loader2, Calendar as CalendarIcon, Trash2 } from "lucide-react";
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
import { getPendingPoItems, createPurchaseOrderAction, PendingPoItem, PoCreationData, getQuotationDialogData, deletePurchaseOrderAction } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { QuotationDetailDialog } from "@/components/features/order-management/QuotationDetailDialog";
import { getSalesmen } from "@/app/dashboard/customers/actions";
import { Quotation, Deal, User, Cpd } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const createPoSchema = z.object({
  vendor: z.string().min(1, "Vendor name is required."),
  courier: z.string().min(1, "Courier is required."),
  mode: z.enum(['AIR', 'SURFACE'], { required_error: "Mode is required." }),
  items: z.array(z.object({
    id: z.string(),
    purchaseQty: z.number().min(0.01, "Quantity must be > 0."),
  })),
  promiseDeliveryDate: z.date({ required_error: "Promise delivery date is required." }),
});

type CreatePoFormValues = z.infer<typeof createPoSchema>;

function CreatePoDialog({ 
    isOpen, 
    onClose, 
    items, 
    creator,
    onSuccess,
    isNewVendor
}: { 
    isOpen: boolean;
    onClose: () => void; 
    items: PendingPoItem[]; 
    creator: { id: string; name: string; } | null;
    onSuccess: () => void;
    isNewVendor: boolean;
}) {
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const { toast } = useToast();

    const form = useForm<CreatePoFormValues>({
        resolver: zodResolver(createPoSchema),
        defaultValues: { vendor: '', courier: '', mode: 'SURFACE', items: [] }
    });
    
    const { control, handleSubmit, register } = form;

    React.useEffect(() => {
        if (items.length > 0) {
            form.reset({
                vendor: items[0].vendorName || '',
                courier: '',
                mode: 'SURFACE',
                items: items.map(item => ({ id: item.id, purchaseQty: item.neededQty })),
                promiseDeliveryDate: undefined,
            });
        }
    }, [items, form]);

    const onSubmit = async (values: CreatePoFormValues) => {
        if (!creator || items.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Missing required data to create a PO.' });
            return;
        }
        setIsSubmitting(true);
        try {
            const poData: PoCreationData = {
                vendor: values.vendor,
                courier: values.courier,
                mode: values.mode,
                items: items.map(originalItem => {
                    const formItem = values.items.find(i => i.id === originalItem.id);
                    return {
                        ...originalItem,
                        neededQty: formItem?.purchaseQty || originalItem.neededQty,
                    };
                }),
                isNewVendor,
                promiseDeliveryDate: values.promiseDeliveryDate?.toISOString(),
            };
            const result = await createPurchaseOrderAction(poData, creator);

            if (result.success) {
                toast({ title: 'Success!', description: result.message });
                onSuccess();
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
    
    if (!items || items.length === 0) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Create Purchase Order</DialogTitle>
                </DialogHeader>
                 <Form {...form}>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <FormField name="vendor" control={control} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Vendor</FormLabel>
                                    <FormControl><Input {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                             <FormField name="courier" control={control} render={({ field }) => (
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
                            <FormField name="mode" control={control} render={({ field }) => (
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
                            <FormField
                                control={control}
                                name="promiseDeliveryDate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Promise Delivery Date*</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                        variant={"outline"}
                                                        className={cn(
                                                            "w-full pl-3 text-left font-normal",
                                                            !field.value && "text-muted-foreground"
                                                        )}
                                                    >
                                                        {field.value ? (
                                                            format(field.value, "PPP")
                                                        ) : (
                                                            <span>Pick a date</span>
                                                        )}
                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={field.value}
                                                    onSelect={field.onChange}
                                                    disabled={(date) => date < new Date()}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        
                        <Separator />
                        
                        <Table>
                             <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>BCN/Item Name</TableHead>
                                    <TableHead>Needed</TableHead>
                                    <TableHead>In Stock</TableHead>
                                    <TableHead className="w-40">Purchase Qty</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item, index) => (
                                    <TableRow key={item.id}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>
                                            <p className="font-semibold">{item.collectionBrand}</p>
                                            <p className="text-xs text-muted-foreground">{item.itemName}</p>
                                        </TableCell>
                                        <TableCell>{item.neededQty.toFixed(2)}</TableCell>
                                        <TableCell>{item.stock.toFixed(2)}</TableCell>
                                        <TableCell>
                                            <FormField
                                                name={`items.${index}.purchaseQty`}
                                                control={control}
                                                render={({ field }) => (
                                                    <Input
                                                        {...field}
                                                        type="number"
                                                        onChange={e => field.onChange(parseFloat(e.target.value))}
                                                    />
                                                )}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

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
  const [isVerificationOpen, setIsVerificationOpen] = React.useState(false);
  const [isCreatePoOpen, setIsCreatePoOpen] = React.useState(false);
  const [isDeletePoOpen, setIsDeletePoOpen] = React.useState(false);
  const [isNewVendor, setIsNewVendor] = React.useState(false);
  const [deletePoNumber, setDeletePoNumber] = React.useState("");
  const [isDeletingPo, setIsDeletingPo] = React.useState(false);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [selectedQuotation, setSelectedQuotation] = React.useState<Quotation | null>(null);
  const [selectedDeal, setSelectedDeal] = React.useState<Deal | null>(null);
  const [salesmen, setSalesmen] = React.useState<User[]>([]);
  const [cpds, setCpds] = React.useState<Cpd[]>([]);
  const [isDialogLoading, setIsDialogLoading] = React.useState(false);
  
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
      getSalesmen().then(setSalesmen);
  }, [fetchData]);

  const handleCreatePoClick = () => {
    setIsVerificationOpen(true);
  };

  const handleVerificationConfirm = (isNew: boolean) => {
      setIsNewVendor(isNew);
      setIsVerificationOpen(false);
      setIsCreatePoOpen(true);
  }

  const handleDeletePo = React.useCallback(async () => {
    const poNumber = deletePoNumber.trim();
    if (!poNumber) {
      toast({ variant: "destructive", title: "Missing PO Number", description: "Enter a PO number to delete." });
      return;
    }
    if (!user?.id || !isAdmin) {
      toast({ variant: "destructive", title: "Unauthorized", description: "Only admin can delete a PO." });
      return;
    }

    setIsDeletingPo(true);
    try {
      const result = await deletePurchaseOrderAction(poNumber, { id: user.id, name: user.name });
      if (result.success) {
        toast({ title: "PO Deleted", description: result.message });
        setIsDeletePoOpen(false);
        setDeletePoNumber("");
        await fetchData();
        setRowSelection({});
      } else {
        toast({ variant: "destructive", title: "Delete Failed", description: result.message });
      }
    } catch (error: any) {
      console.error("Failed to delete PO:", error);
      toast({ variant: "destructive", title: "Delete Failed", description: error?.message || "Something went wrong." });
    } finally {
      setIsDeletingPo(false);
    }
  }, [deletePoNumber, fetchData, isAdmin, toast, user]);

  const handleQuotationClick = async (dealId: string, quotationNo: string) => {
    if (!dealId || !quotationNo) return;
    setIsDialogLoading(true);
    setSelectedQuotation(null);

    try {
        const result = await getQuotationDialogData(dealId, quotationNo);
        if (result) {
            setSelectedQuotation(result.quotation);
            setSelectedDeal(result.deal);
            setCpds(result.cpds);
        } else {
            toast({ variant: 'destructive', title: 'Quotation not found' });
        }
    } catch (error) {
        console.error("Error fetching quotation details:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch quotation details.' });
    } finally {
        setIsDialogLoading(false);
    }
  };

  const columns: ColumnDef<PendingPoItem>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: "quotationNo",
      header: "Quotation No",
      cell: ({ row }) => {
        const quotationNo = row.original.quotationNo;
        const dealId = row.original.dealId;
        return (
          <Button
            variant="link"
            className="p-0 h-auto font-medium"
            onClick={() => handleQuotationClick(dealId, quotationNo)}
          >
            {quotationNo}
          </Button>
        );
      },
    },
    { accessorKey: "customerName", header: "Customer Name" },
    { accessorKey: "salesman", header: "Salesman" },
    { accessorKey: "collectionBrand", header: "BCN" },
    { accessorKey: "itemName", header: "Item Name" },
    { accessorKey: "neededQty", header: "Order Qty" },
    { accessorKey: "vendorName", header: "Vendor Name" },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    state: {
        globalFilter,
        rowSelection
    },
  });

  const selectedItems = table.getFilteredSelectedRowModel().rows.map(row => row.original);
  
  const canCreatePo = React.useMemo(() => {
    if (selectedItems.length === 0) return false;
    const firstVendor = selectedItems[0].vendorName;
    if (!firstVendor) return false; // Can't create PO for items without a vendor
    return selectedItems.every(item => item.vendorName === firstVendor);
  }, [selectedItems]);

  return (
    <>
    <TooltipProvider>
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
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="ml-auto"> {/* Wrapper div for tooltip */}
                                <Button onClick={handleCreatePoClick} disabled={!canCreatePo}>
                                    Create PO for Selected ({selectedItems.length})
                                </Button>
                            </div>
                        </TooltipTrigger>
                        {!canCreatePo && selectedItems.length > 0 && (
                            <TooltipContent>
                                <p>Select items from the same vendor to create a bulk PO.</p>
                            </TooltipContent>
                        )}
                    </Tooltip>
                    {isAdmin && (
                      <Button
                        variant="destructive"
                        className="ml-2"
                        onClick={() => setIsDeletePoOpen(true)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete PO
                      </Button>
                    )}
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
                 <div className="flex items-center justify-end space-x-2 py-4">
                    <div className="flex-1 text-sm text-muted-foreground">
                        {table.getFilteredSelectedRowModel().rows.length} of{" "}
                        {table.getFilteredRowModel().rows.length} row(s) selected.
                    </div>
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
        items={selectedItems}
        creator={user ? { id: user.id, name: user.name } : null}
        onSuccess={() => {
            fetchData();
            table.resetRowSelection();
        }}
        isNewVendor={isNewVendor}
    />
     <QuotationDetailDialog
        isOpen={isDialogLoading || !!selectedQuotation}
        onClose={() => setSelectedQuotation(null)}
        quotation={selectedQuotation}
        deal={selectedDeal}
        salesmen={salesmen}
        cpds={cpds}
    />
    <Dialog
      open={isDeletePoOpen}
      onOpenChange={(open) => {
        setIsDeletePoOpen(open);
        if (!open && !isDeletingPo) setDeletePoNumber("");
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Purchase Order</DialogTitle>
          <DialogDescription>
            Admin only. This will remove the PO from linked requests and delete its inbound document.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-po-number">PO Number</Label>
          <Input
            id="delete-po-number"
            value={deletePoNumber}
            onChange={(e) => setDeletePoNumber(e.target.value)}
            placeholder="Enter PO number"
            disabled={isDeletingPo}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsDeletePoOpen(false)}
            disabled={isDeletingPo}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDeletePo}
            disabled={isDeletingPo || !deletePoNumber.trim()}
          >
            {isDeletingPo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </TooltipProvider>
    </>
  )
}
