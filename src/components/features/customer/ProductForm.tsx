
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

function AddProductForm({ onAddProduct, productTypeOptions, roomOptions, openAddOptionDialog }: { onAddProduct: (data: ProductFormValues) => void, productTypeOptions: ComboboxOption[], roomOptions: ComboboxOption[], openAddOptionDialog: (field: 'room' | 'type', onSave: (value: string) => void) => void }) {
    const { toast } = useToast();
    const [bcnOptions, setBcnOptions] = useState<{ value: string; label: string; stockItem: Stock }[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    
    const addProductForm = useForm<ProductFormValues>({
        resolver: zodResolver(productSchema),
        defaultValues: { productCategory: '', collectionBrand: "", salesDescription: "", quantity: "", mrp: "", remarks: "", room: "", noOfPcs: '1', verticalRepeat: "", horizontalRepeat: "" },
    });

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
                {/* Form fields for adding a product */}
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

    const { fields, append, remove } = useFieldArray({ control: form.control, name: "products" });

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
        const products = await getProductsByIds(selection.productIds);
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
                        {/* AddProductForm and Table of existing products */}
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
                                            // Note: These calculations are placeholders.
                                            const totalQty = 0; // You would calculate this
                                            const totalAmount = 0; // You would calculate this
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
