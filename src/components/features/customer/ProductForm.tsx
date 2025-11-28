
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
import { updateDealProducts, createSelectionAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

const productSchema = z.object({
    id: z.string().optional(),
    collectionBrand: z.string().min(1, "BCN is required."),
    salesDescription: z.string().optional(),
    mrp: z.string().optional(),
    noOfPcs: z.string().optional(),
    verticalRepeat: z.string().optional(),
    horizontalRepeat: z.string().optional(),
    quantity: z.string().optional(),
    remarks: z.string().optional(),
    room: z.string().optional(),
});

const newProductEntrySchema = z.object({
    collectionBrand: z.string().min(1, "BCN is required."),
    salesDescription: z.string().optional().default(''),
    mrp: z.string().optional(),
    noOfPcs: z.string().optional().default('1'),
    verticalRepeat: z.string().optional().default(''),
    horizontalRepeat: z.string().optional().default(''),
    quantity: z.string().optional(),
    remarks: z.string().optional().default(''),
});

const productListSchema = z.object({
  products: z.array(productSchema),
  room: z.string().optional(),
  newProduct: newProductEntrySchema,
});


type ProductListFormValues = z.infer<typeof productListSchema>;

export function ProductForm({ initialProducts, customerId, dealId, onRefresh, deal, customer, cpds, quotations, orders, initialSelections }: { initialProducts: DealProduct[], customerId: string, dealId: string, onRefresh: () => void, deal: Deal, customer: Customer, cpds: Cpd[], quotations: Quotation[], orders: DealOrder[], initialSelections: Selection[] }) {
    const { user } = useAuth();
    const [activityLoading, setActivityLoading] = useState(false);
    const [selectionLoading, setSelectionLoading] = useState(false);
    const { toast } = useToast();
    const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
    const [isQuotationDialogOpen, setIsQuotationDialogOpen] = useState(false);
    const [selectedProductsForQuotation, setSelectedProductsForQuotation] = useState<ItemDetailValues[]>([]);
    const [selections, setSelections] = useState<Selection[]>(initialSelections);
    const [selectedSelection, setSelectedSelection] = useState<Selection | null>(null);
    const [selectedSelectionProducts, setSelectedSelectionProducts] = useState<DealProduct[]>([]);
    const [bcnOptions, setBcnOptions] = useState<ComboboxOption[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [stagedItems, setStagedItems] = useState<z.infer<typeof newProductEntrySchema>[]>([]);

    useEffect(() => {
        setSelections(initialSelections);
    }, [initialSelections]);

    const form = useForm<ProductListFormValues>({
        resolver: zodResolver(productListSchema),
        defaultValues: {
            products: initialProducts.map(p => ({
                ...p, 
                id: p.id || p.collectionBrand,
                salesDescription: p.salesDescription || '',
                noOfPcs: p.noOfPcs || '1',
                verticalRepeat: p.verticalRepeat || '',
                horizontalRepeat: p.horizontalRepeat || '',
                remarks: p.remarks || '',
                quantity: p.quantity || '',
                mrp: p.mrp || '',
                room: p.room || '',
            })),
            room: '',
            newProduct: {
                collectionBrand: '',
                salesDescription: '',
                mrp: '',
                noOfPcs: '1',
                verticalRepeat: '',
                horizontalRepeat: '',
                quantity: '',
                remarks: '',
            }
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "products"
    });
    
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
            label: `${stock.bcn}`,
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
    
    const handleBcnSelect = (value: string) => {
        const selectedOption = bcnOptions.find(opt => opt.value === value) as any;
        if (selectedOption) {
            const stockItem = selectedOption.stockItem;
            form.setValue('newProduct.collectionBrand', stockItem.bcn || stockItem.id);
            form.setValue('newProduct.mrp', (stockItem.mrp || 0).toString());
            form.setValue('newProduct.salesDescription', '');
        }
    };
    
    const handleStageItem = () => {
        const newProduct = form.getValues('newProduct');
        if (!newProduct.collectionBrand) {
            toast({ variant: 'destructive', title: 'Missing BCN', description: 'Please select a product BCN.' });
            return;
        }
        setStagedItems(prev => [...prev, newProduct]);
        form.reset({
            ...form.getValues(),
            newProduct: {
                collectionBrand: '', salesDescription: '', mrp: '', noOfPcs: '1', 
                verticalRepeat: '', horizontalRepeat: '', quantity: '', remarks: ''
            }
        });
    };

    const handleAddProductsToList = () => {
        const room = form.getValues('room');
        if (!room) {
            toast({ variant: 'destructive', title: 'Missing Room', description: 'Please select a room first.' });
            return;
        }
        if (stagedItems.length === 0) {
            toast({ variant: 'destructive', title: 'No Items', description: 'Please add at least one item to stage.' });
            return;
        }
        const newProductsForForm = stagedItems.map(item => ({
            ...item,
            room,
            id: `${item.collectionBrand}-${Date.now()}`
        }));
        append(newProductsForForm);
        setStagedItems([]);
        toast({ title: "Products Added", description: `${stagedItems.length} item(s) added to the list. Click 'Update Activity' to save.` });
    };

    const handleUpdateActivity = async (data: ProductListFormValues) => {
        setActivityLoading(true);
        const result = await updateDealProducts(customerId, dealId, data.products);
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
        const productsToQuote = fields.filter(p => p.id && selectedProductIds.includes(p.id));
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
            toast({ variant: 'destructive', title: 'No Products Selected' });
            setSelectionLoading(false);
            return;
        }
        const productsToSave = fields.filter(p => p.id && selectedProductIds.includes(p.id));
        const result = await createSelectionAction(customerId, dealId, productsToSave, user?.name || 'Unknown');
        if (result.success && result.selection) {
            toast({ title: "Selection Saved", description: `Selection #${result.selection.id} created.` });
            setSelections(prev => [result.selection!, ...prev]);
            setSelectedRows({});
        } else {
            toast({ variant: 'destructive', title: 'Error Saving Selection' });
        }
        setSelectionLoading(false);
    };

    const handleViewSelection = async (selection: Selection) => {
        setSelectedSelection(selection);
        const products = fields.filter(p => p.id && Array.isArray(selection.productIds) && selection.productIds.includes(p.id!));
        setSelectedSelectionProducts(products);
    };
    
    const handleDeleteItem = (index: number) => {
        remove(index);
        toast({ title: "Item Removed", description: "Click 'Update Activity' to save this change." });
    };

    return (
        <>
            <FormProvider {...form}>
                <Card className="mt-6">
                    <CardContent className="p-6">
                         <div className="space-y-4">
                            <h3 className="text-lg font-semibold">Add More Product</h3>
                            <div className="p-4 border rounded-lg space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                     <FormField control={form.control} name="room" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Room*</FormLabel>
                                            <Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="Select Room..." />
                                            <FormMessage />
                                        </FormItem>
                                     )}/>
                                     <div className="md:col-span-2 flex items-end gap-2">
                                        <Button type="button" variant="outline" onClick={() => append({name: "", items: []})}> <PlusCircle className="mr-2 h-4 w-4" /> Add new Room </Button>
                                        <Button type="button" onClick={handleAddProductsToList}>Add Product to List</Button>
                                    </div>
                                </div>
                                
                                <Separator />
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <FormField control={form.control} name="newProduct.collectionBrand" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>BCN*</FormLabel>
                                            <Combobox options={bcnOptions} value={field.value} onSelect={(value) => { field.onChange(value); handleBcnSelect(value); }} onSearch={handleBcnSearch} placeholder="Search by BCN..." />
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="newProduct.salesDescription" render={({ field }) => (<FormItem><FormLabel>Sales Description</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                                    <FormField control={form.control} name="newProduct.mrp" render={({ field }) => (<FormItem><FormLabel>MRP</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                                    <FormField control={form.control} name="newProduct.noOfPcs" render={({ field }) => (<FormItem><FormLabel>No Of Pcs</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <FormField control={form.control} name="newProduct.verticalRepeat" render={({ field }) => (<FormItem><FormLabel>Vertical Repeat</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                                    <FormField control={form.control} name="newProduct.horizontalRepeat" render={({ field }) => (<FormItem><FormLabel>Horizontal Repeat</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                                    <FormField control={form.control} name="newProduct.quantity" render={({ field }) => (<FormItem><FormLabel>Qty</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                                </div>
                                <FormField control={form.control} name="newProduct.remarks" render={({ field }) => (<FormItem><FormLabel>Remark</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                                
                                <Button type="button" size="sm" onClick={handleStageItem}>Add Item</Button>

                                {stagedItems.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="text-sm font-semibold">Staged Items for Room: {form.getValues('room')}</h4>
                                        <ul className="text-xs list-disc list-inside p-2 border rounded-md bg-muted/50">
                                            {stagedItems.map((item, i) => <li key={i}>{item.collectionBrand} - Qty: {item.quantity || 'N/A'}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>

                         <Separator className="my-8" />
                         
                        <form className="space-y-4" onSubmit={form.handleSubmit(handleUpdateActivity)}>
                             <div className="space-y-4">
                                <h3 className="text-lg font-semibold">Previously Added Products</h3>
                                <div className="border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Modify</TableHead>
                                                <TableHead>Room</TableHead>
                                                <TableHead>BCN</TableHead>
                                                <TableHead>MRP</TableHead>
                                                <TableHead>Pcs</TableHead>
                                                <TableHead>H-R</TableHead>
                                                <TableHead>V-R</TableHead>
                                                <TableHead>Description</TableHead>
                                                <TableHead>Remark</TableHead>
                                                <TableHead>Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {fields.length > 0 ? fields.map((product, index) => (
                                                <TableRow key={product.id}>
                                                    <TableCell><Checkbox checked={!!selectedRows[product.id!]} onCheckedChange={(checked) => { const newSelection = { ...selectedRows }; if (checked) {newSelection[product.id!] = true;} else {delete newSelection[product.id!];} setSelectedRows(newSelection); }} /></TableCell>
                                                    <TableCell>{product.room}</TableCell>
                                                    <TableCell>{product.collectionBrand}</TableCell>
                                                    <TableCell>{product.mrp}</TableCell>
                                                    <TableCell>{product.noOfPcs}</TableCell>
                                                    <TableCell>{product.horizontalRepeat}</TableCell>
                                                    <TableCell>{product.verticalRepeat}</TableCell>
                                                    <TableCell>{product.salesDescription}</TableCell>
                                                    <TableCell>{product.remarks}</TableCell>
                                                    <TableCell><Button type="button" variant="ghost" size="icon"><Edit className="h-4 w-4 text-blue-500" /></Button><Button type="button" variant="ghost" size="icon" onClick={() => handleDeleteItem(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                                                </TableRow>
                                            )) : (
                                                <TableRow><TableCell colSpan={10} className="text-center">No products added yet.</TableCell></TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                                <div className="flex justify-between items-center">
                                    <Button type="button" onClick={handleCreateSelection} disabled={selectionLoading}>{selectionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Selection</Button>
                                    <p className="text-sm text-destructive">Please click on Update Activity if you have updated any changes.</p>
                                </div>
                            </div>
                            <Separator />
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold">Saved Selection</h3>
                                <div className="border rounded-md">
                                     <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Modify</TableHead>
                                                <TableHead>Selection Id</TableHead>
                                                <TableHead>Total No Of Room</TableHead>
                                                <TableHead>Total MRP</TableHead>
                                                <TableHead>Total Pcs</TableHead>
                                                <TableHead>View</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                           {selections.map((selection) => {
                                               const selectionProducts = fields.filter(p => p.id && Array.isArray(selection.productIds) && selection.productIds.includes(p.id!));
                                               const roomCount = new Set(selectionProducts.map(p => p.room)).size;
                                               const totalMrp = selectionProducts.reduce((sum, p) => sum + ((Number(p.mrp) || 0) * (Number(p.quantity) || 0)), 0);
                                               const totalPcs = selectionProducts.reduce((sum, p) => sum + (Number(p.noOfPcs) || 0), 0);
                                               return (
                                                   <TableRow key={selection.id}>
                                                       <TableCell><Checkbox /></TableCell>
                                                       <TableCell>{selection.id}</TableCell>
                                                       <TableCell>{roomCount}</TableCell>
                                                       <TableCell>₹{totalMrp.toFixed(2)}</TableCell>
                                                       <TableCell>{totalPcs}</TableCell>
                                                       <TableCell><Button variant="ghost" size="icon" onClick={() => handleViewSelection(selection)}><Eye className="h-5 w-5"/></Button></TableCell>
                                                   </TableRow>
                                               )
                                           })}
                                        </TableBody>
                                     </Table>
                                </div>
                            </div>
                             <div className="flex justify-end items-center gap-4 pt-4 border-t">
                                <Button type="submit" disabled={activityLoading}>
                                  {activityLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Update Activity
                                </Button>
                                <Button type="button" onClick={handleQuotationClick}>Create Quotation</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </FormProvider>
            <CreateQuotationDialog isOpen={isQuotationDialogOpen} onClose={() => setIsQuotationDialogOpen(false)} onSuccess={onRefresh} deal={deal} customer={customer} initialItems={selectedProductsForQuotation} cpds={cpds} />
            {selectedSelection && (
                <Dialog open={!!selectedSelection} onOpenChange={() => setSelectedSelection(null)}>
                    <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle>Selection Details: #{selectedSelection.id}</DialogTitle>
                        </DialogHeader>
                        <div className="flex-grow overflow-y-auto">
                            <PrintableSelection selection={selectedSelection} deal={deal} products={selectedSelectionProducts} />
                        </div>
                        <DialogFooter>
                             <Button type="button" variant="outline" onClick={() => setSelectedSelection(null)}>Close</Button>
                             <Button type="button" onClick={() => {}}><Printer className="mr-2 h-4 w-4"/>Print</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </>
    )
}

    