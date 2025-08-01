

"use client";

import { use, useEffect, useState, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Customer, Deal, User, Stock } from "@/lib/types";
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
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getCustomerById, getSalesmen } from "../../actions";
import { getDealById } from "./actions";
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
    productCategory: z.string().optional(),
    collectionBrand: z.string().min(1, "Collection/Brand is required."), // This will now hold the BCN
    serialNo: z.string().optional(),
    salesDescription: z.string().optional(),
    quantity: z.string().min(1, "Quantity is required."),
    remarks: z.string().optional(),
    room: z.string().optional(),
    noOfPcs: z.string().optional(),
    info1: z.string().optional(),
    info2: z.string().optional(),
    stitchingType: z.enum(["in", "out"]).optional(),
    file: z.any().optional(),
    pushToMeasurement: z.boolean().default(false),
});

type ProductFormValues = z.infer<typeof productSchema>;

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

function ProductForm() {
    const [loading, setLoading] = useState(false);
    const [activityLoading, setActivityLoading] = useState(false);
    const [products, setProducts] = useState<ProductFormValues[]>([]);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [bcnOptions, setBcnOptions] = useState<{ value: string; label: string; stockItem: Stock }[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const { toast } = useToast();

    const form = useForm<ProductFormValues>({
        resolver: zodResolver(productSchema),
        defaultValues: {
            productCategory: 'fabric',
            collectionBrand: "",
            serialNo: "",
            noOfPcs: '1',
            pushToMeasurement: false,
        },
    });

    const handleBcnSearch = async (query: string) => {
        if (query.length < 2) {
            setBcnOptions([]);
            return;
        }
        setIsSearching(true);
        try {
            const results = await searchStockByBcn(query);
            setBcnOptions(results.map(stock => ({
                value: stock.bcn || stock.id,
                label: stock.bcn || stock.id,
                stockItem: stock,
            })));
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
            form.setValue('collectionBrand', stockItem.bcn || stockItem.id);
            const category = stockItem.category?.toLowerCase() || '';
            if (category.includes('fabric')) {
                form.setValue('productCategory', 'fabric');
            } else if (category.includes('furniture')) {
                form.setValue('productCategory', 'furniture');
            }
            form.setValue('serialNo', stockItem.serialNo || '');
        }
    };

    const onSubmit = (data: ProductFormValues) => {
        setLoading(true);
        if (editingIndex !== null) {
            // Update existing product
            const updatedProducts = [...products];
            updatedProducts[editingIndex] = data;
            setProducts(updatedProducts);
            toast({ title: "Product Updated", description: "The product has been updated in the list." });
        } else {
            // Add new product
            setProducts(prev => [...prev, data]);
            toast({ title: "Product Added", description: "The new product has been added to the list." });
        }
        setEditingIndex(null);
        form.reset({
            productCategory: 'fabric',
            collectionBrand: "",
            serialNo: "",
            noOfPcs: '1',
            pushToMeasurement: false,
        });
        setLoading(false);
    }
    
    const handleEdit = (index: number) => {
        setEditingIndex(index);
        const productToEdit = products[index];
        form.reset(productToEdit);
    }

    const handleDelete = (index: number) => {
        setProducts(products.filter((_, i) => i !== index));
        toast({ title: "Product Removed", description: "The product has been removed from the list." });
    }

    const handleCancelEdit = () => {
        setEditingIndex(null);
        form.reset();
    }
    
    const handleUpdateActivity = () => {
        setActivityLoading(true);
        console.log("Updating activity with products:", products);
        setTimeout(() => {
            setActivityLoading(false);
            toast({ title: "Activity Updated", description: "All product changes have been saved." });
        }, 2000);
    }

    return (
        <Card className="mt-6">
            <CardContent className="p-6">
                <h3 className="text-xl font-semibold mb-6">Previously Added Products</h3>
                <div className="mb-4">
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
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
                            {products.length > 0 ? products.map((product, index) => (
                                <TableRow key={index}>
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => handleEdit(index)}><Edit className="h-4 w-4 text-blue-600"/></Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                    </TableCell>
                                    <TableCell>{product.collectionBrand}</TableCell>
                                    <TableCell>{product.serialNo}</TableCell>
                                    <TableCell>{product.quantity}</TableCell>
                                    <TableCell>{product.room}</TableCell>
                                    <TableCell>{product.noOfPcs}</TableCell>
                                    <TableCell>{product.salesDescription}</TableCell>
                                    <TableCell>{product.remarks}</TableCell>
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
                    <Button>Convert To Order</Button>
                    <Button>Convert To Quotation</Button>
                </div>

                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-semibold">{editingIndex !== null ? 'Edit Product' : 'Add More Products'}</h3>
                    <div className="text-sm text-muted-foreground">
                        <span className="mr-4">MRP: </span>
                        <span>UOM: MTRS</span>
                    </div>
                </div>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                         <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <FormField control={form.control} name="productCategory" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Product Category <Info className="h-3 w-3"/></FormLabel> <Combobox options={productCategoryOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /> <FormMessage /> </FormItem> )} />
                            <FormField control={form.control} name="collectionBrand" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Collection/Brand (BCN)* <span className="text-destructive">*</span><Info className="h-3 w-3"/><Button type="button" variant="ghost" size="icon" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel> <Combobox options={bcnOptions} value={field.value} onSelect={handleBcnSelect} onSearch={handleBcnSearch} placeholder="Search by any part of BCN..." searchPlaceholder="Type to search BCN..." emptyPlaceholder={isSearching ? 'Searching...' : 'No BCN found.'} /> <FormMessage /> </FormItem> )} />
                            <FormField control={form.control} name="serialNo" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Serial No <span className="text-destructive">*</span><Info className="h-3 w-3"/></FormLabel> <FormControl><Input {...field} readOnly /></FormControl> <FormMessage /> </FormItem> )} />
                            <FormField control={form.control} name="salesDescription" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Sales Description <Info className="h-3 w-3"/><Button type="button" variant="ghost" size="icon" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel> <Combobox options={salesDescriptionOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /> <FormMessage /> </FormItem> )} />
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                             <FormField control={form.control} name="quantity" render={({ field }) => (<FormItem> <FormLabel className="flex items-center gap-1">Quantity <span className="text-destructive">*</span><Info className="h-3 w-3"/></FormLabel> <div className="flex items-center"><FormControl><Input {...field}/></FormControl><Button type="button" variant="ghost" size="icon" className="ml-1"><Calculator className="h-5 w-5"/></Button></div> <FormMessage /> </FormItem>)} />
                             <FormField control={form.control} name="remarks" render={({ field }) => (<FormItem> <FormLabel className="flex items-center gap-1">Remarks <Info className="h-3 w-3"/></FormLabel> <FormControl><Input {...field} /></FormControl> <FormMessage /> </FormItem>)} />
                             <FormField control={form.control} name="room" render={({ field }) => ( <FormItem> <FormLabel className="flex items-center gap-1">Room <Info className="h-3 w-3"/><Button type="button" variant="ghost" size="icon" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel> <Combobox options={roomOptions} value={field.value} onSelect={field.onChange} placeholder="--SELECT--" /> <FormMessage /> </FormItem> )} />
                             <FormField control={form.control} name="noOfPcs" render={({ field }) => (<FormItem> <FormLabel className="flex items-center gap-1">No of Pcs <Info className="h-3 w-3"/></FormLabel> <FormControl><Input {...field} /></FormControl> <FormMessage /> </FormItem>)} />
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                            <FormField control={form.control} name="info1" render={({ field }) => (<FormItem> <FormLabel>Info 1</FormLabel> <FormControl><Input {...field} /></FormControl> <FormMessage /> </FormItem>)} />
                            <FormField control={form.control} name="info2" render={({ field }) => (<FormItem> <FormLabel>Info 2</FormLabel> <FormControl><Input {...field} /></FormControl> <FormMessage /> </FormItem>)} />
                            <FormField control={form.control} name="stitchingType" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Stitching Type</FormLabel>
                                    <FormControl>
                                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex h-10 items-center space-x-4">
                                            <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="in" /></FormControl><FormLabel className="font-normal">IN</FormLabel></FormItem>
                                            <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="out" /></FormControl><FormLabel className="font-normal">OUT</FormLabel></FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="file" render={({ field }) => (<FormItem> <FormLabel>Upload file</FormLabel> <FormControl><Input type="file" className="bg-teal-500 text-white file:text-white" /></FormControl> <FormMessage /> </FormItem>)} />
                         </div>
                         <FormField control={form.control} name="pushToMeasurement" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-3 space-y-0"> <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl> <div className="space-y-1 leading-none"><FormLabel>Push to Measurement</FormLabel></div> </FormItem>)} />

                        <div className="mt-8 flex gap-2">
                            <Button type="submit" disabled={loading} className="bg-teal-600 hover:bg-teal-700">
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (editingIndex !== null ? 'Update Product' : 'Add Product')}
                            </Button>
                            {editingIndex !== null && (
                                <Button type="button" variant="outline" onClick={handleCancelEdit}>Cancel Edit</Button>
                            )}
                        </div>
                    </form>
                </Form>
                 <div className="mt-12 flex flex-col items-start gap-4">
                    <p className="text-sm text-destructive">Please click on Update Activity if you have updated any changes.</p>
                    <Button onClick={handleUpdateActivity} disabled={activityLoading} className="bg-cyan-600 hover:bg-cyan-700">
                        {activityLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Update Activity
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
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

  useEffect(() => {
    if (!customerId || !dealId) return;

    const fetchData = async () => {
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
    };
    
    fetchData();
  }, [customerId, dealId, toast]);

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
            <p className="text-sm">{deal.description || "test"}</p>
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
            <ProductForm />
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}
