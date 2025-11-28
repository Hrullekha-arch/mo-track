
"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useForm, useFieldArray, FormProvider, useFormContext } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Customer, Deal, DealProduct, Quotation, DealOrder, Cpd, Selection, Stock } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Edit, Trash2, RefreshCw, Eye, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { updateDealProducts, createSelectionAction, getProductsByIds } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
import { CreateQuotationDialog, ItemDetailValues } from "@/components/features/order-management/CreateQuotationDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PrintableSelection } from "@/components/features/order-management/PrintableSelection";
import { roomOptions } from "@/lib/constants";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

const productSchema = z.object({
    id: z.string().optional(),
    collectionBrand: z.string().min(1, "BCN is required."),
    salesDescription: z.string().optional().default(''),
    mrp: z.string().optional(),
    noOfPcs: z.string().optional().default('1'),
    verticalRepeat: z.string().optional().default(''),
    horizontalRepeat: z.string().optional().default(''),
    quantity: z.string().optional(),
    remarks: z.string().optional().default(''),
});

const roomSchema = z.object({
  name: z.string().min(1, "Room name is required."),
  items: z.array(productSchema).min(1, "At least one item is required per room."),
});

const productListSchema = z.object({ 
    rooms: z.array(roomSchema)
});

type RoomFormValues = z.infer<typeof roomSchema>;
type ProductFormValues = z.infer<typeof productSchema>;
type ProductListFormValues = z.infer<typeof productListSchema>;


