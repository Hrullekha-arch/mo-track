

"use client";

import React, { useEffect, useState, useMemo, useCallback, ReactNode, use } from "react";
import { useForm, useFieldArray, FormProvider, useFormContext, Control, UseFormReturn, Controller, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Customer, Deal, User, Stock, DealProduct, Quotation, DealOrder, DealVisit, DealMeasurement, DeliveryInstallationItem, Cpd, Dimension, AdvanceDetail, OrderType, Order, CpdItem, StitchDimension, TaxDetail } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Contact,
  FileText,
  GanttChartSquare,
  Home,
  MessageSquare,
  Package,
  Plane,
  Receipt,
  ShoppingCart,
  User as UserIcon,
  Info,
  CalendarDays,
  Clock,
  Loader2,
  PlusCircle,
  Calculator,
  Trash2,
  Edit,
  RefreshCw,
  Check,
  MoreVertical,
  Printer,
  Copy,
  FileDown,
  Eye,
  Contact2,
  Share2
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getCustomerById, getSalesmen } from "../../actions";
import { getDealById, updateDealProducts, getQuotationsForDeal, getOrdersForDeal, addVisitAction, getVisitsForDeal, addMeasurementAction, getMeasurementsForDeal, addCpdAction, getCpdsForDeal, createDealOrderAction } from "./actions";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
import { CreateQuotationDialog, ItemDetailValues } from "@/components/features/order-management/CreateQuotationDialog";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { QuotationDetailDialog } from "@/components/features/order-management/QuotationDetailDialog";
import { PrintableQuotationProfessional } from "@/components/features/order-management/PrintableQuotationProfessional";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { collection, onSnapshot, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { roomOptions, vasOptions } from "@/lib/constants";


export const deliveryInstallationItemSchema = z.object({
  id: z.string(),
  noOfPcs: z.string().optional(),
});

const visitSchema = z.object({
    representative: z.string().min(1, "Representative is required."),
    // Measurement fields
    measurements: z.array(z.string()).optional(),
    blinds: z.array(z.string()).optional(),
    curtain: z.array(z.string()).optional(),
    otherCurtain: z.string().optional(),
    // Delivery fields
    deliveryInstallations: z.array(deliveryInstallationItemSchema.nullable()).optional(),
    subDeliveryInstallations: z.array(deliveryInstallationItemSchema.nullable()).optional(),
    otherDelivery: z.string().optional(),
    orderId: z.string().optional(),
});


export type VisitFormValues = z.infer<typeof visitSchema>;

const measurementSchema = z.object({
    room: z.string().min(1, "Room is required."),
    measurementReference: z.string().min(1, "Measurement reference is required."),
    noOfUnits: z.string().min(1, "Number of units is required."),
    measurement: z.string().max(2000, "Measurement cannot exceed 2000 characters.").min(1, "Measurement is required."),
    file: z.any().optional(),
});

export type MeasurementFormValues = z.infer<typeof measurementSchema>;

const productSchema = z.object({
    id: z.string().optional(),
    productCategory: z.string().optional().default(''),
    collectionBrand: z.string().min(1, "Collection/Brand is required."), // This will now hold the BCN
    serialNo: z.string().optional().default(''),
    salesDescription: z.string().optional().default(''),
    quantity: z.string().min(1, "Quantity is required."),
    remarks: z.string().optional().default(''),
    room: z.string().optional().default(''),
    noOfPcs: z.string().optional().default('1'),
    info1: z.string().optional().default(''),
    info2: z.string().optional().default(''),
    stitchingType: z.enum(["in", "out"]).optional(),
    file: z.any().optional(),
    pushToMeasurement: z.boolean().default(false),
});

const productListSchema = z.object({
    products: z.array(productSchema)
})

type ProductFormValues = z.infer<typeof productSchema>;
type ProductListFormValues = z.infer<typeof productListSchema>;

const initialProductTypeOptions: ComboboxOption[] = [
    { value: "fabric", label: "Fabric" },
    { value: "rod", label: "Rod" },
    { value: "channel", label: "Channel" },
    { value: "roman-channel", label: "Roman Channel" },
    { value: "wooden-blind", label: "Wooden Blind" },
    { value: "tesal", label: "Tesal" },
    { value: "stick", label: "Stick" },
    { value: "knobs", label: "Knobs" },
    { value: "accessorise", label: "Accessorise" },
];


export const visitTypeOptions = [
    { value: "measurements", label: "Measurements" },
    { value: "fittings", label: "Fittings" },
    { value: "complaint", label: "Complaint" },
    { value: "tempo", label: "Tempo" },
    { value: "selection", label: "Selection" },
    { value: "other", label: "Other" },
];

export const measurementItems = [
    { id: 'curtain-measurement', label: 'Curtain Measurement' },
    { id: 'sofa-measurement', label: 'Sofa Measurement' },
    { id: 'blind-measurement', label: 'Blind Measurement' },
    { id: 'rod-and-channel-measurement', label: 'Rod and Channel Measurement' },
    { id: 'motorize-channel-measurement', label: 'Motorize Channel Measurement' },
    { id: 'wallpaper-measurement', label: 'Wallpaper measurement' },
    { id: 'furniture-measurement', label: 'Furniture Measurement' },
    { id: 'mattress-measurement', label: 'Mattress Measurement' },
    { id: 'wall-to-wall-measurement', label: 'Wall to Wall Measurement' },
    { id: 're-measurement', label: 'Re-Measurement' },
];

export const subMeasurementBlinds = [
    { id: 'roman-blind', label: 'Roman Blind' },
    { id: 'roller-blind', label: 'Roller Blind' },
    { id: 'wooden-blind', label: 'Wooden Blind' },
];

export const subMeasurementCurtain = [
    { id: 'three-pleat', label: 'Three Pleat' },
    { id: 'eyelet', label: 'Eyelet' },
    { id: 'other', label: 'Other' },
];

export const deliveryInstallationItems = [
    { id: 'curtain-installation', label: 'Curtain Installation' },
    { id: 'blind-installation', label: 'Blind Installation' },
    { id: 'rod-channel-installation', label: 'Rod+Channel installation' },
    { id: 'motorize-channel-installation', label: 'Motorize Channel Installation' },
    { id: 'delivery', label: 'Delivery' },
    { id: 'other', label: 'Other' },
];

export const subDeliveryInstallationItems = [
    { id: 'roman-blind', label: 'Roman Blind' },
    { id: 'roller-blind', label: 'Roller Blind' },
    { id: 'wooden-blind', label: 'Wooden Blind' },
];


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

function AddAdvanceDetailsDialog({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: AdvanceDetailFormValues) => void;
}) {
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
        <DialogHeader>
          <DialogTitle>Add Advance Details</DialogTitle>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pcs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pcs</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter pieces" type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="img"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image</FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => field.onChange(e.target.files ? e.target.files[0] : null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Add</Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}


function CpdForm({ customer, salesmen, dealId, onCpdAdded }: { customer: Customer, salesmen: User[], dealId: string, onCpdAdded: () => void }) {
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
        const newOption = { value, label, label.toUpperCase() };
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
                        {/* Top section */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <FormField
                                control={form.control}
                                name="representative"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Representative*</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Salesman" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {salesmen.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="customerName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Customer Name</FormLabel>
                                        <FormControl><Input {...field} readOnly /></FormControl>
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="telNo"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tele. No</FormLabel>
                                        <FormControl><Input {...field} readOnly /></FormControl>
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Date</FormLabel>
                                        <FormControl><Input type="date" {...field} readOnly /></FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>

                        <Separator />

                        {/* Rooms Section */}
                        <div className="space-y-4">
                            {fields.map((field, index) => (
                                <RoomFields 
                                    key={field.id} 
                                    roomIndex={index} 
                                    onRemoveRoom={() => remove(index)} 
                                    roomOptions={roomOptions}
                                    productTypeOptions={productTypeOptions}
                                    openAddOptionDialog={openAddOptionDialog}
                                />
                            ))}
                        </div>

                         <Button type="button" onClick={() => append({ room: "", items: [{ itemName: '', type: '', qty: '', rate: '0', dis: '0', amount: '0', hasDimension: false, dimensions: [] }] })}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Another Room
                        </Button>
                        
                         <div className="form-footer flex justify-end items-center gap-4 pt-4 border-t">
                            <p className="text-sm text-destructive mr-auto">Please click on Update Activity if you have updated any changes.</p>
                            <Button type="submit" disabled={loading} className="bg-cyan-600 hover:bg-cyan-700">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Update Activity
                            </Button>
                        </div>
                    </form>
                </FormProvider>
            </CardContent>
        </Card>
        <AddOptionDialog 
            isOpen={isAddOptionOpen}
            onClose={() => setIsAddOptionOpen(false)}
            fieldName={addOptionConfig?.field || ''}
            onSave={(newValue) => {
                if (addOptionConfig) {
                    handleSaveNewOption(newValue, newValue.replace(/-/g, ' '), addOptionConfig.field);
                }
            }}
        />
        </>
    )
}

function RoomFields({ roomIndex, onRemoveRoom, roomOptions, productTypeOptions, openAddOptionDialog }: { roomIndex: number, onRemoveRoom: () => void, roomOptions: ComboboxOption[], productTypeOptions: ComboboxOption[], openAddOptionDialog: (field: 'room' | 'type', onSave: (value: string) => void) => void }) {
    const { control } = useFormContext<CpdFormValues>();
    
    const { fields, append, remove } = useFieldArray({
        control,
        name: `rooms.${roomIndex}.items`
    });

    return (
        <Card className="p-4 bg-muted/30">
            <div className="flex justify-between items-center mb-4">
                 <FormField
                    control={control}
                    name={`rooms.${roomIndex}.room`}
                    render={({ field }) => (
                        <FormItem className="w-1/3">
                            <FormLabel className="flex items-center gap-1">Room <span className="text-destructive">*</span>
                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => openAddOptionDialog('room', (newValue) => field.onChange(newValue))}>
                                    <PlusCircle className="h-4 w-4 text-primary" />
                                </Button>
                            </FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select Room" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {roomOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                             <FormMessage />
                        </FormItem>
                    )}
                />
                 <Button type="button" variant="destructive" size="sm" onClick={onRemoveRoom}>
                    <Trash2 className="mr-2 h-4 w-4" /> Remove Room
                </Button>
            </div>
            
             <div className="space-y-2">
                {fields.map((item, itemIndex) => (
                    <ItemFields
                        key={item.id}
                        roomIndex={roomIndex}
                        itemIndex={itemIndex}
                        onRemoveItem={() => remove(itemIndex)}
                        productTypeOptions={productTypeOptions}
                        openAddOptionDialog={openAddOptionDialog}
                    />
                ))}
             </div>
             <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({ itemName: '', type: '', qty: '', rate: '0', dis: '0', amount: '0', hasDimension: false, dimensions: [] })}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Item
            </Button>
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
    
    // Auto-calculate amount
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
    
     const { fields: dimensionFields, append: appendDimension, remove: removeDimension } = useFieldArray({
        control,
        name: `rooms.${roomIndex}.items.${itemIndex}.dimensions`,
    });

     const { fields: stitchDimensionFields, append: appendStitchDimension, remove: removeStitchDimension } = useFieldArray({
        control,
        name: `rooms.${roomIndex}.items.${itemIndex}.stitchDimensions`,
    });

    const handleHasDimensionChange = (checked: boolean) => {
        setValue(`rooms.${roomIndex}.items.${itemIndex}.hasDimension`, checked);
        if (checked && dimensionFields.length === 0) {
            appendDimension({ id: new Date().toISOString(), length: '', width: '', type: [], advanceDetails: [] });
        } else if (!checked) {
            const dimensions = watch(`rooms.${roomIndex}.items.${itemIndex}.dimensions`);
            if (dimensions) {
                for (let i = dimensions.length - 1; i >= 0; i--) {
                    removeDimension(i);
                }
            }
        }
    };

    const handleHasStitchDimensionChange = (checked: boolean) => {
        setValue(`rooms.${roomIndex}.items.${itemIndex}.hasStitchDimension`, checked);
        if (checked && stitchDimensionFields.length === 0) {
            appendStitchDimension({ id: new Date().toISOString(), vas: '', lengths: '', width: '', operation: '', noOfPanels: '', remark: '' });
        } else if (!checked) {
            const dimensions = watch(`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions`);
            if (dimensions) {
                for (let i = dimensions.length - 1; i >= 0; i--) {
                    removeStitchDimension(i);
                }
            }
        }
    };

    return (
        <div className="p-3 border rounded-md bg-background space-y-3">
             <div className="flex items-end gap-2">
                <div className="grid grid-cols-3 gap-2 flex-grow">
                     <Controller
                        control={control}
                        name={`rooms.${roomIndex}.items.${itemIndex}.itemName`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs flex items-center gap-1">Item Name (BCN) <span className="text-destructive">*</span>
                                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => openAddOptionDialog('type', (newValue) => field.onChange(newValue))}>
                                        <PlusCircle className="h-4 w-4 text-primary" />
                                    </Button>
                                </FormLabel>
                                <Combobox 
                                    options={bcnOptions}
                                    value={field.value}
                                    onSelect={(value) => {
                                        field.onChange(value);
                                        const selectedOption = bcnOptions.find(opt => opt.value === value);
                                        if (selectedOption) {
                                            const rate = selectedOption.stockItem.mrp?.toString() || '0';
                                            setValue(`rooms.${roomIndex}.items.${itemIndex}.rate`, rate);
                                        }
                                    }}
                                    onSearch={handleBcnSearch}
                                    placeholder="Search by BCN..."
                                />
                                 <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
                        control={control}
                        name={`rooms.${roomIndex}.items.${itemIndex}.type`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs flex items-center gap-1">Type <span className="text-destructive">*</span>
                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => openAddOptionDialog('type', (newValue) => field.onChange(newValue))}>
                                    <PlusCircle className="h-4 w-4 text-primary" />
                                </Button>
                                </FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        {productTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    {itemType === 'fabric' && (
                        <FormField
                            control={control}
                            name={`rooms.${roomIndex}.items.${itemIndex}.fabricType`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">Fabric Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Select Fabric Type" /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="Main">Main</SelectItem>
                                            <SelectItem value="Sheer">Sheer</SelectItem>
                                            <SelectItem value="Lining">Lining</SelectItem>
                                            <SelectItem value="Sofa">Sofa</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}
                </div>
                <div className="grid grid-cols-3 gap-2 flex-grow">
                     <FormField
                        control={control}
                        name={`rooms.${roomIndex}.items.${itemIndex}.qty`}
                        render={({ field }) => ( <FormItem><FormLabel className="text-xs">Qty <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}
                    />
                    <FormField
                        control={control}
                        name={`rooms.${roomIndex}.items.${itemIndex}.rate`}
                        render={({ field }) => ( <FormItem><FormLabel className="text-xs">Rate</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}
                    />
                    <FormField
                        control={control}
                        name={`rooms.${roomIndex}.items.${itemIndex}.dis`}
                        render={({ field }) => ( <FormItem><FormLabel className="text-xs">Dis%</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}
                    />
                </div>
                <FormField
                    control={control}
                    name={`rooms.${roomIndex}.items.${itemIndex}.amount`}
                    render={({ field }) => ( <FormItem><FormLabel className="text-xs">Amount</FormLabel><FormControl><Input {...field} readOnly /></FormControl><FormMessage /></FormItem> )}
                />
                 <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={onRemoveItem}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
            <div className="flex items-center space-x-4">
              <FormField
                  control={control}
                  name={`rooms.${roomIndex}.items.${itemIndex}.hasDimension`}
                  render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-2 space-y-0 pt-2">
                          <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={handleHasDimensionChange} />
                          </FormControl>
                          <FormLabel className="font-medium">Dimension</FormLabel>
                      </FormItem>
                  )}
              />
              <FormField
                  control={control}
                  name={`rooms.${roomIndex}.items.${itemIndex}.hasStitchDimension`}
                  render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-2 space-y-0 pt-2">
                          <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={handleHasStitchDimensionChange} />
                          </FormControl>
                          <FormLabel className="font-medium">Stitch Dimension</FormLabel>
                      </FormItem>
                  )}
              />
            </div>

            {hasDimension && (
                <div className="pl-4 space-y-3">
                    {dimensionFields.map((dimField, dimIndex) => (
                        <DimensionFields key={dimField.id} roomIndex={roomIndex} itemIndex={itemIndex} dimensionIndex={dimIndex} onRemoveDimension={() => removeDimension(dimIndex)} />
                    ))}
                    <Button type="button" size="sm" variant="outline" onClick={() => appendDimension({ id: new Date().toISOString(), length: '', width: '', type: [], advanceDetails: [] })}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Dimension
                    </Button>
                </div>
            )}
             {hasStitchDimension && (
                <div className="pl-4 space-y-3">
                    {stitchDimensionFields.map((stitchField, stitchIndex) => (
                        <StitchDimensionFields key={stitchField.id} roomIndex={roomIndex} itemIndex={itemIndex} stitchDimensionIndex={stitchIndex} onRemoveStitchDimension={() => removeStitchDimension(stitchIndex)} />
                    ))}
                    <Button type="button" size="sm" variant="outline" onClick={() => appendStitchDimension({ id: new Date().toISOString(), vas: '', lengths: '', width: '', operation: '', noOfPanels: '', remark: '' })}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Stitch Dimension
                    </Button>
                </div>
            )}
        </div>
    )
}

function StitchDimensionFields({ roomIndex, itemIndex, stitchDimensionIndex, onRemoveStitchDimension }: { roomIndex: number; itemIndex: number; stitchDimensionIndex: number; onRemoveStitchDimension: () => void; }) {
    const { control, setValue } = useFormContext<CpdFormValues>();
    
    const handleOperationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value;

        // Replace common fractions with Unicode characters
        const replacements: Record<string, string> = {
            '1/2': '½', '1/4': '¼', '3/4': '¾',
            '1/3': '⅓', '2/3': '⅔', '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘',
            '1/6': '⅙', '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞'
        };

        for (const [key, rep] of Object.entries(replacements)) {
            value = value.replace(new RegExp(key, 'g'), rep);
        }

        setValue(`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.operation`, value, { shouldValidate: true });
    }
    
    return (
        <div className="p-3 border rounded-lg bg-gray-50/50 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <FormField
                    control={control}
                    name={`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.vas`}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-xs">VAS</FormLabel>
                            <Combobox options={vasOptions} value={field.value} onSelect={field.onChange} placeholder="Select VAS" />
                        </FormItem>
                    )}
                />
                 <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.lengths`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Lengths</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                 <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.width`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Width</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                 <FormField 
                    control={control} 
                    name={`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.operation`} 
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-xs">Operation</FormLabel>
                            <FormControl>
                                <Input 
                                    {...field}
                                    onChange={handleOperationChange}
                                    placeholder="e.g. 1 1/2 + 3 1/2" 
                                />
                            </FormControl>
                        </FormItem>
                    )} 
                />
                 <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.noOfPanels`} render={({ field }) => (<FormItem><FormLabel className="text-xs">No Of Panels</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.stitchDimensions.${stitchDimensionIndex}.remark`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Remark</FormLabel><FormControl><Textarea {...field} rows={1} /></FormControl></FormItem>)} />
                <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={onRemoveStitchDimension}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}

