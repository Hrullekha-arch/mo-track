
"use client";

import { use, useEffect, useState, useMemo, useCallback, ReactNode } from "react";
import { useForm, useFieldArray, FormProvider, useFormContext, Control, UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Customer, Deal, User, Stock, DealProduct, Quotation } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
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
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getCustomerById, getSalesmen } from "../../actions";
import { getDealById, updateDealProducts, getQuotationsForDeal } from "./actions";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
import { CreateQuotationDialog } from "@/components/features/order-management/CreateQuotationDialog";


const visitSchema = z.object({
  representative: z.string().min(1, "Representative is required."),
  typeOfVisit: z.string().min(1, "Type of visit is required."),
  notes: z.string().max(2000, "Notes cannot exceed 2000 characters.").optional(),
  dueDate: z.date({ required_error: "Due date is required." }),
  happyCodeRequired: z.enum(["yes", "no"]).default("no"),
  sendVisitEmail: z.boolean().default(false),
  sendVisitSms: z.boolean().default(false),
});

type VisitFormValues = z.infer<typeof visitSchema>;

const measurementSchema = z.object({
    room: z.string().min(1, "Room is required."),
    measurementReference: z.string().min(1, "Measurement reference is required."),
    noOfUnits: z.string().min(1, "Number of units is required."),
    measurement: z.string().max(2000, "Measurement cannot exceed 2000 characters.").min(1, "Measurement is required."),
    file: z.any().optional(),
});

type MeasurementFormValues = z.infer<typeof measurementSchema>;

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

