
"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, PlusCircle, Trash2, ArrowLeft, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { collection, doc, setDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { PurchaseRequest, User } from "@/lib/types";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

const fabricDetailSchema = z.object({
  fabricName: z.string().min(1, "Fabric name is required"),
  quantity: z.string().min(1, "Quantity is required"),
  hasPanels: z.boolean().default(false),
  type: z.string().optional(),
  panels: z.string().optional(),
});

const formSchema = z.object({
  email: z.string().email("Invalid email address.").optional(),
  dealId: z.string().min(1, "Deal ID is required"),
  customerName: z.string().min(1, "Customer name is required"),
  deliveryDate: z.date({ required_error: "Delivery date is required." }),
  salesman: z.string().min(1, "Salesman is required"),
  fabricDetails: z.array(fabricDetailSchema).min(1, "At least one item is required"),
});

type PurchaseFormValues = z.infer<typeof formSchema>;

const PurchaseRequestPreviewDialog = ({
    isOpen,
    onClose,
    onConfirm,
    data,
    isSubmitting,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    data: PurchaseFormValues | null;
    isSubmitting: boolean;
}) => {
    if (!data) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Confirm Purchase Request</DialogTitle>
                    <DialogDescription>Please review the details below before submitting.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4 max-h-[70vh] overflow-y-auto pr-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Request Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="grid grid-cols-2 gap-4">
                                <div><p className="text-muted-foreground">Customer Name</p><p className="font-medium">{data.customerName}</p></div>
                                <div><p className="text-muted-foreground">Deal ID</p><p className="font-medium">{data.dealId}</p></div>
                                <div><p className="text-muted-foreground">Requester Email</p><p className="font-medium">{data.email || 'N/A'}</p></div>
                                <div><p className="text-muted-foreground">Salesman</p><p className="font-medium">{data.salesman}</p></div>
                                <div><p className="text-muted-foreground">Delivery Date</p><p className="font-medium">{format(data.deliveryDate, "PPP")}</p></div>
                            </div>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader>
                            <CardTitle>Item Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {data.fabricDetails?.map((item, index) => (
                                <div key={index}>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                        <p className="font-medium col-span-2">{item.fabricName}</p>
                                        <p className="text-muted-foreground">Qty: <span className="font-medium text-foreground">{item.quantity}</span> Mtr</p>
                                        {item.hasPanels && (
                                            <>
                                                <p className="text-muted-foreground">Type: <span className="font-medium text-foreground">{item.type}</span></p>
                                                <p className="text-muted-foreground col-span-2">Panels: <span className="font-medium text-foreground">{item.panels}</span></p>
                                            </>
                                        )}
                                    </div>
                                    {index < (data.fabricDetails?.length || 0) - 1 && <Separator className="my-2" />}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button onClick={onConfirm} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm & Submit
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


export default function NewPurchaseRequestPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [salesmen, setSalesmen] = useState<User[]>([]);
    const [previewData, setPreviewData] = useState<PurchaseFormValues | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<PurchaseFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            dealId: "",
            customerName: "",
            salesman: "",
            fabricDetails: [{ fabricName: "", quantity: "", hasPanels: false, type: "", panels: "" }],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "fabricDetails",
    });

    useEffect(() => {
        if (user?.email) {
            form.setValue('email', user.email);
        }
    }, [user, form]);
    
    useEffect(() => {
        const salesmenQuery = query(collection(db, "users"), where("role", "==", "salesman"));
        const unsubscribe = onSnapshot(salesmenQuery, (snapshot) => {
            const salesmenData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
            setSalesmen(salesmenData.sort((a, b) => a.name.localeCompare(b.name)));
        });
        return () => unsubscribe();
    }, []);


    const handlePreview = (data: PurchaseFormValues) => {
        setPreviewData(data);
    };

    const handleConfirmSubmit = async () => {
        if (!previewData || !user) return;
        setIsSubmitting(true);
        
        try {
            const newRequestRef = doc(db, "purchaseRequests", previewData.dealId);

            const requestData: PurchaseRequest = {
                id: previewData.dealId,
                type: 'fabric', // Only fabric is supported in this form
                email: previewData.email || "",
                dealId: previewData.dealId,
                customerName: previewData.customerName,
                promiseDeliveryDate: previewData.deliveryDate.toISOString(),
                salesman: previewData.salesman,
                fabricDetails: previewData.fabricDetails || [],
                furnitureDetails: [],

                createdAt: new Date().toISOString(),
                createdBy: {
                    id: user.id,
                    name: user.name,
                },
                milestones: [],
                vendorType: 'undecided',
                status: 'pending',
            };

            await setDoc(newRequestRef, requestData);
            toast({
                title: "Purchase Request Created",
                description: "Your request has been submitted for approval.",
            });
            setPreviewData(null);
            router.push("/dashboard/purchase");
        } catch (error) {
            console.error("Error creating purchase request: ", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to create purchase request.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };


    return (
        <>
            <div className="container mx-auto p-4 md:p-6 lg:p-8">
                <Card className="max-w-3xl mx-auto">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                             <Button variant="ghost" size="icon" onClick={() => router.back()}>
                                <ArrowLeft className="h-6 w-6" />
                            </Button>
                            <CardTitle className="text-2xl text-center flex-grow">
                                New Purchase Request
                            </CardTitle>
                             <div className="w-8"></div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(handlePreview)} className="space-y-6">
                                <div className="space-y-4">
                                     <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Email</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="email@example.com" {...field} disabled />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                     <FormField
                                        control={form.control}
                                        name="dealId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Deal ID</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter deal ID" {...field} />
                                                </FormControl>
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
                                                <FormControl>
                                                    <Input placeholder="Name" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="deliveryDate"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel>Delivery Date</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button
                                                                variant={"outline"}
                                                                className={cn(
                                                                    "w-full pl-3 text-left font-normal",
                                                                    !field.value && "text-muted-foreground"
                                                                )}
                                                            >
                                                                {field.value ? (
                                                                    format(field.value, "PPP")
                                                                ) : (
                                                                    <span>dd-mm-yyyy</span>
                                                                )}
                                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                            </Button>
                                                        </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <Calendar
                                                            mode="single"
                                                            selected={field.value}
                                                            onSelect={field.onChange}
                                                            disabled={(date) => date < new Date()}
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
                                        name="salesman"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Salesman</FormLabel>
                                                 <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {salesmen.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                
                                <Separator />
                                
                                <div className="space-y-4">
                                    <FormLabel>Item Details</FormLabel>
                                    {fields.map((field, index) => {
                                        const hasPanels = form.watch(`fabricDetails.${index}.hasPanels`);
                                        return (
                                            <Card key={field.id} className="p-4 space-y-4 bg-muted/50">
                                                <div className="grid grid-cols-10 gap-4">
                                                    <div className="col-span-5">
                                                        <FormField control={form.control} name={`fabricDetails.${index}.fabricName`} render={({ field }) => ( <FormItem><FormControl><Input placeholder="Fabric Name" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                                    </div>
                                                    <div className="col-span-3">
                                                        <FormField control={form.control} name={`fabricDetails.${index}.quantity`} render={({ field }) => ( <FormItem><FormControl><Input placeholder="Qty (Mtr)" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <Button type="button" variant="destructive" className="w-full" onClick={() => remove(index)}>Delete</Button>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-10 gap-4 items-center">
                                                     <div className="col-span-1">
                                                        <FormField control={form.control} name={`fabricDetails.${index}.hasPanels`} render={({ field }) => ( <FormItem><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                                                    </div>
                                                     <div className="col-span-5">
                                                        <FormField control={form.control} name={`fabricDetails.${index}.type`} render={({ field }) => ( <FormItem><Select onValueChange={field.onChange} defaultValue={field.value} disabled={!hasPanels}><FormControl><SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="typeA">Type A</SelectItem><SelectItem value="typeB">Type B</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                                                    </div>
                                                    <div className="col-span-4">
                                                         <FormField control={form.control} name={`fabricDetails.${index}.panels`} render={({ field }) => ( <FormItem><FormControl><Input placeholder="No of Panels" {...field} disabled={!hasPanels} /></FormControl><FormMessage /></FormItem>)} />
                                                    </div>
                                                </div>
                                            </Card>
                                        )
                                    })}
                                     <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        className="bg-green-600 text-white hover:bg-green-700"
                                        onClick={() => append({ fabricName: "", quantity: "", hasPanels: false, type: "", panels: "" })}
                                    >
                                        <PlusCircle className="mr-2 h-4 w-4"/>
                                        Add
                                    </Button>
                                </div>
                                <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" size="lg">Submit</Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </div>
            <PurchaseRequestPreviewDialog
                isOpen={!!previewData}
                onClose={() => setPreviewData(null)}
                onConfirm={handleConfirmSubmit}
                data={previewData}
                isSubmitting={isSubmitting}
            />
        </>
    );
}