function DimensionFields({ roomIndex, itemIndex, dimensionIndex, onRemoveDimension }: { roomIndex: number; itemIndex: number; dimensionIndex: number; onRemoveDimension: () => void; }) {
  const { control, watch, setValue } = useFormContext<CpdFormValues>();
  const [isAdvanceDetailsOpen, setIsAdvanceDetailsOpen] = useState(false);
  const { fields, append } = useFieldArray({
    control,
    name: `rooms.${roomIndex}.items.${itemIndex}.dimensions.${dimensionIndex}.advanceDetails`,
  });

  const handleSaveAdvanceDetail = (data: AdvanceDetailFormValues) => {
    // Here, you would handle image upload and get a URL, for now, we'll use a placeholder
    const newDetail: AdvanceDetail = {
      id: data.id || new Date().toISOString(),
      name: data.name,
      pcs: data.pcs,
      imageUrl: data.img ? 'https://placehold.co/100x100.png' : undefined,
    };
    append(newDetail);
  };
    
  return (
    <div className="p-3 border rounded-lg bg-gray-50/50 space-y-3">
        <div className="flex items-end gap-3">
             <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.dimensions.${dimensionIndex}.length`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Length</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
             <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.dimensions.${dimensionIndex}.width`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Width</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            <FormField control={control} name={`rooms.${roomIndex}.items.${itemIndex}.dimensions.${dimensionIndex}.type`}
                render={() => (
                    <FormItem>
                         <FormLabel className="text-xs">Type</FormLabel>
                         <div className="flex gap-2 items-center h-10">
                            {['Wall to Wall', 'Celling to Wall', 'Other'].map(type => (
                                <FormField key={type} control={control} name={`rooms.${roomIndex}.items.${itemIndex}.dimensions.${dimensionIndex}.type`}
                                    render={({ field }) => (
                                        <FormItem className="flex items-center space-x-2 space-y-0">
                                            <FormControl><Checkbox checked={field.value?.includes(type)} onCheckedChange={checked => { return checked ? field.onChange([...field.value || [], type]) : field.onChange(field.value?.filter(v => v !== type)) }} /></FormControl>
                                            <FormLabel className="font-normal text-xs">{type}</FormLabel>
                                        </FormItem>
                                    )}
                                />
                            ))}
                         </div>
                    </FormItem>
                )}
            />
             <Separator orientation="vertical" className="h-10 mx-2" />
             <Button type="button" size="sm" variant="outline" onClick={() => setIsAdvanceDetailsOpen(true)}>Add Advance details</Button>
            <Button type="button" size="icon" variant="ghost" className="text-destructive self-center" onClick={onRemoveDimension}>
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
        {fields.length > 0 && (
            <div className="space-y-2 pt-2">
                <h4 className="text-xs font-semibold">Advance Details:</h4>
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="h-8 text-xs">Name</TableHead>
                            <TableHead className="h-8 text-xs">Pcs</TableHead>
                            <TableHead className="h-8 text-xs">Img</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {fields.map((advField: any, advIndex) => (
                           <TableRow key={advField.id}>
                                <TableCell className="py-1 text-xs">{advField.name}</TableCell>
                                <TableCell className="py-1 text-xs">{advField.pcs}</TableCell>
                                <TableCell className="py-1 text-xs">
                                     {advField.imageUrl && <Image src={advField.imageUrl} alt="thumbnail" width={24} height={24} className="rounded" data-ai-hint="detail image" />}
                                </TableCell>
                           </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        )}
        <AddAdvanceDetailsDialog isOpen={isAdvanceDetailsOpen} onClose={() => setIsAdvanceDetailsOpen(false)} onSave={handleSaveAdvanceDetail} />
    </div>
  )
}

function VisitForm({ salesmen, customerId, dealId, onVisitAdded, visits, orders }: { salesmen: User[], customerId: string, dealId: string, onVisitAdded: (visit: DealVisit) => void, visits: DealVisit[], orders: DealOrder[] }) {
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('measurement');
    const [showShareDialog, setShowShareDialog] = useState(false);
    const [whatsAppUrl, setWhatsAppUrl] = useState('');
    const { toast } = useToast();
    const { user } = useAuth();
    
    const hasMeasurementVisit = useMemo(() => visits.some(v => v.typeOfVisit === 'measurement'), [visits]);

    const form = useForm<VisitFormValues>({
        resolver: zodResolver(visitSchema),
        defaultValues: {
            representative: "",
            measurements: [],
            blinds: [],
            curtain: [],
            otherCurtain: '',
            deliveryInstallations: [],
            subDeliveryInstallations: [],
            otherDelivery: '',
            orderId: '',
        }
    });

    const watchedMeasurements = form.watch("measurements");
    const watchedDeliveryInstallations = form.watch("deliveryInstallations");

    async function onSubmit(data: VisitFormValues) {
        if (!user) {
            toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
            return;
        }
        setLoading(true);
        try {
            const visitDataForDb = {
                ...data,
                typeOfVisit: activeTab,
            };

            const result = await addVisitAction(customerId, dealId, visitDataForDb, user.name);
            if (result.success && result.visit) {
                toast({ title: "Visit Request Created", description: "Share the link with the customer to confirm." });
                onVisitAdded(result.visit);
                if (result.whatsAppUrl) {
                    setWhatsAppUrl(result.whatsAppUrl);
                    setShowShareDialog(true);
                }
                form.reset();
            } else {
                 toast({ variant: "destructive", title: "Error", description: result.message });
            }
        } catch (e) {
             toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
        } finally {
            setLoading(false);
        }
    }
    
    const DeliveryVisitTabContent = (
        <div className="space-y-6">
            <FormField
                control={form.control}
                name="orderId"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Select Order Number</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select an order to associate with this visit" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {orders.map(order => (
                                    <SelectItem key={order.id} value={order.orderNo}>
                                        {order.orderNo}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Delivery/Installation Column */}
                <div className="space-y-3">
                    <FormLabel className="font-semibold">Delivery/Installation</FormLabel>
                    {deliveryInstallationItems.map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                            <FormField
                                control={form.control}
                                name="deliveryInstallations"
                                render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value?.some(v => v?.id === item.id)}
                                                onCheckedChange={(checked) => {
                                                    const currentValues = field.value || [];
                                                    if (checked) {
                                                        field.onChange([...currentValues, { id: item.id, noOfPcs: '1' }]);
                                                    } else {
                                                        field.onChange(currentValues.filter(v => v?.id !== item.id));
                                                    }
                                                }}
                                            />
                                        </FormControl>
                                        <FormLabel className="font-normal">{item.label}</FormLabel>
                                    </FormItem>
                                )}
                            />
                           {item.id !== 'blind-installation' && (
                                <FormField
                                    control={form.control}
                                    name={`deliveryInstallations.${form.watch('deliveryInstallations')?.findIndex(d => d?.id === item.id)}.noOfPcs`}
                                    render={({ field }) => (
                                        <FormControl>
                                            <Input
                                                type="number"
                                                className="h-7 w-20"
                                                placeholder="Pcs"
                                                disabled={!form.watch('deliveryInstallations')?.some(v => v?.id === item.id)}
                                                onChange={(e) => {
                                                    const currentValues = form.getValues('deliveryInstallations') || [];
                                                    const itemIndex = currentValues.findIndex(v => v?.id === item.id);
                                                    if (itemIndex > -1 && currentValues[itemIndex]) {
                                                        const newValues = [...currentValues];
                                                        newValues[itemIndex] = { ...newValues[itemIndex]!, noOfPcs: e.target.value };
                                                        form.setValue('deliveryInstallations', newValues);
                                                    }
                                                }}
                                                value={form.getValues('deliveryInstallations')?.find(v => v?.id === item.id)?.noOfPcs || ''}
                                            />
                                        </FormControl>
                                    )}
                                />
                            )}
                        </div>
                    ))}
                    {form.watch('deliveryInstallations')?.some(v => v?.id === 'other') && (
                        <FormField control={form.control} name="otherDelivery" render={({ field }) => ( <FormControl><Input placeholder="Specify other" {...field} className="h-8" /></FormControl> )} />
                    )}
                </div>
                 {/* Sub-Delivery/Installation Column */}
                 {watchedDeliveryInstallations?.some(d => d?.id === 'blind-installation') && (
                     <div className="space-y-3">
                         <FormLabel className="font-semibold">Sub-Delivery/Installation</FormLabel>
                          {subDeliveryInstallationItems.map((item) => (
                            <div key={item.id} className="flex items-center gap-2">
                                <FormField
                                    control={form.control}
                                    name="subDeliveryInstallations"
                                    render={({ field }) => (
                                        <FormItem className="flex items-center space-x-2 space-y-0">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value?.some(v => v?.id === item.id)}
                                                    onCheckedChange={(checked) => {
                                                        const currentValues = field.value || [];
                                                        if (checked) {
                                                            field.onChange([...currentValues, { id: item.id, noOfPcs: '1' }]);
                                                        } else {
                                                            field.onChange(currentValues.filter(v => v?.id !== item.id));
                                                        }
                                                    }}
                                                />
                                            </FormControl>
                                            <FormLabel className="font-normal">{item.label}</FormLabel>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`subDeliveryInstallations.${form.watch('subDeliveryInstallations')?.findIndex(d => d?.id === item.id)}.noOfPcs`}
                                    render={({ field }) => (
                                        <FormControl>
                                            <Input
                                                type="number"
                                                className="h-7 w-20"
                                                placeholder="Pcs"
                                                disabled={!form.watch('subDeliveryInstallations')?.some(v => v?.id === item.id)}
                                                onChange={(e) => {
                                                    const currentValues = form.getValues('subDeliveryInstallations') || [];
                                                    const itemIndex = currentValues.findIndex(v => v?.id === item.id);
                                                    if (itemIndex > -1 && currentValues[itemIndex]) {
                                                        const newValues = [...currentValues];
                                                        newValues[itemIndex] = { ...newValues[itemIndex]!, noOfPcs: e.target.value };
                                                        form.setValue('subDeliveryInstallations', newValues, { shouldValidate: true });
                                                    }
                                                }}
                                                value={form.getValues('subDeliveryInstallations')?.find(v => v?.id === item.id)?.noOfPcs || ''}
                                            />
                                        </FormControl>
                                    )}
                                />
                            </div>
                         ))}
                     </div>
                )}
            </div>
        </div>
    );

    return (
        <>
         <Card className="mt-6">
            <CardHeader className="flex flex-row justify-between items-center">
                <CardTitle>Add Visit</CardTitle>
                <Button variant="outline">Add Visit</Button>
            </CardHeader>
            <CardContent className="p-6">
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <div className="border rounded-lg">
                             <div className="flex">
                                <button type="button" onClick={() => setActiveTab('measurement')} className={`flex-1 p-3 font-semibold text-center ${activeTab === 'measurement' ? 'bg-primary text-primary-foreground rounded-tl-md' : 'bg-muted/50'}`}>Measurement Visit</button>
                                <Separator orientation="vertical" />
                                <button 
                                    type="button" 
                                    onClick={() => setActiveTab('delivery')} 
                                    className={`flex-1 p-3 font-semibold text-center ${activeTab === 'delivery' ? 'bg-primary text-primary-foreground rounded-tr-md' : 'bg-muted/50'}`}
                                >
                                    Delivery Visit
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <FormField
                                        control={form.control}
                                        name="representative"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Representative</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger><SelectValue placeholder="All User" /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {salesmen.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                {activeTab === 'measurement' ? (
                                    <>
                                        <div className="border rounded-lg p-4">
                                            <FormLabel className="mb-4 block font-semibold">Type Of Measurement</FormLabel>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <FormField
                                                    control={form.control}
                                                    name="measurements"
                                                    render={() => (
                                                        <FormItem className="space-y-3">
                                                            <FormLabel>Measurements</FormLabel>
                                                            {measurementItems.map((item) => (
                                                                <FormField
                                                                    key={item.id}
                                                                    control={form.control}
                                                                    name="measurements"
                                                                    render={({ field }) => {
                                                                        return (
                                                                            <FormItem key={item.id} className="flex flex-row items-start space-x-3 space-y-0">
                                                                                <FormControl><Checkbox checked={field.value?.includes(item.id)} onCheckedChange={(checked) => { return checked ? field.onChange([...(field.value || []), item.id]) : field.onChange(field.value?.filter((value) => value !== item.id)) }} /></FormControl>
                                                                                <FormLabel className="font-normal">{item.label}</FormLabel>
                                                                            </FormItem>
                                                                        )
                                                                    }}
                                                                />
                                                            ))}
                                                        </FormItem>
                                                    )}
                                                />
                                                <div className="space-y-4">
                                                    <p className="font-medium text-sm">Sub-Measurements</p>
                                                    {watchedMeasurements?.includes('blind-measurement') && (
                                                        <FormField
                                                            control={form.control}
                                                            name="blinds"
                                                            render={() => (
                                                                <FormItem className="space-y-3 pl-4">
                                                                    <FormLabel>Blinds</FormLabel>
                                                                    {subMeasurementBlinds.map((item) => (
                                                                        <FormField key={item.id} control={form.control} name="blinds"
                                                                            render={({ field }) => (
                                                                                <FormItem key={item.id} className="flex flex-row items-start space-x-3 space-y-0">
                                                                                    <FormControl><Checkbox checked={field.value?.includes(item.id)} onCheckedChange={(checked) => { return checked ? field.onChange([...(field.value || []), item.id]) : field.onChange(field.value?.filter((value) => value !== item.id)) }} /></FormControl>
                                                                                    <FormLabel className="font-normal">{item.label}</FormLabel>
                                                                                </FormItem>
                                                                            )}
                                                                        />
                                                                    ))}
                                                                </FormItem>
                                                            )}
                                                        />
                                                    )}
                                                     {watchedMeasurements?.includes('curtain-measurement') && (
                                                        <FormField
                                                            control={form.control}
                                                            name="curtain"
                                                            render={() => (
                                                                <FormItem className="space-y-3 pl-4">
                                                                    <FormLabel>Curtain</FormLabel>
                                                                    {subMeasurementCurtain.map((item) => (
                                                                        <FormField key={item.id} control={form.control} name="curtain"
                                                                            render={({ field }) => (
                                                                                <FormItem key={item.id} className="flex flex-row items-center space-x-3 space-y-0">
                                                                                    <FormControl><Checkbox checked={field.value?.includes(item.id)} onCheckedChange={(checked) => { return checked ? field.onChange([...(field.value || []), item.id]) : field.onChange(field.value?.filter((value) => value !== item.id)) }} /></FormControl>
                                                                                    <FormLabel className="font-normal">{item.label}</FormLabel>
                                                                                    {item.id === 'other' && form.watch('curtain')?.includes('other') && (
                                                                                        <FormField control={form.control} name="otherCurtain" render={({ field }) => ( <FormControl><Input {...field} className="h-7" /></FormControl> )} />
                                                                                    )}
                                                                                </FormItem>
                                                                            )}
                                                                        />
                                                                    ))}
                                                                </FormItem>
                                                            )}
                                                        />
                                                     )}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div>
                                        {DeliveryVisitTabContent}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="mt-8 flex">
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Update Activity
                            </Button>
                        </div>
                    </form>
                 </Form>
            </CardContent>
        </Card>
        <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Share Visit Confirmation Link</DialogTitle>
                    <DialogDescription>
                        Copy the link below and share it with the customer via WhatsApp so they can confirm their visit details.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Input value={whatsAppUrl} readOnly />
                </div>
                <DialogFooter>
                    <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(whatsAppUrl); toast({title: "Link Copied!"})}}>Copy Link</Button>
                    <Button asChild>
                        <a href={whatsAppUrl} target="_blank" rel="noopener noreferrer">
                            <Share2 className="mr-2 h-4 w-4" /> Open WhatsApp
                        </a>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    )
}