function VisitForm({ salesmen }: { salesmen: User[] }) {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const form = useForm<VisitFormValues>({
        resolver: zodResolver(visitSchema),
        defaultValues: {
            representative: "",
            typeOfVisit: "",
            notes: "",
            happyCodeRequired: "no",
            sendVisitEmail: false,
            sendVisitSms: false,
        }
    });

    function onSubmit(data: VisitFormValues) {
        setLoading(true);
        console.log(data);
        // Simulate API call
        setTimeout(() => {
            toast({
                title: "Activity Updated",
                description: "The new visit has been added to the activity log.",
            });
            setLoading(false);
            form.reset();
        }, 1500);
    }

    return (
         <Card className="mt-6">
            <CardContent className="p-6">
                 <h3 className="text-xl font-semibold mb-6">Add More Visit</h3>
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-8">
                                <FormField
                                    control={form.control}
                                    name="representative"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-1">Representative <span className="text-destructive">*</span> <Info className="h-3 w-3 text-muted-foreground" /></FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger>
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
                                    name="notes"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Notes <span className="text-destructive">* (Upto 2000 characters)</span></FormLabel>
                                            <FormControl>
                                                <Textarea rows={5} maxLength={2000} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                             <div className="space-y-8">
                                <FormField
                                    control={form.control}
                                    name="typeOfVisit"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Type of Visit</FormLabel>
                                             <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="initial-consultation">Initial Consultation</SelectItem>
                                                    <SelectItem value="measurement">Measurement</SelectItem>
                                                    <SelectItem value="follow-up">Follow-up</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                 <FormField
                                    control={form.control}
                                    name="dueDate"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel>Due Date <span className="text-destructive">*</span></FormLabel>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button
                                                            variant={"outline"}
                                                            className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                                        >
                                                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                                            <Clock className="ml-auto h-4 w-4 opacity-50" />
                                                        </Button>
                                                    </FormControl>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                    <CalendarPicker
                                                        mode="single"
                                                        selected={field.value}
                                                        onSelect={field.onChange}
                                                        disabled={(date) => date < new Date() || date < new Date("1900-01-01")}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="happyCodeRequired"
                                    render={({ field }) => (
                                        <FormItem className="space-y-3">
                                            <FormLabel>Happy code Required</FormLabel>
                                            <FormControl>
                                                <RadioGroup
                                                    onValueChange={field.onChange}
                                                    defaultValue={field.value}
                                                    className="flex items-center space-x-4"
                                                >
                                                    <FormItem className="flex items-center space-x-2">
                                                        <FormControl><RadioGroupItem value="yes" /></FormControl>
                                                        <FormLabel className="font-normal">YES</FormLabel>
                                                    </FormItem>
                                                    <FormItem className="flex items-center space-x-2">
                                                        <FormControl><RadioGroupItem value="no" /></FormControl>
                                                        <FormLabel className="font-normal">NO</FormLabel>
                                                    </FormItem>
                                                </RadioGroup>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="sendVisitEmail"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center space-x-2">
                                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel>Send Visit Email</FormLabel>
                                        </div>
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="sendVisitSms"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center space-x-2">
                                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel>Send Visit SMS</FormLabel>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        </div>
                         <div className="mt-8 flex items-center gap-4">
                            <p className="text-sm text-destructive">Please click on Update Activity if you have updated any changes.</p>
                            <Button type="submit" disabled={loading} className="bg-cyan-600 hover:bg-cyan-700">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Update Activity
                            </Button>
                        </div>
                    </form>
                 </Form>
            </CardContent>
        </Card>
    )
}

const roomOptions = [
    { value: "living-room", label: "Living Room" },
    { value: "bed-room", label: "Bed Room" },
    { value: "kitchen", label: "Kitchen" },
    { value: "dining-room", label: "Dining Room" },
];

function MeasurementForm() {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const form = useForm<MeasurementFormValues>({
        resolver: zodResolver(measurementSchema),
        defaultValues: {
            room: "",
            measurementReference: "",
            noOfUnits: "1",
            measurement: "",
        },
    });

    const onSubmit = (data: MeasurementFormValues) => {
        setLoading(true);
        console.log("Measurement Data:", data);
        setTimeout(() => {
            setLoading(false);
            toast({ title: "Measurement Added", description: "The new measurement has been saved." });
            form.reset();
        }, 1500);
    }

    return (
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
                                            <FormLabel className="flex items-center gap-1">Room <span className="text-destructive">*</span><Info className="h-3 w-3" /><Button type="button" variant="ghost" size="icon" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel>
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
                                                <Input type="file" {...field} />
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
    );
}

const productCategoryOptions = [{ value: "fabric", label: "Fabric" }, { value: "furniture", label: "Furniture" }];
const salesDescriptionOptions = [{ value: "curtain", label: "Drawing Room Curtain" }, { value: "sofa", label: "Sofa Fabric" }];

const AddProductForm = ({ onAddProduct }: { onAddProduct: (data: ProductFormValues) => void }) => {
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
            if (category.includes('fabric')) productCategoryValue = 'fabric';
            else if (category.includes('furniture')) productCategoryValue = 'furniture';
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
                        <FormField control={addProductForm.control} name="productCategory" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Product Category <Info className="h-3 w-3"/></FormLabel> <Combobox options={productCategoryOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /> <FormMessage /> </FormItem> )} />
                        <FormField control={addProductForm.control} name="collectionBrand" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Collection/Brand (BCN)* <span className="text-destructive">*</span><Info className="h-3 w-3"/><Button type="button" variant="ghost" size="icon" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel> <Combobox options={bcnOptions} value={field.value} onSelect={handleBcnSelect} onSearch={handleBcnSearch} placeholder="Search by any part of BCN..." searchPlaceholder="Type to search BCN..." emptyPlaceholder={isSearching ? 'Searching...' : 'No BCN found.'} /> <FormMessage /> </FormItem> )} />
                        <FormField control={addProductForm.control} name="serialNo" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Serial No <span className="text-destructive">*</span><Info className="h-3 w-3"/></FormLabel> <FormControl><Input {...field} readOnly /></FormControl> <FormMessage /> </FormItem> )} />
                        <FormField control={addProductForm.control} name="salesDescription" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Sales Description <Info className="h-3 w-3"/><Button type="button" variant="ghost" size="icon" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel> <Combobox options={salesDescriptionOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /> <FormMessage /> </FormItem> )} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <FormField control={addProductForm.control} name="quantity" render={({ field }) => (<FormItem> <FormLabel className="flex items-center gap-1">Quantity <span className="text-destructive">*</span><Info className="h-3 w-3"/></FormLabel> <div className="flex items-center"><FormControl><Input {...field}/></FormControl><Button type="button" variant="ghost" size="icon" className="ml-1"><Calculator className="h-5 w-5"/></Button></div> <FormMessage /> </FormItem>)} />
                        <FormField control={addProductForm.control} name="remarks" render={({ field }) => (<FormItem> <FormLabel className="flex items-center gap-1">Remarks <Info className="h-3 w-3"/></FormLabel> <FormControl><Input {...field} /></FormControl> <FormMessage /> </FormItem>)} />
                        <FormField control={addProductForm.control} name="room" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Room <Info className="h-3 w-3"/><Button type="button" variant="ghost" size="icon" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel> <Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /> <FormMessage /> </FormItem> )} />
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

