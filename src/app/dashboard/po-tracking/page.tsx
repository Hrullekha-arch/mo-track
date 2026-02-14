
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
import { ArrowLeft, Loader2, Calendar as CalendarIcon, CheckboxIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { getFollowUpItems, updateFollowUpStatus, PoFollowUpItem } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

function FollowUpDialog({ 
    isOpen, 
    onClose, 
    item, 
    onConfirm
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    item: PoFollowUpItem | null; 
    onConfirm: (newDate: string | null, DocketNo:string, setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>) => void;
}) {
    const [newDate, setNewDate] = React.useState<Date | undefined>();
    const [sameAsOld, setSameAsOld] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const  [docket,setDocket]=React.useState("");
    React.useEffect(() => {
        if (!isOpen) {
            setNewDate(undefined);
            setSameAsOld(false);
        }
    }, [isOpen]);

    const handleConfirm = () => {
        setIsSubmitting(true);
        const dateToSubmit = sameAsOld ? null : (newDate ? newDate.toISOString() : null);
        const DockentNo = docket;
        console.log("DocketNo",DockentNo);
        onConfirm(dateToSubmit,DockentNo, setIsSubmitting);
    };
    
    if (!item) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Confirm Follow-up</DialogTitle>
                    <DialogDescription>
                        Have you followed up for the delivery of <strong>{item.itemName}</strong>?
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="same-date" checked={sameAsOld} onCheckedChange={(checked) => setSameAsOld(!!checked)} />
                        <Label htmlFor="same-date">Same as Old date</Label>
                    </div>
                     <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn("w-full justify-start text-left font-normal", !newDate && "text-muted-foreground")}
                                disabled={sameAsOld}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {newDate ? format(newDate, "PPP") : <span>Update Expected Date (Optional)</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={newDate} onSelect={setNewDate} initialFocus />
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="flex flex-col gap-5">
                    <Label>Doc No if Available *</Label>
                    <Input type="text" onChange={(e)=>setDocket(e.target.value)}  />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleConfirm} disabled={isSubmitting}>
                         {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


export default function FollowUpPage() {
  const [items, setItems] = React.useState<PoFollowUpItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedItem, setSelectedItem] = React.useState<PoFollowUpItem | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  
  const fetchData = React.useCallback(async () => {
      setLoading(true);
      try {
          const followUpItems = await getFollowUpItems();
          setItems(followUpItems);
      } catch (error) {
          toast({ variant: "destructive", title: "Error", description: "Could not load follow-up items." });
      } finally {
          setLoading(false);
      }
  }, [toast]);

  React.useEffect(() => {
      fetchData();
  }, [fetchData]);

  const handleConfirmFollowUp = async (newDate: string | null, DocketNo:string|null, setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>) => {
    if (!selectedItem || !user) return;
    try {
        const result = await updateFollowUpStatus(selectedItem.requestId, selectedItem.itemName,  newDate, DocketNo, user.name);
        if (result.success) {
            toast({ title: "Follow-up Confirmed", description: result.message });
            setSelectedItem(null);
            fetchData(); // Refresh the list
        } else {
            toast({ variant: "destructive", title: "Update Failed", description: result.message });
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "An unexpected server error occurred." });
    } finally {
        setIsSubmitting(false); // This will now correctly reset the button's loading state
    }
  };

  const columns: ColumnDef<PoFollowUpItem>[] = [
    { accessorKey: "orderId", header: "Order ID" },
    { accessorKey: "poNumber", header: "PO Number" },
    { accessorKey: "customerName", header: "Customer Name" },
    { accessorKey: "itemName", header: "Item Name" },
    { accessorKey: "quantity", header: "Qty" },
    { accessorKey: "expectedDeliveryDate", header: "Expected Date", cell: ({row}) => format(new Date(row.original.expectedDeliveryDate), "PPP") },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedItem(row.original)}
        >
          Followed up
        </Button>
      ),
    },
  ];

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
    <div className="w-full p-4 md:p-6 lg:p-8">
        <header className="flex items-center justify-between mb-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Delivery Follow-up</h1>
                <p className="text-muted-foreground">POs that are due for a delivery follow-up with the vendor.</p>
            </div>
             <Button variant="outline" asChild>
                <Link href="/dashboard">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                </Link>
            </Button>
        </header>
        
        <Card>
            <CardContent className="p-4">
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
                                    No items require follow-up at this time.
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
    <FollowUpDialog
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        item={selectedItem}
        onConfirm={handleConfirmFollowUp}
    />
    </>
  )
}
