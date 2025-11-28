
"use client";

import React, { useEffect, useState } from "react";
import { useForm, useFieldArray, FormProvider, useFormContext, Control, useWatch, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Customer, User, Stock, TaxDetail, Dimension, StitchDimension, AdvanceDetail, CpdItem, CpdRoom } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { addCpdAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
import { Loader2, PlusCircle, Trash2, Calculator } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Image from "next/image";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { roomOptions, vasOptions } from "@/lib/constants";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";

const advanceDetailSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  pcs: z.string().min(1, "Pcs is required"),
  img: z.any().optional(),
});

const dimensionSchema = z.object({
  id: z.string().optional(),
  length: z.string().optional(),
  width: z.string().optional(),
  type: z.array(z.string()).optional(),
  advanceDetails: z.array(advanceDetailSchema).optional(),
});

const stitchDimensionSchema = z.object({
    id: z.string().optional(),
    vas: z.string().optional(),
    lengths: z.string().optional(),
    width: z.string().optional(),
    operation: z.string().optional(),
    noOfPanels: z.string().optional(),
    remark: z.string().optional(),
});

const cpdItemSchema = z.object({
  itemName: z.string().min(1, "Item Name (BCN) is required."),
  type: z.string().min(1, "Type is required."),
  qty: z.string().min(1, "Qty is required."),
  rate: z.string().optional().default('0'),
  dis: z.string().optional().default('0'),
  amount: z.string().optional().default('0'),
  fabricType: z.enum(['Main', 'Sheer', 'Lining', 'Sofa']).optional(),
  hasDimension: z.boolean().optional(),
  dimensions: z.array(dimensionSchema).optional(),
  hasStitchDimension: z.boolean().optional(),
  stitchDimensions: z.array(stitchDimensionSchema).optional(),
});

const cpdRoomSchema = z.object({
  room: z.string().min(1, "Room is required."),
  items: z.array(cpdItemSchema),
});

const cpdSchema = z.object({
  representative: z.string().min(1, "Representative is required."),
  customerName: z.string().optional(),
  telNo: z.string().optional(),
  date: z.string().optional(),
  rooms: z.array(cpdRoomSchema),
});

export type CpdFormValues = z.infer<typeof cpdSchema>;
export type AdvanceDetailFormValues = z.infer<typeof advanceDetailSchema>;

const initialProductTypeOptions: ComboboxOption[] = [
    { value: "fabric", label: "Fabric" },
    { value: "rod", label: "Rod" },
    { value: "channel", label: "Channel" },
    // ... add all other types
];