function ProductForm({ initialProducts, customerId, dealId, onRefresh, deal, customer }: { initialProducts: DealProduct[], customerId: string, dealId: string, onRefresh: () => void, deal: Deal, customer: Customer }) {
    const [activityLoading, setActivityLoading] = useState(false);
    const { toast } = useToast();
    const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isQuotationDialogOpen, setIsQuotationDialogOpen] = useState(false);
    const [selectedProductsForQuotation, setSelectedProductsForQuotation] = useState<DealProduct[]>([]);


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

    return (
        <FormProvider {...form}>
        <Card className="mt-6">
            <CardContent className="p-6">
                <AddProductForm onAddProduct={handleAddProduct}/>

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
                                    <TableCell>Order Created</TableCell>
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
            onSuccess={onRefresh}
        />
        </FormProvider>
    )
}

function QuotationsTab({ customerId, dealId }: { customerId: string, dealId: string }) {
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchQuotations = async () => {
            setLoading(true);
            const data = await getQuotationsForDeal(customerId, dealId);
            setQuotations(data);
            setLoading(false);
        };
        fetchQuotations();
    }, [customerId, dealId]);

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
                                    <TableCell className="font-medium text-primary cursor-pointer hover:underline">{q.quotationNo}</TableCell>
                                    <TableCell>{format(new Date(q.date), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell>{q.customerName}</TableCell>
                                    <TableCell><Badge variant="secondary">{q.status}</Badge></TableCell>
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
  const { customerId, dealId } = params;
  const { toast } = useToast();
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [salesmen, setSalesmen] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (!customerId || !dealId) return;
    fetchData();
  }, [customerId, dealId, fetchData]);

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

        <Tabs defaultValue="products">
          <TabsList className="mb-4">
            <TabsTrigger value="visits"><Home className="mr-2 h-4 w-4" />Visits</TabsTrigger>
            <TabsTrigger value="measurement"><GanttChartSquare className="mr-2 h-4 w-4"/>Measurement</TabsTrigger>
            <TabsTrigger value="products"><ShoppingCart className="mr-2 h-4 w-4"/>Products</TabsTrigger>
            <TabsTrigger value="reminder"><Calendar className="mr-2 h-4 w-4"/>Reminder/Notes</TabsTrigger>
            <TabsTrigger value="receipt"><Receipt className="mr-2 h-4 w-4"/>Receipt</TabsTrigger>
            <TabsTrigger value="vas"><Package className="mr-2 h-4 w-4"/>VAS</TabsTrigger>
            <TabsTrigger value="orders"><UserIcon className="mr-2 h-4 w-4"/>Orders</TabsTrigger>
            <TabsTrigger value="quotations"><MessageSquare className="mr-2 h-4 w-4"/>Quotations</TabsTrigger>
            <TabsTrigger value="invoice"><FileText className="mr-2 h-4 w-4"/>Invoice</TabsTrigger>
          </TabsList>
          
          <TabsContent value="visits">
            <VisitForm salesmen={salesmen} />
          </TabsContent>
          
          <TabsContent value="measurement">
            <MeasurementForm />
          </TabsContent>
          
          <TabsContent value="products">
            <ProductForm 
                initialProducts={deal.products || []}
                customerId={customerId}
                dealId={dealId}
                onRefresh={fetchData}
                deal={deal}
                customer={customer}
            />
          </TabsContent>

          <TabsContent value="quotations">
             <QuotationsTab customerId={customerId} dealId={dealId} />
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}