function RoomForm({ roomIndex, removeRoom }: { roomIndex: number; removeRoom: () => void; }) {
    const { control, getValues, setValue } = useFormContext<ProductListFormValues>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: `rooms.${roomIndex}.items`
    });
    
    const [bcnOptions, setBcnOptions] = useState<ComboboxOption[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const { toast } = useToast();

    const handleBcnSearch = useCallback(async (query: string) => {
        if (query.length < 2) {
          setBcnOptions([]);
          return;
        }
        setIsSearching(true);
        try {
          const results = await searchStockByBcn(query);
          const options = results.map(stock => ({
            value: stock.bcn || stock.id,
            label: `${stock.bcn} (${stock.itemName})`,
            stockItem: stock
          }));
          setBcnOptions(options as any);
        } catch (error) {
          console.error("Error searching BCN:", error);
          toast({ variant: 'destructive', title: 'Search failed' });
        } finally {
          setIsSearching(false);
        }
      }, [toast]);
    
    const handleBcnSelect = (value: string, itemIndex: number) => {
        const selectedOption = bcnOptions.find(opt => opt.value === value) as any;
        if (selectedOption) {
            const stockItem = selectedOption.stockItem;
            setValue(`rooms.${roomIndex}.items.${itemIndex}.collectionBrand`, stockItem.bcn || stockItem.id);
            setValue(`rooms.${roomIndex}.items.${itemIndex}.mrp`, (stockItem.mrp || 0).toString());
        }
    };


    return (
        <Card className="p-4 border-2 border-blue-500 relative">
            <div className="flex items-end gap-2 mb-4">
                <FormField control={control} name={`rooms.${roomIndex}.name`} render={({ field }) => (
                    <FormItem className="flex-grow">
                        <FormLabel>Room Name</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g. Master Bedroom" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                 <Button type="button" size="icon" variant="ghost" onClick={() => {}}><PlusCircle className="h-5 w-5 text-primary" /></Button>
                 <Button type="button" size="icon" variant="destructive" onClick={removeRoom}><Trash2 className="h-5 w-5" /></Button>
            </div>

            {fields.map((item, itemIndex) => (
                <div key={item.id} className="p-4 border-2 border-blue-500 rounded-lg space-y-4 mb-4 relative">
                     <Button type="button" size="icon" variant="destructive" className="absolute -top-3 -right-3 h-7 w-7" onClick={() => remove(itemIndex)}><Trash2 className="h-4 w-4" /></Button>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.collectionBrand`} render={({ field }) => (
                            <FormItem>
                                <FormLabel>BCN*</FormLabel>
                                <Combobox 
                                    options={bcnOptions}
                                    value={field.value} 
                                    onSelect={(value) => { field.onChange(value); handleBcnSelect(value, itemIndex); }} 
                                    onSearch={handleBcnSearch} 
                                    placeholder="Search BCN..." 
                                    searchPlaceholder="Type to search..." 
                                    emptyPlaceholder={isSearching ? 'Searching...' : 'No BCN found.'} 
                                />
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.salesDescription`} render={({ field }) => (<FormItem><FormLabel>Sales Description</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.mrp`} render={({ field }) => (<FormItem><FormLabel>MRP</FormLabel><FormControl><Input type="number" {...field} readOnly /></FormControl></FormItem>)} />
                        <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.noOfPcs`} render={({ field }) => (<FormItem><FormLabel>No Of Pcs</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                         <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.verticalRepeat`} render={({ field }) => (<FormItem><FormLabel>Vertical Repeat</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                         <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.horizontalRepeat`} render={({ field }) => (<FormItem><FormLabel>Horizontal Repeat</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                         <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.quantity`} render={({ field }) => (<FormItem><FormLabel>Qty</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                     </div>
                     <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.remarks`} render={({ field }) => (
                        <FormItem>
                            <FormLabel>Remark</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Add any remarks..." {...field} />
                            </FormControl>
                        </FormItem>
                     )} />
                </div>
            ))}
            <Button type="button" variant="ghost" size="icon" onClick={() => append({ collectionBrand: '', noOfPcs: '1' })}><PlusCircle className="h-6 w-6 text-primary" /></Button>
        </Card>
    );
}


export function ProductForm({ initialProducts, customerId, dealId, onRefresh, deal, customer, cpds, quotations, orders, initialSelections }: { initialProducts: DealProduct[], customerId: string, dealId: string, onRefresh: () => void, deal: Deal, customer: Customer, cpds: Cpd[], quotations: Quotation[], orders: DealOrder[], initialSelections: Selection[] }) {
    const { user } = useAuth();
    const [activityLoading, setActivityLoading] = useState(false);
    const [selectionLoading, setSelectionLoading] = useState(false);
    const { toast } = useToast();
    const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isQuotationDialogOpen, setIsQuotationDialogOpen] = useState(false);
    const [selectedProductsForQuotation, setSelectedProductsForQuotation] = useState<ItemDetailValues[]>([]);
    const [selections, setSelections] = useState<Selection[]>(initialSelections);
    const [selectedSelection, setSelectedSelection] = useState<Selection | null>(null);
    const [selectedSelectionProducts, setSelectedSelectionProducts] = useState<DealProduct[]>([]);

    const fetchSelections = useCallback(() => {
      setSelections(initialSelections);
    }, [initialSelections]);
    
    useEffect(() => {
        fetchSelections();
    }, [fetchSelections]);

    const form = useForm<ProductListFormValues>({
        resolver: zodResolver(productListSchema),
        defaultValues: { rooms: [] },
    });
    
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "rooms"
    });


    useEffect(() => {
        // Group initial products by room
        const roomsMap = initialProducts.reduce((acc, product) => {
            const roomName = product.room || 'Unassigned';
            if (!acc[roomName]) {
                acc[roomName] = [];
            }
            acc[roomName].push(product);
            return acc;
        }, {} as Record<string, DealProduct[]>);
        
        const roomsForForm = Object.entries(roomsMap).map(([roomName, products]) => ({
            name: roomName,
            items: products.map(p => ({...p, noOfPcs: p.noOfPcs || '1'}))
        }));

        form.reset({ rooms: roomsForForm });
    }, [initialProducts, form]);

    const handleRefresh = async () => { setIsRefreshing(true); onRefresh(); await new Promise(resolve => setTimeout(resolve, 500)); setIsRefreshing(false); };
    
    const handleUpdateActivity = async (data: ProductListFormValues) => {
        setActivityLoading(true);
        // Flatten the room structure back into a single product list
        const productList: DealProduct[] = data.rooms.flatMap(room => room.items.map(item => ({
            ...item,
            room: room.name,
        })));
        
        const result = await updateDealProducts(customerId, dealId, productList);
        if(result.success) {
            toast({ title: "Products Updated", description: "The product list has been saved."});
            onRefresh();
        } else {
            toast({ variant: "destructive", title: "Error", description: result.message});
        }
        setActivityLoading(false);
    };

    const handleQuotationClick = async () => {
        const selectedProductIds = Object.keys(selectedRows).filter(id => selectedRows[id]);
        if (selectedProductIds.length === 0) {
            toast({ variant: 'destructive', title: 'No Products Selected', description: 'Please select at least one product to create a quotation.' });
            return;
        }
        
        const allProducts = form.getValues('rooms').flatMap(r => r.items);
        const productsToQuote = allProducts.filter(p => p.id && selectedProductIds.includes(p.id));

        setSelectedProductsForQuotation(productsToQuote.map(p => ({
            ...p,
            rate: parseFloat(p.mrp || '0'),
            discountPercent: 0,
        })));
        setIsQuotationDialogOpen(true);
    };
    
    const handleCreateSelection = async () => {
        setSelectionLoading(true);
        const selectedProductIds = Object.keys(selectedRows).filter(id => selectedRows[id]);
        if (selectedProductIds.length === 0) {
            toast({ variant: 'destructive', title: 'No Products Selected', description: 'Please select products to create a selection.' });
            setSelectionLoading(false);
            return;
        }
        
        const allProducts = form.getValues('rooms').flatMap(r => r.items);
        const productsToSave = allProducts.filter(p => p.id && selectedProductIds.includes(p.id));

        const result = await createSelectionAction(customerId, dealId, productsToSave, user?.name || 'Unknown');
        if (result.success && result.selection) {
            toast({ title: "Selection Saved", description: `Selection #${result.selection.id} created.` });
            setSelections(prev => [result.selection!, ...prev]);
            setSelectedRows({});
        } else {
            toast({ variant: 'destructive', title: 'Error Saving Selection', description: result.message });
        }
        setSelectionLoading(false);
    };

    const handleViewSelection = async (selection: Selection) => {
        setSelectedSelection(selection);
         const allProducts = form.getValues('rooms').flatMap(r => r.items);
        const products = allProducts.filter(p => p.id && selection.productIds.includes(p.id!));
        setSelectedSelectionProducts(products);
    };

    const getProductStatus = (product: DealProduct) => {
        const isInOrder = orders.some(order => order.items.some(item => item.collectionBrand === product.collectionBrand));
        if (isInOrder) return <Badge variant="default" className="bg-green-500">Order Created</Badge>;
        const isInQuotation = quotations.some(q => q.items.some(item => item.collectionBrand === product.collectionBrand));
        if (isInQuotation) return <Badge variant="secondary">In Quotation</Badge>;
        return <Badge variant="outline">New</Badge>;
    };

    return (
        <>
            <FormProvider {...form}>
                <Card className="mt-6">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-semibold">Add / Edit Products</h3>
                        </div>

                        <form className="space-y-4" onSubmit={form.handleSubmit(handleUpdateActivity)}>
                             {fields.map((room, index) => (
                                <RoomForm key={room.id} roomIndex={index} removeRoom={() => remove(index)} />
                            ))}
                            <Button type="button" variant="outline" onClick={() => append({ name: "", items: [{ collectionBrand: '', noOfPcs: '1' }] })}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Add Another Room
                            </Button>
                             <Separator className="my-8" />
                            <div className="flex justify-between items-center">
                                 <div className="flex gap-2">
                                    <Button type="button" onClick={handleCreateSelection} disabled={selectionLoading}>{selectionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Selection</Button>
                                    <Button type="button" onClick={handleQuotationClick}>Convert To Quotation</Button>
                                </div>
                                <Button type="submit" disabled={activityLoading} className="bg-cyan-600 hover:bg-cyan-700">{activityLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update Activity</Button>
                            </div>
                        </form>

                        {selections.length > 0 && (
                            <div className="mt-8">
                                <h3 className="text-xl font-semibold mb-4">Saved Selections</h3>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Selection ID</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Total Qty</TableHead>
                                            <TableHead>Total Amount</TableHead>
                                            <TableHead>Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selections.map(selection => {
                                            const allProducts = form.getValues('rooms').flatMap(r => r.items);
                                            const selectionProducts = allProducts.filter(p => p.id && selection.productIds.includes(p.id!));
                                            const totalQty = selectionProducts.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
                                            const totalAmount = selectionProducts.reduce((sum, p) => sum + ((Number(p.quantity) || 0) * (Number(p.mrp) || 0)), 0);
                                            return (
                                                <TableRow key={selection.id}>
                                                    <TableCell className="font-mono">{selection.id}</TableCell>
                                                    <TableCell>{format(new Date(selection.createdAt), "dd/MM/yyyy")}</TableCell>
                                                    <TableCell>{totalQty.toFixed(2)}</TableCell>
                                                    <TableCell>₹{totalAmount.toFixed(2)}</TableCell>
                                                    <TableCell><Button variant="ghost" size="icon" onClick={() => handleViewSelection(selection)}><Eye className="h-4 w-4" /></Button></TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                        
                    </CardContent>
                </Card>
            </FormProvider>
            
             <Dialog open={!!selectedSelection} onOpenChange={() => setSelectedSelection(null)}>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Selection Details: #{selectedSelection?.id}</DialogTitle>
                    </DialogHeader>
                    <div className="flex-grow overflow-y-auto">
                        {selectedSelection && <PrintableSelection selection={selectedSelection} deal={deal} products={selectedSelectionProducts} />}
                    </div>
                     <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setSelectedSelection(null)}>Close</Button>
                        <Button type="button" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4"/> Print</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <CreateQuotationDialog 
                isOpen={isQuotationDialogOpen} 
                onClose={() => setIsQuotationDialogOpen(false)}
                onSuccess={onRefresh}
                deal={deal}
                customer={customer}
                initialItems={selectedProductsForQuotation}
                cpds={cpds}
            />
        </>
    )
}
