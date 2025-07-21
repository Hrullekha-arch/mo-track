
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { PurchaseRequest } from "@/lib/types";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

const fabricDetailSchema = z.object({
  fabricName: z.string().min(1, "Fabric name is required"),
  quantity: z.string().min(1, "Quantity is required"),
});

const furnitureDetailSchema = z.object({
  furnitureName: z.string().min(1, "Furniture name is required"),
  quantity: z.string().min(1, "Quantity is required"),
});

const formSchema = z.object({
  type: z.enum(["fabric", "furniture"]),
  email: z.string().email("Invalid email address.").optional(),
  dealId: z.string().min(1, "Deal ID is required"),
  customerName: z.string().min(1, "Customer name is required"),
  promiseDeliveryDate: z.date({ required_error: "Promise delivery date is required." }),
  salesman: z.string().min(1, "Salesman is required"),
  workType: z.string().min(1, "Type of work is required"),
  fabricDetails: z.array(fabricDetailSchema).optional(),
  furnitureDetails: z.array(furnitureDetailSchema).optional(),
}).refine(
  (data) => {
    if (data.type === 'fabric') {
        return data.fabricDetails && data.fabricDetails.length > 0 && data.fabricDetails.every(f => f.fabricName && f.quantity);
    }
    return true;
  },
  {
    message: "At least one fabric detail with name and quantity is required.",
    path: ["fabricDetails"],
  }
).refine(
  (data) => {
    if (data.type === 'furniture') {
        return data.furnitureDetails && data.furnitureDetails.length > 0 && data.furnitureDetails.every(f => f.furnitureName && f.quantity);
    }
    return true;
  },
  {
    message: "At least one furniture detail with name and quantity is required.",
    path: ["furnitureDetails"],
  }
);


type PurchaseFormValues = z.infer<typeof formSchema>;

const FabricForm = ({ form }: { form: any }) => {
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "fabricDetails",
    });

    return (
        <div className="space-y-4">
             <FormLabel>Fabric Details</FormLabel>
            {fields.map((field, index) => (
                 <Card key={field.id} className="p-4">
                    <div className="flex items-end gap-4">
                        <FormField
                            control={form.control}
                            name={`fabricDetails.${index}.fabricName`}
                            render={({ field }) => (
                                <FormItem className="flex-grow">
                                    <FormLabel>Fabric Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter fabric name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name={`fabricDetails.${index}.quantity`}
                            render={({ field }) => (
                                <FormItem>
                                     <FormLabel>Qty (Mtr)</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter quantity" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <Button type="button" variant="destructive" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                         </Button>
                    </div>
                 </Card>
            ))}
             <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ fabricName: "", quantity: "" })}
            >
                <PlusCircle className="mr-2 h-4 w-4"/>
                Add Fabric
            </Button>
        </div>
    );
};

