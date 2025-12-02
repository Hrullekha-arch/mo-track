
"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useForm, useFieldArray, FormProvider, useFormContext, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Customer, Deal, DealProduct, Quotation, DealOrder, Cpd, Selection, Stock } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Edit, Trash2, RefreshCw, Eye, Printer, MoreHorizontal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { updateDealProducts, createSelectionAction, updateSelectionStatusAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, } from "@/components/ui/form";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";


const blindEntrySchema = z.object({
  id: z.string(),
  blindType: z.enum(['Roman Blind', 'Roller Blind', 'Normal Blind']).optional(),
  shadeNo: z.string().optional(),
  width: z.string().optional(),
  widthUnit: z.string().optional().default('inch'),
  height: z.string().optional(),
  heightUnit: z.string().optional().default('inch'),
  operating: z.enum(['Manual', 'motorized']).optional(),
  usesType: z.enum(['Direct Fix', 'Head Rail', 'Plain Cassette', 'Decorative Cassette', 'One Touch Up', 'Moto Down']).optional(),
  motorType: z.enum(['Simotic or Ebony (RTS | WT)', 'Wire Free (RTS)']).optional(),
  remoteType: z.string().optional(),
  control: z.enum(['LHT', 'RHT']).optional(),
  bracket: z.enum(['Wall', 'Celling']).optional(),
  bottomChannel: z.enum(['Square', 'Rounded', 'Fabric Covered']).optional(),
  bottomRailColor: z.string().optional(),
  otherBottomRailColor: z.string().optional(),
  locationOfBlind: z.string().optional(),
  noOfBlind: z.string().optional(),
});

const productSchema = z.object({
    id: z.string().optional(),
    isBlind: z.boolean().optional().default(false), // Differentiator
    collectionBrand: z.string().min(1, "BCN is required."),
    salesDescription: z.string().optional(),
    mrp: z.string().optional(),
    noOfPcs: z.string().optional(),
    verticalRepeat: z.string().optional(),
    horizontalRepeat: z.string().optional(),
    quantity: z.string().optional(),
    remarks: z.string().optional(),
    room: z.string().optional(),
    // Blind details are now part of the main product object
    blindType: z.enum(['Roman Blind', 'Roller Blind', 'Normal Blind']).optional(),
    shadeNo: z.string().optional(),
    width: z.string().optional(),
    widthUnit: z.string().optional().default('inch'),
    height: z.string().optional(),
    heightUnit: z.string().optional().default('inch'),
    operating: z.enum(['Manual', 'motorized']).optional(),
    usesType: z.enum(['Direct Fix', 'Head Rail', 'Plain Cassette', 'Decorative Cassette', 'One Touch Up', 'Moto Down']).optional(),
    motorType: z.enum(['Simotic or Ebony (RTS | WT)', 'Wire Free (RTS)']).optional(),
    remoteType: z.string().optional(),
    control: z.enum(['LHT', 'RHT']).optional(),
    bracket: z.enum(['Wall', 'Celling']).optional(),
    bottomChannel: z.enum(['Square', 'Rounded', 'Fabric Covered']).optional(),
    bottomRailColor: z.string().optional(),
    otherBottomRailColor: z.string().optional(),
    locationOfBlind: z.string().optional(),
    noOfBlind: z.string().optional(),
});

const newProductEntrySchema = z.object({
    collectionBrand: z.string().min(1, "BCN is required."),
    salesDescription: z.string().optional().default(''),
    mrp: z.string().optional().default(''),
    verticalRepeat: z.string().optional().default(''),
    horizontalRepeat: z.string().optional().default(''),
    quantity: z.string().optional().default(''),
    remarks: z.string().optional().default(''),
});

const productListSchema = z.object({
  products: z.array(productSchema),
  room: z.string().optional(),
  newProduct: newProductEntrySchema,
});


type ProductListFormValues = z.infer<typeof productListSchema>;
type BlindEntryFormValues = z.infer<typeof blindEntrySchema>;