function AddOptionDialog({ isOpen, onClose, onSave, fieldName }: { isOpen: boolean, onClose: () => void, onSave: (value: string) => void, fieldName: string }) {
    const [value, setValue] = useState("");
    
    const handleSave = () => {
        if (value.trim()) {
            onSave(value.trim().toLowerCase().replace(/\s+/g, '-'));
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add New {fieldName}</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Input 
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={`Enter new ${fieldName.toLowerCase()}...`}
                    />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AddAdvanceDetailsDialog({ isOpen, onClose, onSave }: { isOpen: boolean; onClose: () => void; onSave: (data: AdvanceDetailFormValues) => void;}) {
    const form = useForm<AdvanceDetailFormValues>({
        resolver: zodResolver(advanceDetailSchema),
        defaultValues: { name: "", pcs: "", img: null },
    });
    
    const onSubmit = (data: AdvanceDetailFormValues) => {
        onSave({ ...data, id: new Date().toISOString() });
        onClose();
        form.reset();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader><DialogTitle>Add Advance Details</DialogTitle></DialogHeader>
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField control={form.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Enter name" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="pcs" render={({ field }) => ( <FormItem><FormLabel>Pcs</FormLabel><FormControl><Input placeholder="Enter pieces" type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="img" render={({ field }) => ( <FormItem><FormLabel>Image</FormLabel><FormControl><Input type="file" accept="image/*" onChange={(e) => field.onChange(e.target.files ? e.target.files[0] : null)} /></FormControl><FormMessage /></FormItem> )} />
                        <DialogFooter className="pt-4"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">Add</Button></DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    );
}

export function CpdForm({ customer, salesmen, dealId, onCpdAdded }: { customer: Customer, salesmen: User[], dealId: string, onCpdAdded: () => void }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [productTypeOptions, setProductTypeOptions] = useState<ComboboxOption[]>(initialProductTypeOptions);
    const [isAddOptionOpen, setIsAddOptionOpen] = useState(false);
    const [addOptionConfig, setAddOptionConfig] = useState<{ field: 'room' | 'type'; onSave: (value: string) => void } | null>(null);

    const openAddOptionDialog = (field: 'room' | 'type', onSaveCallback: (value: string) => void) => {
        setAddOptionConfig({ field, onSave: onSaveCallback });
        setIsAddOptionOpen(true);
    };

    const handleSaveNewOption = (value: string, label: string, field: 'room' | 'type') => {
        const newOption = { value, label };
        if (field === 'room') {
            (roomOptions as ComboboxOption[]).push(newOption);
        } else if (field === 'type') {
            setProductTypeOptions(prev => [...prev, newOption]);
        }
        addOptionConfig?.onSave(value);
    };

    const form = useForm<CpdFormValues>({
        resolver: zodResolver(cpdSchema),
        defaultValues: {
            customerName: customer.name,
            telNo: customer.mobileNo,
            date: format(new Date(), "yyyy-MM-dd"),
            rooms: [{ room: "", items: [{ itemName: '', type: '', qty: '', rate: '0', dis: '0', amount: '0', hasDimension: false, dimensions: [] }] }],
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "rooms"
    });
    
    const onSubmit = async (data: CpdFormValues) => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Authentication Error' });
            return;
        }
        setLoading(true);
        try {
            const result = await addCpdAction(customer.id, dealId, data, user.name);
            if (result.success) {
                toast({ title: 'Success', description: 'CPD has been saved.' });
                form.reset({
                    ...form.getValues(),
                    rooms: [{ room: "", items: [{ itemName: '', type: '', qty: '', rate: '0', dis: '0', amount: '0', hasDimension: false, dimensions: [] }] }],
                });
                onCpdAdded();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred.' });
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <Card>
                <CardContent className="pt-6">
                    <FormProvider {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                <FormField control={form.control} name="representative" render={({ field }) => ( <FormItem><FormLabel>Representative*</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Salesman" /></SelectTrigger></FormControl><SelectContent>{salesmen.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                                <FormField control={form.control} name="customerName" render={({ field }) => ( <FormItem><FormLabel>Customer Name</FormLabel><FormControl><Input {...field} readOnly /></FormControl></FormItem> )} />
                                <FormField control={form.control} name="telNo" render={({ field }) => ( <FormItem><FormLabel>Tele. No</FormLabel><FormControl><Input {...field} readOnly /></FormControl></FormItem> )} />
                                <FormField control={form.control} name="date" render={({ field }) => ( <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} readOnly /></FormControl></FormItem> )} />
                            </div>
                            <Separator />
                            <div className="space-y-4">
                                {fields.map((field, index) => (
                                    <RoomFields key={field.id} roomIndex={index} onRemoveRoom={() => remove(index)} roomOptions={roomOptions} productTypeOptions={productTypeOptions} openAddOptionDialog={openAddOptionDialog} />
                                ))}
                            </div>
                            <Button type="button" onClick={() => append({ room: "", items: [{ itemName: '', type: '', qty: '', rate: '0', dis: '0', amount: '0', hasDimension: false, dimensions: [] }] })}><PlusCircle className="mr-2 h-4 w-4" /> Add Another Room</Button>
                            <div className="form-footer flex justify-end items-center gap-4 pt-4 border-t">
                                <p className="text-sm text-destructive mr-auto">Please click on Update Activity if you have updated any changes.</p>
                                <Button type="submit" disabled={loading} className="bg-cyan-600 hover:bg-cyan-700">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update Activity</Button>
                            </div>
                        </form>
                    </FormProvider>
                </CardContent>
            </Card>
            <AddOptionDialog isOpen={isAddOptionOpen} onClose={() => setIsAddOptionOpen(false)} fieldName={addOptionConfig?.field || ''} onSave={(newValue) => { if (addOptionConfig) { handleSaveNewOption(newValue, newValue.replace(/-/g, ' '), addOptionConfig.field); } }} />
        </>
    )
}

function RoomFields({ roomIndex, onRemoveRoom, roomOptions, productTypeOptions, openAddOptionDialog }: { roomIndex: number, onRemoveRoom: () => void, roomOptions: ComboboxOption[], productTypeOptions: ComboboxOption[], openAddOptionDialog: (field: 'room' | 'type', onSave: (value: string) => void) => void }) {
    const { control } = useFormContext<CpdFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: `rooms.${roomIndex}.items` });

    return (
        <Card className="p-4 bg-muted/30">
            <div className="flex justify-between items-center mb-4">
                 <FormField control={control} name={`rooms.${roomIndex}.room`} render={({ field }) => ( <FormItem className="w-1/3"><FormLabel className="flex items-center gap-1">Room <span className="text-destructive">*</span><Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => openAddOptionDialog('room', (newValue) => field.onChange(newValue))}><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Room" /></SelectTrigger></FormControl><SelectContent>{roomOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                 <Button type="button" variant="destructive" size="sm" onClick={onRemoveRoom}><Trash2 className="mr-2 h-4 w-4" /> Remove Room</Button>
            </div>
            <div className="space-y-2">{fields.map((item, itemIndex) => (<ItemFields key={item.id} roomIndex={roomIndex} itemIndex={itemIndex} onRemoveItem={() => remove(itemIndex)} productTypeOptions={productTypeOptions} openAddOptionDialog={openAddOptionDialog} /> ))}</div>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({ itemName: '', type: '', qty: '', rate: '0', dis: '0', amount: '0', hasDimension: false, dimensions: [] })}><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button>
        </Card>
    );
}

function ItemFields({ roomIndex, itemIndex, onRemoveItem, productTypeOptions, openAddOptionDialog }: { roomIndex: number, itemIndex: number, onRemoveItem: () => void, productTypeOptions: ComboboxOption[], openAddOptionDialog: (field: 'room' | 'type', onSave: (value: string) => void) => void }) {
    const { control, watch, setValue } = useFormContext<CpdFormValues>();
    const itemType = watch(`rooms.${roomIndex}.items.${itemIndex}.type`);
    const hasDimension = watch(`rooms.${roomIndex}.items.${itemIndex}.hasDimension`);
    const hasStitchDimension = watch(`rooms.${roomIndex}.items.${itemIndex}.hasStitchDimension`);
    const { toast } = useToast();
    const [bcnOptions, setBcnOptions] = useState<{ value: string; label: string; stockItem: Stock, taxDetail?: TaxDetail }[]>([]);
    const [isSearchingBcn, setIsSearchingBcn] = useState(false);
    
    const watchedItem = watch(`rooms.${roomIndex}.items.${itemIndex}`);
    useEffect(() => {
        const qty = parseFloat(watchedItem.qty || '0');
        const rate = parseFloat(watchedItem.rate || '0');
        const dis = parseFloat(watchedItem.dis || '0');
        if (!isNaN(qty) && !isNaN(rate)) {
            const subtotal = qty * rate;
            const discountAmount = subtotal * (dis / 100);
            const finalAmount = subtotal - discountAmount;
            const currentAmount = parseFloat(watch(`rooms.${roomIndex}.items.${itemIndex}.amount`) || '0');
            if (currentAmount.toFixed(2) !== finalAmount.toFixed(2)) {
               setValue(`rooms.${roomIndex}.items.${itemIndex}.amount`, finalAmount.toFixed(2));
            }
        }
    }, [watchedItem.qty, watchedItem.rate, watchedItem.dis, roomIndex, itemIndex, setValue, watch]);

    const handleBcnSearch = async (query: string) => {
        if (query.length < 2) { setBcnOptions([]); return; }
        setIsSearchingBcn(true);
        try {
            const results = await searchStockByBcn(query);
            const optionsWithTax = await Promise.all(results.map(async stock => {
                let taxDetail: TaxDetail | undefined = undefined;
                if (stock.hsnCode) {
                    const taxDocRef = doc(db, 'taxDetails', stock.hsnCode);
                    const taxDocSnap = await getDoc(taxDocRef);
                    if (taxDocSnap.exists()) {
                        taxDetail = taxDocSnap.data() as TaxDetail;
                    }
                }
                return { value: stock.bcn || stock.id, label: stock.bcn || stock.id, stockItem: stock, taxDetail };
            }));
            setBcnOptions(optionsWithTax);
        } catch (error) {
            console.error("Error searching BCN:", error);
            toast({ variant: 'destructive', title: 'Search failed' });
        } finally {
            setIsSearchingBcn(false);
        }
    };
    
    const { fields: dimensionFields, append: appendDimension, remove: removeDimension } = useFieldArray({ control, name: `rooms.${roomIndex}.items.${itemIndex}.dimensions` });
    const { fields: stitchDimensionFields, append: appendStitchDimension, remove: removeStitchDimension } = useFieldArray({ control, name: `rooms.${roomIndex}.items.${itemIndex}.stitchDimensions` });

    const handleHasDimensionChange = (checked: boolean) => {
        setValue(`rooms.${roomIndex}.items.${itemIndex}.hasDimension`, checked);
        if (checked && dimensionFields.length === 0) {
            appendDimension({ id: new Date().toISOString(), length: '', width: '', type: [], advanceDetails: [] });
        } else if (!checked) {
            const dimensions = watch(`rooms.${roomIndex}.items.${itemIndex}.dimensions`);
            if (dimensions) { for (let i = dimensions.length - 1; i >= 0; i--) { removeDimension(i); } }
        }
    };

    const handleHasStitchDimensionChange = (checked: boolean) => {
        setValue(`rooms.${roomIndex}.items.${itemIndex}.hasStitchDimension`, checked);
        if (checked && stitchDimensionFields.length === 0) {
            appendStitchDimension({ id: new Date().toISOString(), vas: '', lengths: '', width: '', operation: '', noOfPanels: '', remark: '' });
        } else if (!checked) {
            const dimensions = watch(`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions`);
            if (dimensions) { for (let i = dimensions.length - 1; i >= 0; i--) { removeStitchDimension(i); } }
        }
    };

    return (
        <div className="p-3 border rounded-md bg-background space-y-3">
             <div className="flex items-end gap-2">
                <div className="grid grid-cols-3 gap-2 flex-grow">
                     <Controller control={control} name={`rooms.${roomIndex}.items.${itemIndex}.itemName`} render={({ field }) => ( <FormItem><FormLabel className="text-xs flex items-center gap-1">Item Name (BCN) <span className="text-destructive">*</span><Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => openAddOptionDialog('type', (newValue) => field.onChange(newValue))}><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel><Combobox options={bcnOptions} value={field.value} onSelect={(value) => { field.onChange(value); const selectedOption = bcnOptions.find(opt => opt.value === value); if (selectedOption) { const rate = selectedOption.stockItem.mrp?.toString() || '0'; setValue(`rooms.${roomIndex}.items.${itemIndex}.rate`, rate); } }} onSearch={handleBcnSearch} placeholder="Search by BCN..." /><FormMessage /></FormItem> )} />
                     <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.type`} render={({ field }) => ( <FormItem><FormLabel className="text-xs flex items-center gap-1">Type <span className="text-destructive">*</span><Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => openAddOptionDialog('type', (newValue) => field.onChange(newValue))}><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger></FormControl><SelectContent>{productTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                    {itemType === 'fabric' && ( <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.fabricType`} render={({ field }) => ( <FormItem><FormLabel className="text-xs">Fabric Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Fabric Type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Main">Main</SelectItem><SelectItem value="Sheer">Sheer</SelectItem><SelectItem value="Lining">Lining</SelectItem><SelectItem value="Sofa">Sofa</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} /> )}
                </div>
                <div className="grid grid-cols-3 gap-2 flex-grow">
                     <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.qty`} render={({ field }) => ( <FormItem><FormLabel className="text-xs">Qty <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.rate`} render={({ field }) => ( <FormItem><FormLabel className="text-xs">Rate</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.dis`} render={({ field }) => ( <FormItem><FormLabel className="text-xs">Dis%</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                </div>
                <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.amount`} render={({ field }) => ( <FormItem><FormLabel className="text-xs">Amount</FormLabel><FormControl><Input {...field} readOnly /></FormControl><FormMessage /></FormItem> )} />
                 <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={onRemoveItem}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center space-x-4">
              <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.hasDimension`} render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-2 space-y-0 pt-2"><FormControl><Checkbox checked={field.value} onCheckedChange={handleHasDimensionChange} /></FormControl><FormLabel className="font-medium">Dimension</FormLabel></FormItem> )} />
              <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.hasStitchDimension`} render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-2 space-y-0 pt-2"><FormControl><Checkbox checked={field.value} onCheckedChange={handleHasStitchDimensionChange} /></FormControl><FormLabel className="font-medium">Stitch Dimension</FormLabel></FormItem> )} />
            </div>
            {hasDimension && ( <div className="pl-4 space-y-3">{dimensionFields.map((dimField, dimIndex) => ( <DimensionFields key={dimField.id} roomIndex={roomIndex} itemIndex={itemIndex} dimensionIndex={dimIndex} onRemoveDimension={() => removeDimension(dimIndex)} /> ))}<Button type="button" size="sm" variant="outline" onClick={() => appendDimension({ id: new Date().toISOString(), length: '', width: '', type: [], advanceDetails: [] })}><PlusCircle className="mr-2 h-4 w-4" /> Add Dimension</Button></div> )}
            {hasStitchDimension && ( <div className="pl-4 space-y-3">{stitchDimensionFields.map((stitchField, stitchIndex) => ( <StitchDimensionFields key={stitchField.id} roomIndex={roomIndex} itemIndex={itemIndex} stitchDimensionIndex={stitchIndex} onRemoveStitchDimension={() => removeStitchDimension(stitchIndex)} /> ))}<Button type="button" size="sm" variant="outline" onClick={() => appendStitchDimension({ id: new Date().toISOString(), vas: '', lengths: '', width: '', operation: '', noOfPanels: '', remark: '' })}><PlusCircle className="mr-2 h-4 w-4" /> Add Stitch Dimension</Button></div> )}
        </div>
    )
}

function StitchDimensionFields({ roomIndex, itemIndex, stitchDimensionIndex, onRemoveStitchDimension }: { roomIndex: number; itemIndex: number; stitchDimensionIndex: number; onRemoveStitchDimension: () => void; }) {
    const { control, setValue } = useFormContext<CpdFormValues>();
    const handleOperationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value;
        const replacements: Record<string, string> = { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/3': '⅓', '2/3': '⅔', '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘', '1/6': '⅙', '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞' };
        for (const [key, rep] of Object.entries(replacements)) { value = value.replace(new RegExp(key, 'g'), rep); }
        setValue(`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.operation`, value, { shouldValidate: true });
    }
    
    return (
        <div className="p-3 border rounded-lg bg-gray-50/50 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.vas`} render={({ field }) => ( <FormItem><FormLabel className="text-xs">VAS</FormLabel><Combobox options={vasOptions} value={field.value} onSelect={field.onChange} placeholder="Select VAS" /></FormItem> )} />
                <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.lengths`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Lengths</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.width`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Width</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.operation`} render={({ field }) => ( <FormItem><FormLabel className="text-xs">Operation</FormLabel><FormControl><Input {...field} onChange={handleOperationChange} placeholder="e.g. 1 1/2 + 3 1/2" /></FormControl></FormItem> )} />
                <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.noOfPanels`} render={({ field }) => (<FormItem><FormLabel className="text-xs">No Of Panels</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.remark`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Remark</FormLabel><FormControl><Textarea {...field} rows={1} /></FormControl></FormItem>)} />
                <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={onRemoveStitchDimension}><Trash2 className="h-4 w-4" /></Button>
            </div>
        </div>
    )
}

function DimensionFields({ roomIndex, itemIndex, dimensionIndex, onRemoveDimension }: { roomIndex: number; itemIndex: number; dimensionIndex: number; onRemoveDimension: () => void; }) {
  const { control } = useFormContext<CpdFormValues>();
  const [isAdvanceDetailsOpen, setIsAdvanceDetailsOpen] = useState(false);
  const { fields, append } = useFieldArray({ control, name: `rooms.${roomIndex}.items.${itemIndex}.dimensions.${dimensionIndex}.advanceDetails` });

  const handleSaveAdvanceDetail = (data: AdvanceDetailFormValues) => {
    const newDetail: AdvanceDetail = { id: data.id || new Date().toISOString(), name: data.name, pcs: data.pcs, imageUrl: data.img ? 'https://placehold.co/100x100.png' : undefined };
    append(newDetail);
  };
    
  return (
    <div className="p-3 border rounded-lg bg-gray-50/50 space-y-3">
        <div className="flex items-end gap-3">
             <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.dimensions.${dimensionIndex}.length`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Length</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
             <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.dimensions.${dimensionIndex}.width`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Width</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.dimensions.${dimensionIndex}.type`} render={() => ( <FormItem><FormLabel className="text-xs">Type</FormLabel><div className="flex gap-2 items-center h-10">{['Wall to Wall', 'Celling to Wall', 'Other'].map(type => ( <FormField key={type} control={control} name={`rooms.${roomIndex}.items.${itemIndex}.dimensions.${dimensionIndex}.type`} render={({ field }) => ( <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><Checkbox checked={field.value?.includes(type)} onCheckedChange={checked => { return checked ? field.onChange([...field.value || [], type]) : field.onChange(field.value?.filter(v => v !== type)) }} /></FormControl><FormLabel className="font-normal text-xs">{type}</FormLabel></FormItem> )} /> ))}</div></FormItem> )} />
             <Separator orientation="vertical" className="h-10 mx-2" />
             <Button type="button" size="sm" variant="outline" onClick={() => setIsAdvanceDetailsOpen(true)}>Add Advance details</Button>
            <Button type="button" size="icon" variant="ghost" className="text-destructive self-center" onClick={onRemoveDimension}><Trash2 className="h-4 w-4" /></Button>
        </div>
        {fields.length > 0 && (
            <div className="space-y-2 pt-2">
                <h4 className="text-xs font-semibold">Advance Details:</h4>
                 <Table><TableHeader><TableRow><TableHead className="h-8 text-xs">Name</TableHead><TableHead className="h-8 text-xs">Pcs</TableHead><TableHead className="h-8 text-xs">Img</TableHead></TableRow></TableHeader>
                    <TableBody>{fields.map((advField: any) => ( <TableRow key={advField.id}><TableCell className="py-1 text-xs">{advField.name}</TableCell><TableCell className="py-1 text-xs">{advField.pcs}</TableCell><TableCell className="py-1 text-xs">{advField.imageUrl && <Image src={advField.imageUrl} alt="thumbnail" width={24} height={24} className="rounded" data-ai-hint="detail image" />}</TableCell></TableRow> ))}</TableBody>
                </Table>
            </div>
        )}
        <AddAdvanceDetailsDialog isOpen={isAdvanceDetailsOpen} onClose={() => setIsAdvanceDetailsOpen(false)} onSave={handleSaveAdvanceDetail} />
    </div>
  )
}

    