const FurnitureForm = ({ form }: { form: any }) => {
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "furnitureDetails",
    });

    return (
        <div className="space-y-4">
             <FormLabel>Furniture Details</FormLabel>
            {fields.map((field, index) => (
                 <Card key={field.id} className="p-4">
                    <div className="flex items-end gap-4">
                        <FormField
                            control={form.control}
                            name={`furnitureDetails.${index}.furnitureName`}
                            render={({ field }) => (
                                <FormItem className="flex-grow">
                                    <FormLabel>Furniture Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter furniture name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name={`furnitureDetails.${index}.quantity`}
                            render={({ field }) => (
                                <FormItem>
                                     <FormLabel>Qty</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter quantity" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <Button type="button" variant="destructive" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                         </Button>
                    </div>
                 </Card>
            ))}
             <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ furnitureName: "", quantity: "" })}
            >
                <PlusCircle className="mr-2 h-4 w-4"/>
                Add Furniture
            </Button>
        </div>
    );
};

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

    const details = data.type === 'fabric' ? data.fabricDetails : data.furnitureDetails;
    const itemName = data.type === 'fabric' ? 'Fabric' : 'Furniture';

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
                                <div><p className="text-muted-foreground">Email</p><p className="font-medium">{data.email || 'N/A'}</p></div>
                                <div><p className="text-muted-foreground">Salesman</p><p className="font-medium">{data.salesman}</p></div>
                                <div><p className="text-muted-foreground">Work Type</p><p className="font-medium">{data.workType}</p></div>
                                <div><p className="text-muted-foreground">Promise Delivery</p><p className="font-medium">{format(data.promiseDeliveryDate, "PPP")}</p></div>
                            </div>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader>
                            <CardTitle>{itemName} Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {details?.map((item, index) => (
                                <div key={index}>
                                    <div className="flex justify-between items-center text-sm">
                                        <p className="font-medium">{data.type === 'fabric' ? (item as any).fabricName : (item as any).furnitureName}</p>
                                        <p className="text-muted-foreground">Qty: <span className="font-medium text-foreground">{item.quantity}</span> {data.type === 'fabric' && 'Mtr'}</p>
                                    </div>
                                    {index < details.length - 1 && <Separator className="my-2" />}
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
    const [previewData, setPreviewData] = useState<PurchaseFormValues | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<PurchaseFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            type: "fabric",
            fabricDetails: [{ fabricName: "", quantity: "" }],
            furnitureDetails: [],
        },
    });

    const formType = form.watch("type");

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
                email: previewData.email || "",
                dealId: previewData.dealId,
                customerName: previewData.customerName,
                promiseDeliveryDate: previewData.promiseDeliveryDate.toISOString(),
                salesman: previewData.salesman,
                workType: previewData.workType,
                fabricDetails: previewData.fabricDetails || [],
                furnitureDetails: previewData.furnitureDetails || [],

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
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <div className="flex items-center justify-between">
                         <Button variant="ghost" size="icon" onClick={() => router.back()}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        <CardTitle className="text-2xl text-center text-primary flex-grow">
                            {formType === 'fabric' ? 'Fabric Purchase Request' : 'Furniture Purchase Request'}
                        </CardTitle>
                         <div className="w-8"></div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handlePreview)} className="space-y-8">
                            <Tabs
                                value={formType}
                                onValueChange={(value) => {
                                    const newType = value as "fabric" | "furniture";
                                    form.setValue("type", newType);
                                    if (newType === 'fabric') {
                                        if (!form.getValues('fabricDetails')?.length) {
                                          form.setValue('fabricDetails', [{ fabricName: '', quantity: '' }]);
                                        }
                                        form.setValue('furnitureDetails', []);
                                    } else if (newType === 'furniture') {
                                         if (!form.getValues('furnitureDetails')?.length) {
                                           form.setValue('furnitureDetails', [{ furnitureName: '', quantity: '' }]);
                                        }
                                        form.setValue('fabricDetails', []);
                                    }
                                }}
                                className="w-full"
                            >
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="fabric">Fabric</TabsTrigger>
                                    <TabsTrigger value="furniture">Furniture</TabsTrigger>
                                </TabsList>

                                <div className="space-y-6 pt-6">
                                     <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Email</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter email" {...field} />
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
                                                    <Input placeholder="Enter customer name" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="promiseDeliveryDate"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel>Promise Delivery Date</FormLabel>
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
                                                                    <span>Pick a date</span>
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
                                                <FormControl>
                                                    <Input placeholder="Enter salesman name" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                     <FormField
                                        control={form.control}
                                        name="workType"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Type Of Work</FormLabel>
                                                 <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select Type" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Stitching">Stitching</SelectItem>
                                                        <SelectItem value="Delivery">Delivery</SelectItem>
                                                        <SelectItem value="Installation">Installation</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <TabsContent value="fabric" className="mt-6">
                                    <FabricForm form={form} />
                                </TabsContent>
                                <TabsContent value="furniture" className="mt-6">
                                    <FurnitureForm form={form} />
                                </TabsContent>
                            </Tabs>

                            <Button type="submit" className="w-full" size="lg">Review & Submit</Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            <PurchaseRequestPreviewDialog
                isOpen={!!previewData}
                onClose={() => setPreviewData(null)}
                onConfirm={handleConfirmSubmit}
                data={previewData}
                isSubmitting={isSubmitting}
            />
        </div>
    );
}
