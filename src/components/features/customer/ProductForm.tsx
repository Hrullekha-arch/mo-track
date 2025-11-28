
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

const productSchema = z.object({
    id: z.string().optional(),
    productCategory: z.string().optional().default(''),
    collectionBrand: z.string().min(1, "Collection/Brand is required."),
    salesDescription: z.string().optional().default(''),
    quantity: z.string().optional(),
    mrp: z.string().optional(),
    remarks: z.string().optional().default(''),
    room: z.string().optional().default(''),
    noOfPcs: z.string().optional().default('1'),
    verticalRepeat: z.string().optional().default(''),
    horizontalRepeat: z.string().optional().default(''),
});

const productListSchema = z.object({ products: z.array(productSchema) });

type ProductFormValues = z.infer<typeof productSchema>;
type ProductListFormValues = z.infer<typeof productListSchema>;

const initialProductTypeOptions: ComboboxOption[] = [
    { value: "fabric", label: "Fabric" },
    { value: "rod", label: "Rod" },
    // ... add all other types
];

function AddProductForm({ onAddProduct }: { onAddProduct: (data: ProductFormValues) => void }) {
    const { toast } = useToast();
    const [bcnOptions, setBcnOptions] = useState<{ value: string; label: string; stockItem: Stock }[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    
    const addProductForm = useForm<ProductFormValues>({
        resolver: zodResolver(productSchema),
        defaultValues: { productCategory: '', collectionBrand: "", salesDescription: "", quantity: "", mrp: "", remarks: "", room: "", noOfPcs: '1', verticalRepeat: "", horizontalRepeat: "" },
    });

    const handleBcnSearch = async (query: string) => {
        if (query.length < 2) { setBcnOptions([]); return; }
        setIsSearching(true);
        try {
            const results = await searchStockByBcn(query);
            setBcnOptions(results.map(stock => ({ value: stock.bcn || stock.id, label: `${stock.bcn} (${stock.itemName})`, stockItem: stock })));
        } catch (error) {
            toast({ variant: 'destructive', title: 'Search failed' });
        } finally {
            setIsSearching(false);
        }
    };

    const handleBcnSelect = (value: string) => {
        const selectedOption = bcnOptions.find(opt => opt.value === value);
        if (selectedOption) {
            const stockItem = selectedOption.stockItem;
            addProductForm.setValue('collectionBrand', stockItem.bcn || stockItem.id);
            addProductForm.setValue('salesDescription', stockItem.itemName);
            addProductForm.setValue('mrp', (stockItem.mrp || 0).toString());
        }
    };

    const handleAddClick = () => {
        addProductForm.handleSubmit((data) => {
            onAddProduct({...data, id: new Date().toISOString() });
            addProductForm.reset();
        })();
    };

    return (
        <FormProvider {...addProductForm}>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold">Add More Products</h3>
            </div>
            <Card className="mb-4 p-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <FormField control={addProductForm.control} name="collectionBrand" render={({ field }) => (<FormItem><FormLabel>Collection/Brand (BCN)*</FormLabel><Combobox options={bcnOptions} value={field.value} onSelect={(value) => { field.onChange(value); handleBcnSelect(value); }} onSearch={handleBcnSearch} placeholder="Search BCN..." searchPlaceholder="Type to search..." emptyPlaceholder={isSearching ? 'Searching...' : 'No BCN found.'} /><FormMessage /></FormItem>)} />
                    <FormField control={addProductForm.control} name="salesDescription" render={({ field }) => (<FormItem><FormLabel>Sales Description</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={addProductForm.control} name="mrp" render={({ field }) => (<FormItem><FormLabel>MRP</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={addProductForm.control} name="quantity" render={({ field }) => (<FormItem><FormLabel>Quantity</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={addProductForm.control} name="room" render={({ field }) => (<FormItem><FormLabel>Room</FormLabel><Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="Select Room" /><FormMessage /></FormItem>)} />
                    <FormField control={addProductForm.control} name="noOfPcs" render={({ field }) => (<FormItem><FormLabel>No of Pcs</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={addProductForm.control} name="verticalRepeat" render={({ field }) => (<FormItem><FormLabel>Vertical Repeat</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={addProductForm.control} name="horizontalRepeat" render={({ field }) => (<FormItem><FormLabel>Horizontal Repeat</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={addProductForm.control} name="remarks" render={({ field }) => (<FormItem className="lg:col-span-4"><FormLabel>Remarks</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
            </Card>
            <div className="mt-4">
                <Button type="button" onClick={handleAddClick} variant="outline"><PlusCircle className="mr-2 h-4 w-4" /> Add Product to List</Button>
            </div>
        </FormProvider>
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
        defaultValues: { products: initialProducts || [] },
    });

    const { fields, append, remove, update } = useFieldArray({ control: form.control, name: "products" });

    useEffect(() => { form.reset({ products: initialProducts || [] }); }, [initialProducts, form]);
    
    const handleRefresh = async () => { setIsRefreshing(true); onRefresh(); await new Promise(resolve => setTimeout(resolve, 500)); setIsRefreshing(false); };
    const handleAddProduct = (productData: ProductFormValues) => { append(productData); };
    
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
            toast({ variant: 'destructive', title: 'No Products Selected', description: 'Please select products to create a selection.' });
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
            toast({ variant: 'destructive', title: 'Error Saving Selection', description: result.message });
        }
        setSelectionLoading(false);
    };

    const handleViewSelection = async (selection: Selection) => {
        setSelectedSelection(selection);
        const products = fields.filter(p => selection.productIds.includes(p.id!));
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
                        <AddProductForm onAddProduct={handleAddProduct} />

                        <Separator className="my-8" />

                        <div className="flex justify-between items-center mb-6">
                             <h3 className="text-xl font-semibold">Previously Added Products</h3>
                             <Button onClick={handleRefresh} variant="outline" size="sm" disabled={isRefreshing}>
                                {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>} Refresh
                            </Button>
                        </div>
                        <div className="border rounded-md">
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10"><Checkbox onCheckedChange={(checked) => { const newSelection: Record<string, boolean> = {}; if (checked) { fields.forEach(f => { if(f.id) newSelection[f.id] = true; }); } setSelectedRows(newSelection); }} /></TableHead>
                                        <TableHead>Collection/Brand</TableHead>
                                        <TableHead>Sales Desc</TableHead>
                                        <TableHead>Qty</TableHead>
                                        <TableHead>MRP</TableHead>
                                        <TableHead>V-R</TableHead>
                                        <TableHead>H-R</TableHead>
                                        <TableHead>Room</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fields.map((product, index) => (
                                        <TableRow key={product.id}>
                                            <TableCell><Checkbox checked={selectedRows[product.id!] || false} onCheckedChange={(checked) => setSelectedRows(prev => ({ ...prev, [product.id!]: !!checked }))} /></TableCell>
                                            <TableCell>{product.collectionBrand}</TableCell>
                                            <TableCell>{product.salesDescription}</TableCell>
                                            <TableCell>{product.quantity}</TableCell>
                                            <TableCell>{product.mrp}</TableCell>
                                            <TableCell>{product.verticalRepeat}</TableCell>
                                            <TableCell>{product.horizontalRepeat}</TableCell>
                                            <TableCell>{product.room}</TableCell>
                                            <TableCell>{getProductStatus(product)}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        <Separator className="my-8" />
                        
                        <div className="flex gap-2 mb-8">
                            <Button type="button" onClick={handleCreateSelection} disabled={selectionLoading}>{selectionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Selection</Button>
                            <Button type="button" onClick={handleQuotationClick}>Convert To Quotation</Button>
                        </div>
                        
                        {selections.length > 0 && (
                            <div className="mb-8">
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
                                            const selectionProducts = fields.filter(p => selection.productIds.includes(p.id!));
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
                        
                        <div className="mt-12 flex flex-col items-start gap-4">
                            <form onSubmit={form.handleSubmit(handleUpdateActivity)}>
                                <p className="text-sm text-destructive mb-2">Please click on Update Activity if you have updated any changes.</p>
                                <Button type="submit" disabled={activityLoading} className="bg-cyan-600 hover:bg-cyan-700">{activityLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update Activity</Button>
                            </form>
                        </div>
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