const AddBlindsDialog = ({ isOpen, onClose, roomName, appendProduct }: { isOpen: boolean; onClose: () => void; roomName: string; appendProduct: (product: any) => void; }) => {
    const { toast } = useToast();
    const [bcnOptions, setBcnOptions] = React.useState<any[]>([]);
    const [localBlinds, setLocalBlinds] = useState<Partial<BlindEntryFormValues>[]>([{ id: new Date().toISOString() }]);

    const handleSearch = async (query: string) => {
        if (query.length < 2) return;
        const results = await searchStockByBcn(query);
        setBcnOptions(results.map(r => ({ label: r.bcn, value: r.bcn })));
    };
    
    const handleSave = () => {
        const blindsToSave = localBlinds.map(blind => ({
            ...blind,
            isBlind: true,
            room: roomName,
            id: `blind-${Date.now()}-${Math.random()}`,
            collectionBrand: blind.shadeNo || 'N/A' // Use shade no as primary identifier
        }));
        
        blindsToSave.forEach(blind => appendProduct(blind));

        toast({ title: "Blinds Added", description: `${blindsToSave.length} blind(s) added to the list. Click 'Update Activity' to save.` });
        onClose();
    };

    const updateLocalBlind = (index: number, field: keyof BlindEntryFormValues, value: any) => {
        const newBlinds = [...localBlinds];
        newBlinds[index] = { ...newBlinds[index], [field]: value };
        setLocalBlinds(newBlinds);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Add Blinds for {roomName}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[70vh]">
                <div className="py-4 space-y-4 pr-4">
                    {localBlinds.map((blind, index) => {
                        const isMotorized = blind.operating === 'motorized';
                        const showOtherColor = blind.bottomRailColor === 'Other';
                        return (
                            <Card key={blind.id} className="p-4 relative">
                                <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => setLocalBlinds(prev => prev.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
                                <p className="font-semibold mb-3">Blind #{index + 1}</p>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                     <FormItem><FormLabel>Blind Type</FormLabel><Select onValueChange={(val) => updateLocalBlind(index, 'blindType', val)} value={blind.blindType}><SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger><SelectContent><SelectItem value="Roman Blind">Roman Blind</SelectItem><SelectItem value="Roller Blind">Roller Blind</SelectItem><SelectItem value="Normal Blind">Normal Blind</SelectItem></SelectContent></Select></FormItem>
                                     <FormItem><FormLabel>Shade No</FormLabel><Input value={blind.shadeNo} onChange={(e) => updateLocalBlind(index, 'shadeNo', e.target.value)} /></FormItem>
                                     <FormItem><FormLabel>Width</FormLabel><div className="flex items-center gap-1"><Input value={blind.width} onChange={(e) => updateLocalBlind(index, 'width', e.target.value)} /><Select onValueChange={(val) => updateLocalBlind(index, 'widthUnit', val)} value={blind.widthUnit}><SelectTrigger className="w-20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inch">inch</SelectItem><SelectItem value="mm">mm</SelectItem></SelectContent></Select></div></FormItem>
                                     <FormItem><FormLabel>Height</FormLabel><div className="flex items-center gap-1"><Input value={blind.height} onChange={(e) => updateLocalBlind(index, 'height', e.target.value)} /><Select onValueChange={(val) => updateLocalBlind(index, 'heightUnit', val)} value={blind.heightUnit}><SelectTrigger className="w-20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inch">inch</SelectItem><SelectItem value="mm">mm</SelectItem></SelectContent></Select></div></FormItem>
                                     <FormItem><FormLabel>Operating</FormLabel><Select onValueChange={(val) => updateLocalBlind(index, 'operating', val)} value={blind.operating}><SelectTrigger><SelectValue placeholder="Select Operating" /></SelectTrigger><SelectContent><SelectItem value="Manual">Manual</SelectItem><SelectItem value="motorized">motorized</SelectItem></SelectContent></Select></FormItem>
                                     <FormItem><FormLabel>Uses Type</FormLabel><Select onValueChange={(val) => updateLocalBlind(index, 'usesType', val)} value={blind.usesType}><SelectTrigger><SelectValue placeholder="Select Uses Type" /></SelectTrigger><SelectContent><SelectItem value="Direct Fix">Direct Fix</SelectItem><SelectItem value="Head Rail">Head Rail</SelectItem><SelectItem value="Plain Cassette">Plain Cassette</SelectItem><SelectItem value="Decorative Cassette">Decorative Cassette</SelectItem><SelectItem value="One Touch Up">One Touch Up</SelectItem><SelectItem value="Moto Down">Moto Down</SelectItem></SelectContent></Select></FormItem>
                                     {isMotorized && (<FormItem><FormLabel>Motor Type</FormLabel><Select onValueChange={(val) => updateLocalBlind(index, 'motorType', val)} value={blind.motorType}><SelectTrigger><SelectValue placeholder="Select Motor Type" /></SelectTrigger><SelectContent><SelectItem value="Simotic or Ebony (RTS | WT)">Simotic or Ebony (RTS | WT)</SelectItem><SelectItem value="Wire Free (RTS)">Wire Free (RTS)</SelectItem></SelectContent></Select></FormItem>)}
                                     {isMotorized && (<FormItem><FormLabel>Remote Type</FormLabel><Input value={blind.remoteType} onChange={(e) => updateLocalBlind(index, 'remoteType', e.target.value)} /></FormItem>)}
                                     <FormItem><FormLabel>Control</FormLabel><Select onValueChange={(val) => updateLocalBlind(index, 'control', val)} value={blind.control}><SelectTrigger><SelectValue placeholder="Select Control" /></SelectTrigger><SelectContent><SelectItem value="LHT">LHT</SelectItem><SelectItem value="RHT">RHT</SelectItem></SelectContent></Select></FormItem>
                                     <FormItem><FormLabel>Bracket</FormLabel><Select onValueChange={(val) => updateLocalBlind(index, 'bracket', val)} value={blind.bracket}><SelectTrigger><SelectValue placeholder="Select Bracket" /></SelectTrigger><SelectContent><SelectItem value="Wall">Wall</SelectItem><SelectItem value="Celling">Celling</SelectItem></SelectContent></Select></FormItem>
                                     <FormItem><FormLabel>Bottom Channel</FormLabel><Select onValueChange={(val) => updateLocalBlind(index, 'bottomChannel', val)} value={blind.bottomChannel}><SelectTrigger><SelectValue placeholder="Select Channel" /></SelectTrigger><SelectContent><SelectItem value="Square">Square</SelectItem><SelectItem value="Rounded">Rounded</SelectItem><SelectItem value="Fabric Covered">Fabric Covered</SelectItem></SelectContent></Select></FormItem>
                                     <FormItem><FormLabel>Bottom Rail Color</FormLabel><Select onValueChange={(val) => updateLocalBlind(index, 'bottomRailColor', val)} value={blind.bottomRailColor}><SelectTrigger><SelectValue placeholder="Select Color" /></SelectTrigger><SelectContent><SelectItem value="Matching">Matching</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></FormItem>
                                     {showOtherColor && (<FormItem><FormLabel>Specify Color</FormLabel><Input value={blind.otherBottomRailColor} onChange={(e) => updateLocalBlind(index, 'otherBottomRailColor', e.target.value)} /></FormItem>)}
                                     <FormItem><FormLabel>Location of Blind</FormLabel><Input value={blind.locationOfBlind} onChange={(e) => updateLocalBlind(index, 'locationOfBlind', e.target.value)} /></FormItem>
                                     <FormItem><FormLabel>No Of Blind (Pcs)</FormLabel><Input type="number" value={blind.noOfBlind} onChange={(e) => updateLocalBlind(index, 'noOfBlind', e.target.value)} /></FormItem>
                                </div>
                            </Card>
                        )
                    })}
                    <Button variant="outline" onClick={() => setLocalBlinds(prev => [...prev, { id: new Date().toISOString() }])}><PlusCircle className="mr-2 h-4 w-4"/>Add Another Blind</Button>
                </div>
                </ScrollArea>
                <DialogFooter>
                    <Button onClick={handleSave}>Done</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


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
    const [bcnOptions, setBcnOptions] = useState<ComboboxOption[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [stagedItems, setStagedItems] = useState<z.infer<typeof newProductEntrySchema>[]>([]);
    const [blindDialogState, setBlindDialogState] = useState<{ isOpen: boolean; roomName: string | null }>({ isOpen: false, roomName: null });

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
                quantity: p.quantity || '0',
                mrp: p.mrp || '0',
                room: p.room || '',
                isBlind: (p as any).isBlind || false,
            })),
            room: '',
            newProduct: {
                collectionBrand: '',
                salesDescription: '',
                mrp: '',
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
                collectionBrand: '', salesDescription: '', mrp: '', 
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
            quantity: item.quantity || '0', // Ensure quantity has a default
            room,
            isBlind: false,
            id: `${item.collectionBrand}-${Date.now()}`
        }));
        append(newProductsForForm);
        setStagedItems([]);
        toast({ title: "Products Added", description: `${stagedItems.length} item(s) added to the list. Click 'Update Activity' to save.` });
    };

    const handleUpdateActivity = async () => {
        const productsToSave = form.getValues('products');
        setActivityLoading(true);
        const result = await updateDealProducts(customerId, dealId, productsToSave);
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
        const productsToSave = fields.filter(p => p.id && selectedProductIds.includes(p.id!));
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
    };
    
    const handleDeleteItem = (index: number) => {
        remove(index);
        toast({ title: "Item Removed", description: "Click 'Update Activity' to save this change." });
    };

    const handleUpdateSelectionStatus = async (selectionId: string, status: 'draft' | 'final') => {
        const result = await updateSelectionStatusAction(customerId, dealId, selectionId, status);
        if (result.success) {
            toast({ title: 'Status Updated', description: result.message });
            onRefresh();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
    };

    const groupedProducts = useMemo(() => {
        return fields.reduce((acc, product, index) => {
            const room = product.room || 'Unassigned';
            if (!acc[room]) {
                acc[room] = [];
            }
            acc[room].push({ ...product, originalIndex: index });
            return acc;
        }, {} as Record<string, (typeof fields[0] & { originalIndex: number })[]>);
    }, [fields]);

    const selectedRoom = form.watch('room');
    const selectedSelectionProducts = useMemo(() => {
                if (!selectedSelection) return [];
                return fields.filter(
                    p => p.id && selectedSelection.productIds?.includes(p.id)
                );
                }, [selectedSelection, fields]);

    return (
        <FormProvider {...form}>
            <Card className="mt-6">
                <CardContent className="p-6">
                    <form className="space-y-4">
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
                                    <Button type="button" variant="outline" onClick={() => {}}> <PlusCircle className="mr-2 h-4 w-4" /> Add new Room </Button>
                                     <Button type="button" variant="outline" onClick={() => { if (selectedRoom) { setBlindDialogState({ isOpen: true, roomName: selectedRoom }) } else { toast({ variant: 'destructive', title: 'No Room Selected' })}}} disabled={!selectedRoom}>
                                        Add Blind
                                    </Button>
                                    <Button type="button" onClick={handleAddProductsToList}>Add Products to List</Button>
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
                                <FormField control={form.control} name="newProduct.quantity" render={({ field }) => (<FormItem><FormLabel>Qty</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <FormField control={form.control} name="newProduct.verticalRepeat" render={({ field }) => (<FormItem><FormLabel>Vertical Repeat</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                                <FormField control={form.control} name="newProduct.horizontalRepeat" render={({ field }) => (<FormItem><FormLabel>Horizontal Repeat</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                                <FormField control={form.control} name="newProduct.remarks" render={({ field }) => (<FormItem><FormLabel>Remark</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                            </div>
                            
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
                     
                    <div className="space-y-4">
                         <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold">Previously Added Products</h3>
                             <Button type="button" onClick={handleUpdateActivity} disabled={activityLoading}>
                                {activityLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Update Activity
                            </Button>
                        </div>
                        {Object.entries(groupedProducts).map(([room, productsInRoom]) => (
                            <div key={room}>
                                <div className="flex items-center justify-between bg-muted/50 p-2 rounded-t-md">
                                    <h4 className="font-semibold">{room}</h4>
                                     <Button type="button" size="sm" variant="outline" onClick={() => { setBlindDialogState({ isOpen: true, roomName: room }) }}>
                                        Add Blind
                                    </Button>
                                </div>
                                <div className="border border-t-0 rounded-b-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead><Checkbox onCheckedChange={(checked) => {
                                                    const newSelection = { ...selectedRows };
                                                    productsInRoom.forEach(p => {
                                                        if (p.id) {
                                                            if (checked) newSelection[p.id] = true;
                                                            else delete newSelection[p.id];
                                                        }
                                                    });
                                                    setSelectedRows(newSelection);
                                                }} /></TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>BCN/Shade No</TableHead>
                                                <TableHead>Details</TableHead>
                                                <TableHead>Qty/Pcs</TableHead>
                                                <TableHead>Description</TableHead>
                                                <TableHead>Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {productsInRoom.map((product) => (
                                                <TableRow key={product.id}>
                                                    <TableCell><Checkbox checked={!!selectedRows[product.id!]} onCheckedChange={(checked) => { const newSelection = { ...selectedRows }; if (checked) {newSelection[product.id!] = true;} else {delete newSelection[product.id!];} setSelectedRows(newSelection); }} /></TableCell>
                                                     <TableCell>
                                                        <Badge variant={product.isBlind ? 'secondary' : 'outline'}>
                                                          {product.isBlind ? 'Blind' : 'Fabric'}
                                                        </Badge>
                                                      </TableCell>
                                                    <TableCell>{product.collectionBrand}</TableCell>
                                                    <TableCell className="text-xs">
                                                        {product.isBlind ? (
                                                          <>
                                                            <p>Type: {product.blindType || 'N/A'}</p>
                                                            <p>Op: {product.operating || 'N/A'}</p>
                                                          </>
                                                        ) : (
                                                          <p>MRP: {product.mrp}</p>
                                                        )}
                                                      </TableCell>
                                                    <TableCell>{product.isBlind ? product.noOfBlind : product.quantity}</TableCell>
                                                    <TableCell>{product.salesDescription}</TableCell>
                                                    <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => handleDeleteItem(product.originalIndex)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        ))}
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
                                        <TableHead>Status</TableHead>
                                        <TableHead>View</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {selections.map((selection) => {
                                        const selectionProducts = fields.filter(p => p.id && Array.isArray(selection.productIds) && selection.productIds.includes(p.id!));
                                        return (
                                            <TableRow key={selection.id}>
                                                <TableCell><Checkbox /></TableCell>
                                                <TableCell>{selection.id}</TableCell>
                                                <TableCell>{selection.totalRooms}</TableCell>
                                                <TableCell>₹{selection.totalMrp.toFixed(2)}</TableCell>
                                                <TableCell>{selection.totalPcs}</TableCell>
                                                <TableCell>
                                                    <Badge variant={selection.status === 'final' ? 'default' : 'secondary'} className={selection.status === 'final' ? 'bg-green-500' : ''}>
                                                        {selection.status || 'draft'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Button type="button" variant="ghost" size="icon" onClick={() => handleViewSelection(selection)}>
                                                        <Eye className="h-5 w-5"/>
                                                    </Button>
                                                </TableCell>
                                                <TableCell>
                                                     <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent>
                                                            {selection.status === 'final' ? (
                                                                <DropdownMenuItem onClick={() => handleUpdateSelectionStatus(selection.id, 'draft')}>
                                                                    Remove Final Selection
                                                                </DropdownMenuItem>
                                                            ) : (
                                                                <DropdownMenuItem onClick={() => handleUpdateSelectionStatus(selection.id, 'final')}>
                                                                    Final Selection
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                                </Table>
                        </div>
                    </div>
                        <div className="flex justify-between items-center pt-4 border-t">
                         <Button type="button" onClick={handleCreateSelection} disabled={selectionLoading}>{selectionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Selection</Button>
                        <Button type="button" onClick={handleQuotationClick}>Create Quotation</Button>
                    </div>
                    </form>
                </CardContent>
            </Card>
            {blindDialogState.isOpen && blindDialogState.roomName && (
                <AddBlindsDialog 
                    isOpen={blindDialogState.isOpen} 
                    onClose={() => setBlindDialogState({ isOpen: false, roomName: null })} 
                    roomName={blindDialogState.roomName}
                    appendProduct={append}
                />
            )}
            <CreateQuotationDialog isOpen={isQuotationDialogOpen} onClose={() => setIsQuotationDialogOpen(false)} onSuccess={onRefresh} deal={deal} customer={customer} initialItems={selectedProductsForQuotation} cpds={cpds} />
            
            {selectedSelection && (
                <Dialog open={!!selectedSelection} onOpenChange={() => setSelectedSelection(null)}>
                    <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle>Selection Details: #{selectedSelection.id}</DialogTitle>
                        </DialogHeader>
                        <div className="flex-grow overflow-y-auto">
                            <PrintableSelection 
                            selection={selectedSelection} 
                            deal={deal} 
                            products={selectedSelectionProducts}
                        />
                        </div>
                        <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setSelectedSelection(null)}>Close</Button>
                                <Button type="button" onClick={() => {}}><Printer className="mr-2 h-4 w-4"/>Print</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </FormProvider>
    )
}
