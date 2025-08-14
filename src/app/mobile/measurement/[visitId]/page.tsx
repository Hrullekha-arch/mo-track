

"use client";

import * as React from 'react';
import { useForm, useFieldArray, FormProvider, useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/context/AuthContext';
import { Customer, Deal, DealMeasurement, User } from '@/lib/types';
import { getCustomerById } from '@/app/dashboard/customers/actions';
import { getDealById, addMeasurementAction } from '@/app/dashboard/customers/[customerId]/[dealId]/actions';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ArrowLeft, PlusCircle, Trash2 } from "lucide-react";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const measurementEntrySchema = z.object({
    // Curtain/Wallpaper fields
    roomName: z.string().optional(),
    noOfPannel: z.string().optional(),
    height: z.string().optional(),
    width: z.string().optional(),
    image: z.any().optional(),
    imageUrl: z.string().optional(),
    remark: z.string().optional(),
    recordAudio: z.any().optional(),
    audioUrl: z.string().optional(),

    // Sofa Measurement fields
    noOfSheet: z.string().optional(),
    fabricQty1: z.string().optional(),
    fabricQty2: z.string().optional(),
    marking: z.string().optional(),
    casement: z.string().optional(),
    niwar: z.string().optional(),
    picture: z.any().optional(),
    pictureUrl: z.string().optional(),
});


const measurementSchema = z.object({
    typeOf: z.string().min(1, "Type is required"),
    doerName: z.string().min(1, "Doer name is required"),
    entries: z.array(measurementEntrySchema)
});

export type MeasurementFormValues = z.infer<typeof measurementSchema>;

const MEASUREMENT_TYPES = ["Curtains", "Wallpaper", "Wall to Wall", "Sofa Measurement"];
const DOER_OPTIONS = ["TU", "OP", "NC", "VN", "MU"];