function MeasurementForm({ onMeasurementAdded, customerId, dealId }: { onMeasurementAdded: (measurement: DealMeasurement) => void, customerId: string, dealId: string }) {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();
    const [isAddRoomOpen, setIsAddRoomOpen] = useState(false);
    
    const form = useForm<MeasurementFormValues>({
        resolver: zodResolver(measurementSchema),
        defaultValues: {
            room: "",
            measurementReference: "",
            noOfUnits: "1",
            measurement: "",
            file: null,
        },
    });

    const handleSaveNewRoom = (value: string, label: string) => {
        (roomOptions as ComboboxOption[]).push({ value, label, label.toUpperCase() });
        form.setValue('room', value);
    };

    const onSubmit = async (data: MeasurementFormValues) => {
        if (!user) {
            toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
            return;
        }
        setLoading(true);
        try {
            const result = await addMeasurementAction(customerId, dealId, data, user.name);
            if (result.success && result.measurement) {
                toast({ title: "Measurement Added", description: "The new measurement has been saved." });
                onMeasurementAdded(result.measurement);
                form.reset();
            } else {
                 toast({ variant: "destructive", title: "Error", description: result.message });
            }
        } catch (e) {
            toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
        <Card className="mt-6">
            <CardContent className="p-6">
                <h3 className="text-xl font-semibold mb-6">Add More Measurements</h3>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-6">
                                <FormField
                                    control={form.control}
                                    name="room"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-1">Room <span className="text-destructive">*</span><Info className="h-3 w-3" />
                                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => setIsAddRoomOpen(true)}>
                                                    <PlusCircle className="h-4 w-4 text-primary" />
                                                </Button>
                                            </FormLabel>
                                            <Combobox
                                                options={roomOptions}
                                                value={field.value}
                                                onSelect={field.onChange}
                                                placeholder="--SELECT--"
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="noOfUnits"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>No of Units <span className="text-destructive">*</span></FormLabel>
                                            <FormControl>
                                                <Input {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="file"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Upload file</FormLabel>
                                            <FormControl>
                                                <Input type="file" onChange={(e) => field.onChange(e.target.files ? e.target.files[0] : null)} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="space-y-6">
                                <FormField
                                    control={form.control}
                                    name="measurementReference"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Measurement Reference <span className="text-destructive">*</span></FormLabel>
                                            <FormControl>
                                                <Input {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="measurement"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Measurement <span className="text-destructive">* (Upto 2000 characters)</span></FormLabel>
                                            <div className="relative">
                                                <FormControl>
                                                    <Textarea rows={5} maxLength={2000} className="pr-10" {...field} />
                                                </FormControl>
                                                <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 text-muted-foreground"><Calculator className="h-4 w-4"/></Button>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>
                        <div className="mt-8 flex">
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Add
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
        <AddOptionDialog
            isOpen={isAddRoomOpen}
            onClose={() => setIsAddRoomOpen(false)}
            fieldName="Room"
            onSave={(newValue) => handleSaveNewRoom(newValue, newValue.replace(/-/g, ' '))}
        />
        </>
    );
}

const salesDescriptionOptions = [{ value: "curtain", label: "Drawing Room Curtain" }, { value: "sofa", label: "Sofa Fabric" }];

const AddProductForm = ({ onAddProduct, productTypeOptions, roomOptions, openAddOptionDialog }: { onAddProduct: (data: ProductFormValues) => void, productTypeOptions: ComboboxOption[], roomOptions: ComboboxOption[], openAddOptionDialog: (field: 'room' | 'type', onSave: (value: string) => void) => void }) => {
    const { toast } = useToast();
    const [bcnOptions, setBcnOptions] = useState<{ value: string; label: string; stockItem: Stock }[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    
    const addProductForm = useForm<ProductFormValues>({
        resolver: zodResolver(productSchema),
        defaultValues: {
            productCategory: '', collectionBrand: "", serialNo: "", salesDescription: "",
            quantity: "", remarks: "", room: "", noOfPcs: '1', info1: "", info2: "",
        },
    });

    const handleBcnSearch = async (query: string) => {
        if (query.length < 2) { setBcnOptions([]); return; }
        setIsSearching(true);
        try {
            const results = await searchStockByBcn(query);
            setBcnOptions(results.map(stock => ({ value: stock.bcn || stock.id, label: stock.bcn || stock.id, stockItem: stock })));
        } catch (error) {
            console.error("Error searching BCN:", error);
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
            const category = stockItem.category?.toLowerCase() || '';
            let productCategoryValue = '';
            
            const matchedOption = productTypeOptions.find(opt => category.includes(opt.value));
            if (matchedOption) {
                productCategoryValue = matchedOption.value;
            }

            addProductForm.setValue('productCategory', productCategoryValue);
            addProductForm.setValue('serialNo', stockItem.serialNo || '');
        }
    };

    const handleAddClick = () => {
        addProductForm.handleSubmit((data) => {
            onAddProduct({...data, id: new Date().toISOString() });
            addProductForm.reset({
                productCategory: '', collectionBrand: "", serialNo: "", salesDescription: "",
                quantity: "", remarks: "", room: "", noOfPcs: '1', info1: "", info2: "",
            });
        })();
    };

    return (
        <FormProvider {...addProductForm}>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold">Add More Products</h3>
            </div>
            <Card className="mb-4 p-4">
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <FormField control={addProductForm.control} name="productCategory" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Product Category <Info className="h-3 w-3"/><Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => openAddOptionDialog('type', (newValue) => field.onChange(newValue))}><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel> <Combobox options={productTypeOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /> <FormMessage /> </FormItem> )} />
                        <FormField control={addProductForm.control} name="collectionBrand" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Collection/Brand (BCN)* <span className="text-destructive">*</span><Info className="h-3 w-3"/></FormLabel> <Combobox options={bcnOptions} value={field.value} onSelect={handleBcnSelect} onSearch={handleBcnSearch} placeholder="Search by BCN..." searchPlaceholder="Type to search BCN..." emptyPlaceholder={isSearching ? 'Searching...' : 'No BCN found.'} /> <FormMessage /> </FormItem> )} />
                        <FormField control={addProductForm.control} name="serialNo" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Serial No <span className="text-destructive">*</span><Info className="h-3 w-3"/></FormLabel> <FormControl><Input {...field} readOnly /></FormControl> <FormMessage /> </FormItem> )} />
                        <FormField control={addProductForm.control} name="salesDescription" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Sales Description <Info className="h-3 w-3" /><Button type="button" variant="ghost" size="icon" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel> <Combobox options={salesDescriptionOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /> <FormMessage /> </FormItem> )} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <FormField control={addProductForm.control} name="quantity" render={({ field }) => (<FormItem> <FormLabel className="flex items-center gap-1">Quantity <span className="text-destructive">*</span><Info className="h-3 w-3"/></FormLabel> <div className="flex items-center"><FormControl><Input {...field}/></FormControl><Button type="button" variant="ghost" size="icon" className="ml-1"><Calculator className="h-5 w-5"/></Button></div> <FormMessage /> </FormItem>)} />
                        <FormField control={addProductForm.control} name="remarks" render={({ field }) => (<FormItem> <FormLabel className="flex items-center gap-1">Remarks <Info className="h-3 w-3" /></FormLabel> <FormControl><Input {...field} /></FormControl> <FormMessage /> </FormItem>)} />
                        <FormField control={addProductForm.control} name="room" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Room <Info className="h-3 w-3"/><Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => openAddOptionDialog('room', (newValue) => field.onChange(newValue))}><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel> <Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /> <FormMessage /> </FormItem> )} />
                        <FormField control={addProductForm.control} name="noOfPcs" render={({ field }) => (<FormItem> <FormLabel className="flex items-center gap-1">No of Pcs <Info className="h-3 w-3"/></FormLabel> <FormControl><Input {...field} /></FormControl> <FormMessage /> </FormItem>)} />
                    </div>
                </div>
            </Card>
            <div className="mt-4">
                <Button type="button" onClick={handleAddClick} variant="outline">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Product to List
                </Button>
            </div>
        </FormProvider>
    );
};