const MeasurementEntryCard = ({ index, remove }: { index: number, remove: (index: number) => void }) => {
    const { control } = useFormContext<MeasurementFormValues>();
    const typeOf = useWatch({ control, name: "typeOf" });

    return (
        <Card className="relative">
            <Button type="button" variant="destructive" size="icon" className="absolute -top-3 -right-3 h-7 w-7" onClick={() => remove(index)}><Trash2 className="h-4 w-4"/></Button>
            <CardContent className="pt-6">
                {typeOf === "Sofa Measurement" ? (
                    <div className="space-y-3">
                        <FormField control={control} name={`entries.${index}.noOfSheet`} render={({ field }) => (<FormItem><FormLabel>No Of Sheet</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`entries.${index}.fabricQty1`} render={({ field }) => (<FormItem><FormLabel>Fabric Qty 1</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`entries.${index}.fabricQty2`} render={({ field }) => (<FormItem><FormLabel>Fabric Qty 2</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`entries.${index}.marking`} render={({ field }) => (<FormItem><FormLabel>Marking (MTR)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`entries.${index}.casement`} render={({ field }) => (<FormItem><FormLabel>Casement (MTR)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`entries.${index}.niwar`} render={({ field }) => (<FormItem><FormLabel>Niwar (MTR)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`entries.${index}.picture`} render={({ field }) => (<FormItem><FormLabel>Picture (Upto 5)</FormLabel><FormControl><Input type="file" accept="image/*" onChange={(e) => field.onChange(e.target.files)} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`entries.${index}.remark`} render={({ field }) => (<FormItem><FormLabel>Remark</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                    </div>
                ) : (
                    <div className="space-y-3">
                        <FormField control={control} name={`entries.${index}.roomName`} render={({ field }) => (<FormItem><FormLabel>Room Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`entries.${index}.noOfPannel`} render={({ field }) => (<FormItem><FormLabel>No Of Pannel</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`entries.${index}.height`} render={({ field }) => (<FormItem><FormLabel>Height</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`entries.${index}.width`} render={({ field }) => (<FormItem><FormLabel>Width</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`entries.${index}.image`} render={({ field }) => (<FormItem><FormLabel>Image</FormLabel><FormControl><Input type="file" accept="image/*" onChange={(e) => field.onChange(e.target.files)} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`entries.${index}.remark`} render={({ field }) => (<FormItem><FormLabel>Remark</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`entries.${index}.recordAudio`} render={({ field }) => (<FormItem><FormLabel>Record Audio</FormLabel><FormControl><Input type="file" accept="audio/*" onChange={(e) => field.onChange(e.target.files)} /></FormControl></FormItem>)} />
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export default function MeasurementPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const { toast } = useToast();

    const visitId = params.visitId as string;
    const dealId = searchParams.get('dealId');
    const customerId = searchParams.get('customerId');

    const [customer, setCustomer] = React.useState<Customer | null>(null);
    const [deal, setDeal] = React.useState<Deal | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const form = useForm<MeasurementFormValues>({
        resolver: zodResolver(measurementSchema),
        defaultValues: {
            typeOf: "Curtains",
            doerName: "",
            entries: [{}]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "entries"
    });
    
    React.useEffect(() => {
        if (!customerId || !dealId) {
            toast({ variant: 'destructive', title: 'Error', description: 'Missing customer or deal ID.' });
            router.back();
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                const [customerData, dealData] = await Promise.all([
                    getCustomerById(customerId),
                    getDealById(customerId, dealId),
                ]);
                setCustomer(customerData);
                setDeal(dealData);
            } catch (error) {
                console.error("Failed to fetch data:", error);
                toast({ variant: "destructive", title: "Error", description: "Could not load required data." });
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [customerId, dealId, toast, router]);

    const handleFileUpload = async (file: File): Promise<string> => {
        const storage = getStorage();
        const storageRef = ref(storage, `measurements/${dealId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        return downloadURL;
    };

    const onSubmit = async (data: MeasurementFormValues) => {
        if (!user || !customerId || !dealId) {
            toast({ variant: 'destructive', title: 'Error', description: 'Missing critical information.' });
            return;
        }
        setIsSubmitting(true);
        
        try {
            const processedEntries = await Promise.all(data.entries.map(async (entry) => {
                const imageUrl = entry.image?.[0] ? await handleFileUpload(entry.image[0]) : undefined;
                const audioUrl = entry.recordAudio?.[0] ? await handleFileUpload(entry.recordAudio[0]) : undefined;
                const pictureUrl = entry.picture?.[0] ? await handleFileUpload(entry.picture[0]) : undefined;

                return {
                    ...entry,
                    image: undefined,
                    recordAudio: undefined,
                    picture: undefined,
                    imageUrl,
                    audioUrl,
                    pictureUrl,
                };
            }));

            const measurementData = {
                ...data,
                entries: processedEntries
            };
            
            const result = await addMeasurementAction(customerId, dealId, measurementData as DealMeasurement, user.name);

            if (result.success) {
                toast({ title: 'Success', description: 'Measurement saved successfully.' });
                router.push('/mobile');
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        } catch (error: any) {
            console.error("Error submitting measurement:", error);
            toast({ variant: 'destructive', title: 'Error', description: `An unexpected error occurred: ${error.message}` });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="p-4 space-y-4">
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <header className="flex items-center gap-2 mb-4">
                 <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft />
                 </Button>
                 <h1 className="text-xl font-bold">Measurements</h1>
            </header>
            <FormProvider {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <Card>
                        <CardContent className="pt-6 grid grid-cols-1 gap-4">
                            <div className="space-y-1">
                                <FormLabel>Deal ID</FormLabel>
                                <Input value={deal?.dealId || ''} readOnly disabled />
                            </div>
                            <div className="space-y-1">
                                <FormLabel>Customer Name</FormLabel>
                                <Input value={customer?.name || ''} readOnly disabled />
                            </div>
                            <FormField
                                control={form.control}
                                name="typeOf"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Type Of</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {MEASUREMENT_TYPES.map(opt => (
                                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="doerName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Doer Name</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Select Doer" /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {DOER_OPTIONS.map(d => (
                                                    <SelectItem key={d} value={d}>{d}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Measurement Entries</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {fields.map((field, index) => (
                               <MeasurementEntryCard key={field.id} index={index} remove={remove} />
                            ))}
                            <Button type="button" variant="outline" onClick={() => append({})}><PlusCircle className="mr-2 h-4 w-4"/>Add</Button>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" className="w-full" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Add
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
            </FormProvider>
        </div>
    );
}