function ProductForm({ initialProducts, customerId, dealId, onRefresh, deal, customer, cpds, quotations, orders }: { initialProducts: DealProduct[], customerId: string, dealId: string, onRefresh: () => void, deal: Deal, customer: Customer, cpds: Cpd[], quotations: Quotation[], orders: DealOrder[] }) {
    const [activityLoading, setActivityLoading] = useState(false);
    const { toast } = useToast();
    const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isQuotationDialogOpen, setIsQuotationDialogOpen] = useState(false);
    const [selectedProductsForQuotation, setSelectedProductsForQuotation] = useState<ItemDetailValues[]>([]);
    const [productTypeOptions, setProductTypeOptions] = useState<ComboboxOption[]>(initialProductTypeOptions);
    const [isAddOptionOpen, setIsAddOptionOpen] = useState(false);
    const [addOptionConfig, setAddOptionConfig] = useState<{ field: 'room' | 'type'; onSave: (value: string) => void } | null>(null);

    const openAddOptionDialog = (field: 'room' | 'type', onSaveCallback: (value: string) => void) => {
        setAddOptionConfig({ field, onSave: onSaveCallback });
        setIsAddOptionOpen(true);
    };

    const handleSaveNewOption = (value: string, label: string, field: 'room' | 'type') => {
        const newOption = { value, label, label.toUpperCase() };
        if (field === 'room') {
            (roomOptions as ComboboxOption[]).push(newOption);
        } else if (field === 'type') {
            setProductTypeOptions(prev => [...prev, newOption]);
        }
        addOptionConfig?.onSave(value);
    };

    const form = useForm<ProductListFormValues>({
        resolver: zodResolver(productListSchema),
        defaultValues: { products: initialProducts || [] },
    });

    const { fields, append, remove, update } = useFieldArray({
        control: form.control,
        name: "products"
    });

    useEffect(() => {
        form.reset({ products: initialProducts || [] });
    }, [initialProducts, form]);
    
    const handleRefresh = async () => {
        setIsRefreshing(true);
        onRefresh();
        // Add a small delay for user to perceive the refresh action
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsRefreshing(false);
    };

    const handleAddProduct = (productData: ProductFormValues) => {
        append(productData);
    };

    const handleUpdateActivity = async (data: ProductListFormValues) => {
        setActivityLoading(true);
        const result = await updateDealProducts(customerId, dealId, data.products);
        if (result.success) {
            toast({ title: "Activity Updated", description: "All product changes have been saved." });
        } else {
            toast({ variant: 'destructive', title: 'Save Failed', description: result.message });
        }
        setActivityLoading(false);
    }
    
    const handleQuotationClick = async () => {
        const selectedIds = Object.keys(selectedRows).filter(id => selectedRows[id]);
        if (selectedIds.length === 0) {
            toast({
                variant: 'destructive',
                title: 'No Items Selected',
                description: 'Please select at least one item to convert to a quotation.'
            });
            return;
        }
    
        const selectedProducts = fields
            .filter(field => selectedIds.includes(field.id!))
            .map(field => field as DealProduct);
        
        const productsWithRate = await Promise.all(
            selectedProducts.map(async (product) => {
                const stockResults = await searchStockByBcn(product.collectionBrand);
                const stockItem = stockResults.find(s => s.bcn === product.collectionBrand);
                return {
                    ...product,
                    rate: stockItem?.mrp || 0, // Default to 0 if not found
                };
            })
        );
            
        setSelectedProductsForQuotation(productsWithRate);
        setIsQuotationDialogOpen(true);
    };
    
    const allRowsSelected = fields.length > 0 && Object.keys(selectedRows).length === fields.length;
    const handleSelectAll = (checked: boolean) => {
        const newSelectedRows: Record<string, boolean> = {};
        if (checked) {
            fields.forEach((field) => { newSelectedRows[field.id!] = true; });
        }
        setSelectedRows(newSelectedRows);
    };
    const handleRowSelect = (id: string, checked: boolean) => {
        setSelectedRows(prev => {
            const newSelection = { ...prev };
            if (checked) {
                newSelection[id] = true;
            } else {
                delete newSelection[id];
            }
            return newSelection;
        });
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
                <AddProductForm 
                    onAddProduct={handleAddProduct}
                    productTypeOptions={productTypeOptions}
                    roomOptions={roomOptions}
                    openAddOptionDialog={openAddOptionDialog}
                />

                <Separator className="my-8" />
                
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold">Previously Added Products</h3>
                     <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                        {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Refresh
                    </Button>
                </div>
                <div className="mb-4">
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">
                                     <Checkbox
                                        checked={allRowsSelected}
                                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                        aria-label="Select all rows"
                                    />
                                </TableHead>
                                <TableHead>Modify</TableHead>
                                <TableHead>Collection / Brand</TableHead>
                                <TableHead>Serial No</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead>Room</TableHead>
                                <TableHead>No of Pcs</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Remarks</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fields.length > 0 ? fields.map((field, index) => (
                                <TableRow key={field.id} data-state={selectedRows[field.id!] && "selected"}>
                                    <TableCell>
                                         <Checkbox
                                            checked={!!selectedRows[field.id!]}
                                            onCheckedChange={(checked) => handleRowSelect(field.id!, !!checked)}
                                            aria-label={`Select row ${index + 1}`}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button type="button" variant="ghost" size="icon" onClick={() => {}}><Edit className="h-4 w-4 text-blue-600"/></Button>
                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                    </TableCell>
                                    <TableCell>{form.watch(`products.${index}.collectionBrand`)}</TableCell>
                                    <TableCell>{form.watch(`products.${index}.serialNo`)}</TableCell>
                                    <TableCell>{form.watch(`products.${index}.quantity`)}</TableCell>
                                    <TableCell>{form.watch(`products.${index}.room`)}</TableCell>
                                    <TableCell>{form.watch(`products.${index}.noOfPcs`)}</TableCell>
                                    <TableCell>{form.watch(`products.${index}.salesDescription`)}</TableCell>
                                    <TableCell>{form.watch(`products.${index}.remarks`)}</TableCell>
                                    <TableCell>
                                        {getProductStatus(field as DealProduct)}
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={10} className="text-center h-24">No products added yet.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                 <div className="flex gap-2 mb-8">
                    <Button type="button" >Convert To Order</Button>
                    <Button type="button" onClick={handleQuotationClick}>Convert To Quotation</Button>
                </div>
                
                 <div className="mt-12 flex flex-col items-start gap-4">
                    <form onSubmit={form.handleSubmit(handleUpdateActivity)}>
                        <p className="text-sm text-destructive mb-2">Please click on Update Activity if you have updated any changes.</p>
                        <Button type="submit" disabled={activityLoading} className="bg-cyan-600 hover:bg-cyan-700">
                            {activityLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Update Activity
                        </Button>
                    </form>
                </div>
            </CardContent>
        </Card>
        <CreateQuotationDialog 
            isOpen={isQuotationDialogOpen} 
            onClose={() => setIsQuotationDialogOpen(false)} 
            deal={deal}
            customer={customer}
            initialItems={selectedProductsForQuotation}
            cpds={cpds}
            onSuccess={onRefresh}
        />
        </FormProvider>
         <AddOptionDialog
            isOpen={isAddOptionOpen}
            onClose={() => setIsAddOptionOpen(false)}
            fieldName={addOptionConfig?.field || ''}
            onSave={(newValue) => {
                if (addOptionConfig) {
                    handleSaveNewOption(newValue, newValue.replace(/-/g, ' '), addOptionConfig.field);
                }
            }}
        />
        </>
    )
}

function QuotationsTab({ customerId, dealId, deal, salesmen, cpds, onOrderCreated }: { customerId: string, dealId: string, deal: Deal, salesmen: User[], cpds: Cpd[], onOrderCreated: () => void }) {
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
    const router = useRouter();

    const parseDate = (date: any): Date => {
        if (date instanceof Date) return date;
        if (date && date._seconds) { // Handle Firestore Timestamps
            return new Date(date._seconds * 1000 + (date._nanoseconds || 0) / 1000000);
        }
        if (typeof date === 'string' || typeof date === 'number') {
            const parsed = new Date(date);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        return new Date(); // Fallback
    }
    
    const handlePrint = (quotation: Quotation) => {
        const printType = 'default';
        const printId = `print-quotation-dialog-${quotation.id}-${printType}`;
        const printWindow = window.open('', '_blank');
        const content = document.getElementById(printId);
        if (printWindow && content) {
            const printDocument = printWindow.document;
            printDocument.write('<html><head><title>Print Quotation</title></head><body>');
            printDocument.write(content.innerHTML);
            printDocument.write('</body></html>');
            printDocument.close();
            // Use a timeout to ensure the content is fully loaded before printing
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        }
    };


    useEffect(() => {
        const fetchQuotations = async () => {
            setLoading(true);
            const data = await getQuotationsForDeal(customerId, dealId);
            setQuotations(data);
            setLoading(false);
        };
        fetchQuotations();
    }, [customerId, dealId]);
    
    const handleConvertToOrder = (quotation: Quotation) => {
        router.push(`/dashboard/invoice/new?customerId=${customerId}&dealId=${dealId}&quotationId=${quotation.id}`);
    };

    if (loading) {
        return (
            <div className="mt-6">
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }

    return (
        <>
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Quotation Details</CardTitle>
                </CardHeader>
                <CardContent>
                    {quotations.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Quotation No</TableHead>
                                    <TableHead>Quotation Date</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead>Store</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {quotations.map((q, i) => (
                                    <TableRow key={q.id}>
                                        <TableCell>{i + 1}</TableCell>
                                        <TableCell className="font-medium flex items-center gap-2">
                                             <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6"><MoreVertical className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent>
                                                    <DropdownMenuItem onClick={() => handlePrint(q)}>
                                                        <Printer className="mr-2 h-4 w-4"/> Print
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem><Copy className="mr-2 h-4 w-4"/> Office Copy Print</DropdownMenuItem>
                                                    <DropdownMenuItem><FileDown className="mr-2 h-4 w-4"/> Clone Quotation</DropdownMenuItem>
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <DropdownMenuItem
                                                                    disabled={q.status !== 'Approved'}
                                                                    onSelect={(e) => {
                                                                        if (q.status !== 'Approved') {
                                                                            e.preventDefault();
                                                                        } else {
                                                                            handleConvertToOrder(q);
                                                                        }
                                                                    }}
                                                                >
                                                                    Convert to Order
                                                                </DropdownMenuItem>
                                                            </TooltipTrigger>
                                                             {q.status !== 'Approved' && (
                                                                <TooltipContent>
                                                                    <p>Quotation must be approved to convert to an order.</p>
                                                                </TooltipContent>
                                                            )}
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            <Button variant="link" className="p-0 h-auto" onClick={() => setSelectedQuotation(q)}>
                                                {q.quotationNo}
                                            </Button>
                                            <div className="hidden">
                                                <div id={`print-quotation-dialog-${q.id}-default`}>
                                                    <PrintableQuotationProfessional values={q} creatorName={salesmen.find(u => u.id === q.createdBy)?.name} salesmanName={salesmen.find(s => s.id === deal.representativeId)?.name} />
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>{format(parseDate(q.date), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell>{q.customerName}</TableCell>
                                        <TableCell>
                                            <Badge variant={
                                                q.status === 'Approved' ? 'default' : 
                                                q.status === 'Converted to Order' ? 'default' : 
                                                'secondary'
                                            } className={cn(
                                                q.status === 'Approved' && 'bg-green-500',
                                                q.status === 'Converted to Order' && 'bg-blue-500'
                                            )}>
                                                {q.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">{q.totalAmount.toFixed(2)}</TableCell>
                                        <TableCell>{q.store}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-10 text-muted-foreground">
                            No quotations have been generated for this deal yet.
                        </div>
                    )}
                </CardContent>
            </Card>
            {selectedQuotation && (
                 <QuotationDetailDialog
                    isOpen={!!selectedQuotation}
                    onClose={() => setSelectedQuotation(null)}
                    quotation={selectedQuotation}
                    deal={deal}
                    salesmen={salesmen}
                    cpds={cpds}
                />
            )}
        </>
    );
}

function OrdersTab({ customerId, dealId }: { customerId: string, dealId: string }) {
    const [orders, setOrders] = useState<DealOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        setLoading(true);
        const q = collection(db, 'customers', customerId, 'deals', dealId, 'orders');
        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DealOrder));
                setOrders(ordersData.sort((a,b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()));
                setLoading(false);
            },
            (error) => {
                console.error("Error fetching orders:", error);
                toast({ variant: "destructive", title: "Error", description: "Could not load orders for this deal." });
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, [customerId, dealId, toast]);
    
    const parseDate = (date: any): Date => {
        if (date instanceof Date) return date;
        if (date && date._seconds) { // Handle Firestore Timestamps
            return new Date(date._seconds * 1000 + (date._nanoseconds || 0) / 1000000);
        }
        if (typeof date === 'string' || typeof date === 'number') {
            const parsed = new Date(date);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        return new Date(); // Fallback
    }

    if (loading) {
        return (
            <div className="mt-6">
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }
    
    return (
         <Card className="mt-6">
            <CardHeader>
                <CardTitle>Orders Details</CardTitle>
            </CardHeader>
            <CardContent>
                {orders.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Order No</TableHead>
                                <TableHead>Order Remark</TableHead>
                                <TableHead>Order Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Created By</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders.map((order, i) => (
                                <TableRow key={order.id}>
                                    <TableCell>{i + 1}</TableCell>
                                    <TableCell className="flex items-center gap-2">
                                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                        <Button variant="link" asChild className="p-0 h-auto">
                                            <Link href={`/dashboard/orders/${order.orderNo}`}>{order.orderNo}</Link>
                                        </Button>
                                    </TableCell>
                                    <TableCell>{order.remark || '-'}</TableCell>
                                    <TableCell>{format(parseDate(order.orderDate), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell>
                                        <Badge variant={order.status === 'Approved' ? 'default' : 'secondary'} className={cn(order.status === 'Approved' && 'bg-green-500')}>{order.status}</Badge>
                                    </TableCell>
                                    <TableCell>{order.createdBy}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="text-center py-10 text-muted-foreground">
                        No orders have been generated for this deal yet.
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function VisitsTab({ customerId, dealId, salesmen, visits, onVisitAdded, orders }: { customerId: string, dealId: string, salesmen: User[], visits: DealVisit[], onVisitAdded: (visit: DealVisit) => void, orders: DealOrder[] }) {
    const [loading, setLoading] = useState(false);
    const [selectedVisit, setSelectedVisit] = useState<DealVisit | null>(null);

    const renderMeasurementDetails = (visit: DealVisit) => (
        <div className="space-y-2">
            <div>
                <h4 className="font-semibold">Measurements Selected:</h4>
                <ul className="list-disc list-inside text-muted-foreground">
                    {(visit.measurements && visit.measurements.length > 0) ? visit.measurements.map(m => <li key={m}>{measurementItems.find(mi => mi.id === m)?.label || m}</li>) : <li>None</li>}
                </ul>
            </div>
             {visit.blinds && visit.blinds.length > 0 && (
                <div>
                    <h4 className="font-semibold">Blind Types:</h4>
                    <ul className="list-disc list-inside text-muted-foreground">
                        {visit.blinds.map(b => <li key={b}>{subMeasurementBlinds.find(s => s.id === b)?.label || b}</li>)}
                    </ul>
                </div>
            )}
             {visit.curtain && visit.curtain.length > 0 && (
                <div>
                    <h4 className="font-semibold">Curtain Types:</h4>
                    <ul className="list-disc list-inside text-muted-foreground">
                       {visit.curtain.map(c => <li key={c}>{subMeasurementCurtain.find(s => s.id === c)?.label || c}</li>)}
                       {visit.otherCurtain && <li>Other: {visit.otherCurtain}</li>}
                    </ul>
                </div>
            )}
        </div>
    );

    const renderDeliveryDetails = (visit: DealVisit) => (
        <div className="space-y-2">
            <div>
                <h4 className="font-semibold">Delivery/Installation Selected:</h4>
                <ul className="list-disc list-inside text-muted-foreground">
                    {(visit.deliveryInstallations && visit.deliveryInstallations.length > 0) ? 
                        visit.deliveryInstallations.map(d => d && <li key={d.id}>{deliveryInstallationItems.find(di => di.id === d.id)?.label || d.id} ({d.noOfPcs || 1} Pcs)</li>) 
                        : <li>None</li>}
                    {visit.otherDelivery && <li>Other: {visit.otherDelivery}</li>}
                </ul>
            </div>
             {visit.subDeliveryInstallations && visit.subDeliveryInstallations.length > 0 && (
                <div>
                    <h4 className="font-semibold">Sub-Delivery/Installation:</h4>
                    <ul className="list-disc list-inside text-muted-foreground">
                        {visit.subDeliveryInstallations.map(d => d && <li key={d.id}>{subDeliveryInstallationItems.find(sdi => sdi.id === d.id)?.label || d.id} ({d.noOfPcs || 1} Pcs)</li>)}
                    </ul>
                </div>
            )}
        </div>
    );


    return (
        <div>
            <VisitForm salesmen={salesmen} customerId={customerId} dealId={dealId} onVisitAdded={onVisitAdded} visits={visits} orders={orders} />
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Visit History</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <Skeleton className="h-24 w-full" />
                    ) : visits.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Due Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Representative</TableHead>
                                    <TableHead>Created By</TableHead>
                                    <TableHead>Created At</TableHead>
                                    <TableHead>Details</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visits.map((visit, i) => (
                                    <TableRow key={visit.id}>
                                        <TableCell>{i + 1}</TableCell>
                                        <TableCell className="capitalize">{visit.typeOfVisit}</TableCell>
                                        <TableCell>
                                            {visit.dueDate ? (
                                                format(new Date(visit.dueDate), 'PPP p')
                                            ) : (
                                                <Badge variant="destructive">Not Set</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {(() => {
                                                if (visit.visitStatus === 'Out for Delivery') {
                                                    return <Badge className="bg-blue-600 hover:bg-blue-700">Out for Delivery</Badge>;
                                                }
                                                if (visit.status === 'completed') {
                                                    return <Badge className="bg-green-600 hover:bg-green-700">Done</Badge>;
                                                }
                                                return <Badge variant="secondary">Pending</Badge>;
                                            })()}
                                        </TableCell>
                                        <TableCell>{salesmen.find(s => s.id === visit.representative)?.name || visit.representative}</TableCell>
                                        <TableCell>{visit.createdBy}</TableCell>
                                        <TableCell>{format(new Date(visit.createdAt), 'dd/MM/yy')}</TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="icon" onClick={() => setSelectedVisit(visit)}>
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-10 text-muted-foreground">
                            No visits have been logged for this deal yet.
                        </div>
                    )}
                </CardContent>
            </Card>
             {selectedVisit && (
                <Dialog open={!!selectedVisit} onOpenChange={() => setSelectedVisit(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Visit Details</DialogTitle>
                            <DialogDescription>
                                Details for visit on {selectedVisit.dueDate ? format(new Date(selectedVisit.dueDate), 'PPP p') : 'N/A'}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                           {selectedVisit.typeOfVisit === 'measurement'
                                ? renderMeasurementDetails(selectedVisit)
                                : renderDeliveryDetails(selectedVisit)}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

function MeasurementsTab({ customerId, dealId }: { customerId: string; dealId: string }) {
    const [measurements, setMeasurements] = useState<DealMeasurement[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchMeasurements = useCallback(async () => {
        setLoading(true);
        const data = await getMeasurementsForDeal(customerId, dealId);
        setMeasurements(data);
        setLoading(false);
    }, [customerId, dealId]);

    useEffect(() => {
        fetchMeasurements();
    }, [fetchMeasurements]);

    const handleMeasurementAdded = (newMeasurement: DealMeasurement) => {
        setMeasurements(prev => [newMeasurement, ...prev]);
    };

    return (
        <div>
            <MeasurementForm onMeasurementAdded={handleMeasurementAdded} customerId={customerId} dealId={dealId} />
             <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Measurement History</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <Skeleton className="h-24 w-full" />
                    ) : measurements.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Doer</TableHead>
                                    <TableHead>Entries</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {measurements.map((m, i) => (
                                    <TableRow key={m.id}>
                                        <TableCell>{i + 1}</TableCell>
                                        <TableCell>{m.typeOf}</TableCell>
                                        <TableCell>{m.doerName}</TableCell>
                                        <TableCell>{m.entries?.length || 0}</TableCell>
                                        <TableCell>
                                            <div className="text-xs">
                                                <p>{m.createdBy}</p>
                                                <p className="text-muted-foreground">{format(new Date(m.createdAt), 'dd/MM/yy')}</p>
                                            </div>
                                        </TableCell>
                                         <TableCell>
                                            {m.pdfUrl && (
                                                <Button asChild variant="ghost" size="icon">
                                                    <Link href={m.pdfUrl} target="_blank" rel="noopener noreferrer">
                                                        <Eye className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-10 text-muted-foreground">
                            No measurements have been logged for this deal yet.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function CrmActivitySkeleton() {
  return (
    <div className="flex h-full">
      <div className="w-80 border-r p-6 hidden lg:block">
        <Skeleton className="h-6 w-3/4 mb-6" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-5 w-3/4" />
          <Separator />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </div>
      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <Skeleton className="h-10 w-full mb-4" />
        <div className="text-center py-20">
          <Skeleton className="h-32 w-32 rounded-full mx-auto mb-4" />
          <Skeleton className="h-8 w-48 mx-auto mb-2" />
          <Skeleton className="h-5 w-64 mx-auto" />
        </div>
      </div>
    </div>
  );
}

export default function CrmActivityTrackerPage({ params: paramsPromise }: { params: Promise<{ customerId: string, dealId: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();
  const { customerId, dealId } = params;
  const { toast } = useToast();
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [salesmen, setSalesmen] = useState<User[]>([]);
  const [visits, setVisits] = useState<DealVisit[]>([]);
  const [cpds, setCpds] = useState<Cpd[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [orders, setOrders] = useState<DealOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVisits = useCallback(async () => {
    const data = await getVisitsForDeal(customerId, dealId);
    setVisits(data);
  }, [customerId, dealId]);

  const fetchCpds = useCallback(async () => {
    const data = await getCpdsForDeal(customerId, dealId);
    setCpds(data);
  }, [customerId, dealId]);

  const fetchQuotationsAndOrders = useCallback(async () => {
      const quotationsData = await getQuotationsForDeal(customerId, dealId);
      const ordersData = await getOrdersForDeal(customerId, dealId);
      setQuotations(quotationsData);
      setOrders(ordersData);
  }, [customerId, dealId]);


  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [customerData, dealData, salesmenData] = await Promise.all([
        getCustomerById(customerId),
        getDealById(customerId, dealId),
        getSalesmen(),
      ]);
      
      if (!customerData) throw new Error("Customer not found");
      if (!dealData) throw new Error("Deal not found");

      setCustomer(customerData);
      setDeal(dealData);
      setSalesmen(salesmenData);
      
    } catch (error) {
      console.error("Failed to fetch CRM activity data:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Could not load activity data.",
      });
    } finally {
      setLoading(false);
    }
  }, [customerId, dealId, toast]);

  const handleRefresh = useCallback(() => {
    fetchData();
    fetchVisits();
    fetchCpds();
    fetchQuotationsAndOrders();
  }, [fetchData, fetchVisits, fetchCpds, fetchQuotationsAndOrders]);

  useEffect(() => {
    if (!customerId || !dealId) return;
    handleRefresh();
  }, [customerId, dealId, handleRefresh]);

  if (loading) {
    return <CrmActivitySkeleton />;
  }

  if (!customer || !deal) {
    return (
        <div className="flex items-center justify-center h-full">
            <Card className="m-4">
                <CardContent className="p-8 text-center">
                    <h2 className="text-xl font-semibold mb-2">Data not found</h2>
                    <p className="text-muted-foreground mb-4">The requested customer or deal could not be loaded.</p>
                    <Button asChild>
                        <Link href="/dashboard/customers">Back to Customers</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
  }

  const representative = salesmen.find(s => s.id === deal.representativeId);

  return (
    <div className="flex h-full bg-card">
      {/* Left Sidebar */}
      <aside className="w-[300px] flex-shrink-0 border-r p-6 space-y-6 hidden lg:block overflow-y-auto">
        <h2 className="text-lg font-semibold">CRM Activity Tracker</h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">Deal Name</p>
            <p className="font-semibold text-primary">{deal.dealName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Deal Amount:</p>
            <p className="font-semibold">{deal.dealAmount.toFixed(2)}</p>
          </div>
           <div>
            <p className="text-xs text-muted-foreground">Deal Stage:</p>
            <p className="font-semibold">DEAL CREATED</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Store</p>
            <p className="font-semibold">{customer.state || 'MO GCR BRANCH'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Representative</p>
            <p className="font-semibold">{representative?.name || 'N/A'}</p>
          </div>
          <Separator />
          <div>
            <p className="text-xs text-muted-foreground">Contact Person</p>
            <p className="font-semibold">{customer.name}</p>
            <p className="text-sm text-muted-foreground">Mobile No: {customer.mobileNo}</p>
            <p className="text-sm text-muted-foreground">City: {customer.city || 'N/A'}</p>
          </div>
           <Separator />
            <div>
            <p className="text-xs text-muted-foreground">Deal Description:</p>
            <p className="text-sm">{deal.description || "No description provided."}</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <Button variant="outline" asChild>
            <Link href={`/dashboard/customers/${customerId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Deals
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full bg-pink-500 hover:bg-pink-600 text-white">
            <Plane className="h-5 w-5" />
          </Button>
        </div>

        <Tabs defaultValue="visits">
          <TabsList className="mb-4">
            <TabsTrigger value="visits"><Home className="mr-2 h-4 w-4" />Visits</TabsTrigger>
            <TabsTrigger value="measurement"><GanttChartSquare className="mr-2 h-4 w-4"/>Measurement</TabsTrigger>
            <TabsTrigger value="cpd"><Contact2 className="mr-2 h-4 w-4" />CPD</TabsTrigger>
            <TabsTrigger value="products"><ShoppingCart className="mr-2 h-4 w-4"/>Products</TabsTrigger>
            <TabsTrigger value="reminder"><Calendar className="mr-2 h-4 w-4"/>Reminder/Notes</TabsTrigger>
            <TabsTrigger value="receipt"><Receipt className="mr-2 h-4 w-4"/>Receipt</TabsTrigger>
            <TabsTrigger value="vas"><Package className="mr-2 h-4 w-4"/>VAS</TabsTrigger>
            <TabsTrigger value="orders"><UserIcon className="mr-2 h-4 w-4"/>Orders</TabsTrigger>
            <TabsTrigger value="quotations"><MessageSquare className="mr-2 h-4 w-4"/>Quotations</TabsTrigger>
            <TabsTrigger value="invoice"><FileText className="mr-2 h-4 w-4"/>Invoice</TabsTrigger>
          </TabsList>
          
          <TabsContent value="visits">
            <VisitsTab customerId={customerId} dealId={dealId} salesmen={salesmen} visits={visits} onVisitAdded={fetchVisits} orders={orders} />
          </TabsContent>
          
          <TabsContent value="measurement">
            <MeasurementsTab customerId={customerId} dealId={dealId} />
          </TabsContent>

          <TabsContent value="cpd">
            <CpdTab customer={customer} salesmen={salesmen} deal={deal} onRefresh={handleRefresh} quotations={quotations} />
          </TabsContent>
          
          <TabsContent value="products">
            <ProductForm 
                initialProducts={deal.products || []}
                customerId={customerId}
                dealId={dealId}
                onRefresh={handleRefresh}
                deal={deal}
                customer={customer}
                cpds={cpds}
                quotations={quotations}
                orders={orders}
            />
          </TabsContent>

          <TabsContent value="quotations">
             <QuotationsTab 
                customerId={customerId} 
                dealId={dealId} 
                deal={deal} 
                salesmen={salesmen} 
                cpds={cpds} 
                onOrderCreated={handleRefresh}
            />
          </TabsContent>

          <TabsContent value="orders">
             <OrdersTab customerId={customerId} dealId={dealId} />
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}



// CPD Tab Component
function CpdTab({ customer, salesmen, deal, onRefresh, quotations }: { customer: Customer, salesmen: User[], deal: Deal, onRefresh: () => void, quotations: Quotation[] }) {
    const [cpds, setCpds] = useState<Cpd[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedCpd, setSelectedCpd] = useState<Cpd | null>(null);
    const [customerCpd, setCustomerCpd] = useState<Cpd | null>(null);

    const [isQuotationDialogOpen, setIsQuotationDialogOpen] = useState(false);
    const [selectedProductsForQuotation, setSelectedProductsForQuotation] = useState<ItemDetailValues[]>([]);
    const [initialVasDetails, setInitialVasDetails] = useState<any[]>([]);
    const [selectedCpdForQuotation, setSelectedCpdForQuotation] = useState<string | undefined>();


    const fetchCpds = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getCpdsForDeal(customer.id, deal.id);
            setCpds(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [customer.id, deal.id]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await fetchCpds();
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsRefreshing(false);
    };

    const handleConvertToQuotation = async (cpd: Cpd) => {
        const itemsToConvert: ItemDetailValues[] = [];
        const vasToConvert: any[] = [];
        
        for (const room of cpd.rooms) {
            for (const item of room.items) {
                const stockResults = await searchStockByBcn(item.itemName);
                const stockItem = stockResults.find(s => s.bcn === item.itemName);
                itemsToConvert.push({
                    id: `${cpd.id}-${item.itemName}`,
                    collectionBrand: item.itemName,
                    quantity: parseFloat(item.qty),
                    rate: parseFloat(item.rate || (stockItem?.mrp || '0').toString()),
                    discountPercent: parseFloat(item.dis || '0'),
                    salesDescription: `${item.itemName} - ${item.type}`,
                    room: room.room,
                    productCategory: item.type,
                });

                if (item.stitchDimensions) {
                    for (const sd of item.stitchDimensions) {
                        if (sd.vas) {
                             vasToConvert.push({
                                vasName: sd.vas,
                                quantity: sd.noOfPanels || '1',
                                rate: item.rate, // Use main item rate for VAS rate
                                room: room.room,
                            });
                        }
                    }
                }
            }
        }
        
        setSelectedProductsForQuotation(itemsToConvert);
        setInitialVasDetails(vasToConvert);
        setSelectedCpdForQuotation(cpd.id);
        setIsQuotationDialogOpen(true);
    };

    useEffect(() => {
        fetchCpds();
    }, [fetchCpds]);

    return (
        <div className="space-y-6">
            <CpdForm customer={customer} salesmen={salesmen} dealId={deal.id} onCpdAdded={fetchCpds} />
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Saved CPDs</CardTitle>
                        <CardDescription>Previously saved Customer Product Details for this deal.</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                        {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    {loading ? <Skeleton className="h-24 w-full" /> : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>CPD ID</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Created By</TableHead>
                                    <TableHead>Representative</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {cpds.length > 0 ? cpds.map(cpd => {
                                    const isQuotationCreated = quotations.some(q => q.cpdId === cpd.id);
                                    return (
                                        <TableRow key={cpd.id}>
                                            <TableCell>
                                                <Button variant="link" className="p-0" onClick={() => setSelectedCpd(cpd)}>
                                                    {cpd.cpdId}
                                                </Button>
                                            </TableCell>
                                            <TableCell>{cpd.date ? format(new Date(cpd.date), 'PPP') : 'N/A'}</TableCell>
                                            <TableCell>{cpd.createdBy}</TableCell>
                                            <TableCell>{salesmen.find(s => s.id === cpd.representative)?.name || 'N/A'}</TableCell>
                                             <TableCell className="space-x-2">
                                                <Button size="sm" variant="outline" onClick={() => setCustomerCpd(cpd)}>Customer CPD</Button>
                                                {isQuotationCreated ? (
                                                    <Badge variant="default" className="bg-green-500">Quotation Created</Badge>
                                                ) : (
                                                    <Button size="sm" onClick={() => handleConvertToQuotation(cpd)}>
                                                        Convert to Quotation
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                }) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">No CPDs saved for this deal yet.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
            <Dialog open={!!selectedCpd} onOpenChange={() => setSelectedCpd(null)}>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                     <DialogHeader>
                        <DialogTitle>CPD Details: {selectedCpd?.cpdId}</DialogTitle>
                        <DialogDescription>A printable view of the Customer Product Details.</DialogDescription>
                    </DialogHeader>
                    {selectedCpd && <PrintableCpd cpd={selectedCpd} customer={customer} deal={deal} salesmen={salesmen} />}
                </DialogContent>
            </Dialog>
            <Dialog open={!!customerCpd} onOpenChange={() => setCustomerCpd(null)}>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                     <DialogHeader>
                        <DialogTitle>Customer CPD: {customerCpd?.cpdId}</DialogTitle>
                        <DialogDescription>A simplified, printable view of the Customer Product Details.</DialogDescription>
                    </DialogHeader>
                    {customerCpd && <PrintableCustomerCpd cpd={customerCpd} customer={customer} />}
                </DialogContent>
            </Dialog>
            <CreateQuotationDialog 
                isOpen={isQuotationDialogOpen}
                onClose={() => setIsQuotationDialogOpen(false)}
                onSuccess={() => {
                    setIsQuotationDialogOpen(false);
                    onRefresh();
                }}
                deal={deal}
                customer={customer}
                initialItems={selectedProductsForQuotation}
                initialVasDetails={initialVasDetails}
                cpds={cpds}
                selectedCpdId={selectedCpdForQuotation}
            />
        </div>
    )
}

function PrintableCpd({ cpd, customer, deal, salesmen }: { cpd: Cpd, customer: Customer, deal: Deal, salesmen: User[] }) {
    
    const handlePrint = () => {
        const printContent = document.getElementById('printable-cpd-content');
        if (!printContent) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const styles = `
            <style>
                @media print {
                    body { font-family: Arial, sans-serif; font-size: 10px; -webkit-print-color-adjust: exact; }
                    .no-print { display: none; }
                    .printable-area { padding: 1rem; }
                    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 2px solid black; padding-bottom: 0.5rem; }
                    .header img { width: 120px; height: auto; }
                    .header h1 { font-size: 24px; font-weight: bold; text-align: center; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem 2rem; margin-bottom: 1rem; font-size: 12px; }
                    .room-header { font-weight: bold; background-color: #e5e7eb; padding: 0.5rem; border-radius: 0.375rem 0.375rem 0 0; }
                    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 2rem; font-size: 12px; }
                    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    th, td { border: 1px solid #ccc; padding: 4px; text-align: left; }
                    thead { display: table-header-group; }
                    tfoot { display: table-footer-group; }
                    .stitching-details-grid { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 0.5rem 1rem !important; }
                }
            </style>
        `;

        printWindow.document.write('<html><head><title>Print CPD</title>');
        printWindow.document.write(styles);
        printWindow.document.write('</head><body>');
        printWindow.document.write(printContent.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
            printWindow.close();
        }, 250);
    };

    const totals = useMemo(() => {
        let totalItems = 0;
        let totalQty = 0;
        let grossAmount = 0;
        let totalDiscount = 0;

        cpd.rooms.forEach(room => {
            room.items.forEach(item => {
                totalItems += 1;
                const qty = parseFloat(item.qty || '0');
                const rate = parseFloat(item.rate || '0');
                const dis = parseFloat(item.dis || '0');

                totalQty += qty;
                const subtotal = qty * rate;
                grossAmount += subtotal;
                const discountAmount = subtotal * (dis / 100);
                totalDiscount += discountAmount;
            });
        });
        
        const netAmount = grossAmount - totalDiscount;

        return { totalItems, totalQty, grossAmount, totalDiscount, netAmount };
    }, [cpd]);

    return (
        <div className="flex-grow overflow-y-auto">
             <div className="flex justify-end p-4 border-b no-print">
                 <Button onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
            </div>
            <div id="printable-cpd-content" className="p-4 bg-white text-black font-sans text-xs printable-area">
                 <div className="header">
                    <Image src="/logo.png" alt="MoTrack Logo" width={120} height={60} data-ai-hint="logo" />
                    <h1 className="text-2xl font-bold text-center">Customer Product Details</h1>
                 </div>
                <div className="info-grid">
                    <p><strong>CPD No:</strong> {cpd.cpdId}</p>
                    <p><strong>Date:</strong> {cpd.date ? format(new Date(cpd.date), 'PPP') : 'N/A'}</p>
                    <p><strong>Customer:</strong> {cpd.customerName}</p>
                    <p><strong>Tel No:</strong> {cpd.telNo}</p>
                </div>
                <div className="space-y-4">
                    {cpd.rooms.map((room, roomIndex) => (
                        <div key={roomIndex}>
                            <h3 className="room-header">{room.room?.toUpperCase().replace(/-/g, ' ') || 'General Items'}</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Item</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Fabric Type</TableHead>
                                        <TableHead>Qty</TableHead>
                                        <TableHead>Rate</TableHead>
                                        <TableHead>Dis%</TableHead>
                                        <TableHead>Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {room.items.map((item, itemIndex) => (
                                        <React.Fragment key={itemIndex}>
                                            <TableRow>
                                                <TableCell>{item.itemName}</TableCell>
                                                <TableCell>{item.type}</TableCell>
                                                <TableCell>{item.fabricType || 'N/A'}</TableCell>
                                                <TableCell>{item.qty}</TableCell>
                                                <TableCell>{item.rate}</TableCell>
                                                <TableCell>{item.dis}</TableCell>
                                                <TableCell>{Number(item.amount || 0).toFixed(2)}</TableCell>
                                            </TableRow>
                                            {item.hasDimension && item.dimensions && item.dimensions.length > 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="p-0">
                                                        <div className="p-2 bg-gray-50">
                                                            <h4 className="font-semibold text-xs mb-1 pl-2">Dimensions:</h4>
                                                            {item.dimensions.map((dim, dimIndex) => (
                                                                <div key={dim.id || dimIndex} className="pl-4 pr-2 py-1 border-l-2 ml-2">
                                                                    <div className="flex justify-between items-center text-xs">
                                                                        <span><strong>L:</strong> {dim.length || 'N/A'}</span>
                                                                        <span><strong>W:</strong> {dim.width || 'N/A'}</span>
                                                                        <span><strong>Type:</strong> {dim.type?.join(', ') || 'N/A'}</span>
                                                                    </div>
                                                                    {dim.advanceDetails && dim.advanceDetails.length > 0 && (
                                                                        <div className="mt-1 pl-4">
                                                                            <h5 className="font-semibold text-[10px]">Advance Details:</h5>
                                                                            <ul className="list-disc list-inside text-[10px]">
                                                                                {dim.advanceDetails.map(adv => (
                                                                                    <li key={adv.id}>
                                                                                        {adv.name}: {adv.pcs} pcs 
                                                                                        {adv.imageUrl && <span className="text-blue-500 ml-1">(img)</span>}
                                                                                    </li>
                                                                                ))}
                                                                            </ul>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                             {item.hasStitchDimension && item.stitchDimensions && item.stitchDimensions.length > 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="p-0">
                                                        <div className="p-2 bg-blue-50">
                                                            <h4 className="font-semibold text-xs mb-1 pl-2">Stitching Details:</h4>
                                                            {item.stitchDimensions.map((dim, dimIndex) => (
                                                                <div key={dim.id || dimIndex} className="pl-4 pr-2 py-1 border-l-2 ml-2 border-blue-200">
                                                                     <div className="stitching-details-grid">
                                                                        <span><strong>VAS:</strong> {dim.vas || 'N/A'}</span>
                                                                        <span><strong>Lengths:</strong> {dim.lengths || 'N/A'}</span>
                                                                        <span><strong>Width:</strong> {dim.width || 'N/A'}</span>
                                                                        <span><strong>No. of Panels:</strong> {dim.noOfPanels || 'N/A'}</span>
                                                                        <span className="col-span-2"><strong>Operation:</strong> {dim.operation || 'N/A'}</span>
                                                                        <span className="col-span-2"><strong>Remark:</strong> {dim.remark || 'N/A'}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ))}
                </div>
                 <div className="mt-6 p-4 border-t-2 border-gray-600">
                    <h3 className="text-base font-bold mb-2">Summary</h3>
                    <div className="summary-grid">
                        <p><strong>Total No of Items:</strong> {totals.totalItems}</p>
                        <p><strong>Total Quantity:</strong> {totals.totalQty.toFixed(2)}</p>
                        <p><strong>Gross Amount:</strong> {totals.grossAmount.toFixed(2)}</p>
                        <p><strong>Total Discount:</strong> {totals.totalDiscount.toFixed(2)}</p>
                        <p className="col-span-2 font-bold text-sm pt-2 border-t mt-2"><strong>Net Amount:</strong> {totals.netAmount.toFixed(2)}</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

function PrintableCustomerCpd({ cpd, customer }: { cpd: Cpd, customer: Customer }) {
    
    const handlePrint = () => {
        const printContent = document.getElementById('printable-customer-cpd-content');
        if (!printContent) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const styles = `
            <style>
                @media print {
                    body { -webkit-print-color-adjust: exact; font-family: Arial, sans-serif; font-size: 12px; }
                    .printable-area { padding: 1rem; }
                    .no-print { display: none !important; }
                    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
                    thead { display: table-header-group; }
                    tfoot { display: table-footer-group; }
                    .room-header { font-weight: bold; background-color: #e5e7eb !important; padding: 0.5rem; }
                    .text-right { text-align: right; }
                    .font-bold { font-weight: bold; }
                }
            </style>
        `;

        printWindow.document.write('<html><head><title>Print Customer CPD</title>');
        printWindow.document.write(styles);
        printWindow.document.write('</head><body>');
        printWindow.document.write(printContent.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
            printWindow.close();
        }, 250);
    };

    const overallTotals = useMemo(() => {
        let totalItems = 0;
        let totalQty = 0;
        let totalAmount = 0;

        cpd.rooms.forEach(room => {
            room.items.forEach(item => {
                totalItems += 1;
                totalQty += Number(item.qty) || 0;
                totalAmount += Number(item.amount) || 0;
            });
        });
        return { totalItems, totalQty, totalAmount };
    }, [cpd]);

    return (
        <div className="flex-grow overflow-y-auto">
             <div className="flex justify-end p-4 border-b no-print">
                 <Button onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
            </div>
            <div id="printable-customer-cpd-content" className="p-4 bg-white text-black font-sans text-sm printable-area">
                 <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <Image src="/logo.png" alt="MoTrack Logo" width={120} height={60} data-ai-hint="logo" />
                    <h1 className="text-xl font-bold text-center">Customer Product Details</h1>
                 </div>
                 <div className="grid grid-cols-2 gap-4 mb-4">
                    <p><strong>Customer:</strong> {customer.name}</p>
                    <p><strong>Date:</strong> {format(new Date(), 'PPP')}</p>
                 </div>
                 <div className="space-y-6">
                    {cpd.rooms.map((room, roomIndex) => {
                        const roomTotalAmount = room.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                        const roomTotalQty = room.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
                        const roomTotalItems = room.items.length;
                        
                        return (
                            <div key={roomIndex}>
                                <h3 className="room-header">{room.room?.toUpperCase().replace(/-/g, ' ') || 'General Items'}</h3>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Item Name</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead className="text-right">Qty</TableHead>
                                            <TableHead className="text-right">Rate</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {room.items.map((item, itemIndex) => (
                                            <TableRow key={itemIndex}>
                                                <TableCell>{item.itemName}</TableCell>
                                                <TableCell>{item.type}</TableCell>
                                                <TableCell className="text-right">{item.qty}</TableCell>
                                                <TableCell className="text-right">{Number(item.rate || 0).toFixed(2)}</TableCell>
                                                <TableCell className="text-right">{Number(item.amount || 0).toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                    <TableFooter>
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-right font-bold">Room Total:</TableCell>
                                            <TableCell className="text-right font-bold">{roomTotalQty.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-bold">(Items: {roomTotalItems})</TableCell>
                                            <TableCell className="text-right font-bold">{roomTotalAmount.toFixed(2)}</TableCell>
                                        </TableRow>
                                    </TableFooter>
                                </Table>
                            </div>
                        )
                    })}
                 </div>
                 <div className="mt-8 pt-4 border-t-2 border-gray-600 flex justify-end">
                     <div className="w-1/2 space-y-2">
                        <div className="flex justify-between font-bold text-lg">
                            <span>Grand Total Items:</span>
                            <span>{overallTotals.totalItems}</span>
                        </div>
                         <div className="flex justify-between font-bold text-lg">
                            <span>Grand Total Qty:</span>
                            <span>{overallTotals.totalQty.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg">
                            <span>Grand Total Amount:</span>
                            <span>{overallTotals.totalAmount.toFixed(2)}</span>
                        </div>
                     </div>
                 </div>
            </div>
        </div>
    )
}

    



    





    