
"use client";

import * as React from 'react';
import { useForm, useFieldArray, FormProvider, useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/context/AuthContext';
import { Customer, Deal, DealMeasurement, User, MeasurementEntry } from '@/lib/types';
import { getCustomerById } from '@/app/dashboard/customers/actions';
import { getDealById, addMeasurementAction } from '@/app/dashboard/customers/[customerId]/[dealId]/actions';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ArrowLeft, PlusCircle, Trash2, Eye, StepBack } from "lucide-react";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Image from 'next/image';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const measurementEntrySchema = z.object({
    roomName: z.string().optional(),
    noOfPannel: z.string().optional(),
    height: z.string().optional(),
    width: z.string().optional(),
    remark: z.string().optional(),
    recordAudio: z.any().optional(),
    audioUrl: z.string().optional(),
    noOfSheet: z.string().optional(),
    fabricQty1: z.string().optional(),
    fabricQty2: z.string().optional(),
    marking: z.string().optional(),
    casement: z.string().optional(),
    niwar: z.string().optional(),
    pictures: z.any().optional(),
    pictureUrls: z.array(z.string()).optional(),
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
    const { control, setValue, getValues } = useFormContext<MeasurementFormValues>();
    const typeOf = useWatch({ control, name: "typeOf" });
    const { toast } = useToast();
    
    const [imagePreviews, setImagePreviews] = React.useState<string[]>([]);
    const pictures = useWatch({ control, name: `entries.${index}.pictures` });


    const handlePictureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = event.target.files;
        if (newFiles) {
            const currentFiles = (getValues(`entries.${index}.pictures`) || []) as File[];
            const combinedFiles = [...currentFiles, ...Array.from(newFiles)];
            
            if (combinedFiles.length > 5) {
                toast({
                    variant: 'destructive',
                    title: 'Upload Limit Exceeded',
                    description: 'You can only upload a maximum of 5 images per entry.',
                });
                return;
            }
            
            setValue(`entries.${index}.pictures`, combinedFiles, { shouldValidate: true });
        }
    };

    React.useEffect(() => {
        if (!pictures) {
          setImagePreviews([]);
          return;
        }
        const fileArray = Array.from(pictures as File[]);
        const newUrls = fileArray.map((file) => URL.createObjectURL(file));
        setImagePreviews(newUrls);
    
        return () => newUrls.forEach(URL.revokeObjectURL);
      }, [pictures]);
    
    const handlePictureRemove = (imageIndex: number) => {
        const currentFiles = (getValues(`entries.${index}.pictures`) || []) as File[];
        const updatedFiles = currentFiles.filter((_, i) => i !== imageIndex);
        setValue(`entries.${index}.pictures`, updatedFiles, { shouldValidate: true });
    }

    return (
        <Card className="relative">
            <Button type="button" variant="destructive" size="icon" className="absolute -top-3 -right-3 h-7 w-7" onClick={() => remove(index)}><Trash2 className="h-4 w-4"/></Button>
            <CardContent className="pt-6">
                 <div className="space-y-3">
                    {typeOf === "Sofa Measurement" ? (
                        <div className="space-y-3">
                            <FormField control={control} name={`entries.${index}.noOfSheet`} render={({ field }) => (<FormItem><FormLabel>No Of Sheet</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                            <FormField control={control} name={`entries.${index}.fabricQty1`} render={({ field }) => (<FormItem><FormLabel>Fabric Qty 1</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                            <FormField control={control} name={`entries.${index}.fabricQty2`} render={({ field }) => (<FormItem><FormLabel>Fabric Qty 2</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                            <FormField control={control} name={`entries.${index}.marking`} render={({ field }) => (<FormItem><FormLabel>Marking (MTR)</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                            <FormField control={control} name={`entries.${index}.casement`} render={({ field }) => (<FormItem><FormLabel>Casement (MTR)</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                            <FormField control={control} name={`entries.${index}.niwar`} render={({ field }) => (<FormItem><FormLabel>Niwar (MTR)</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <FormField control={control} name={`entries.${index}.roomName`} render={({ field }) => (<FormItem><FormLabel>Room Name</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                            <FormField control={control} name={`entries.${index}.noOfPannel`} render={({ field }) => (<FormItem><FormLabel>No Of Pannel</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                            <FormField control={control} name={`entries.${index}.height`} render={({ field }) => (<FormItem><FormLabel>Height</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                            <FormField control={control} name={`entries.${index}.width`} render={({ field }) => (<FormItem><FormLabel>Width</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                        </div>
                    )}
                    <FormItem>
                        <FormLabel>Pictures (Upto 5)</FormLabel>
                        <FormControl>
                            <Input type="file" accept="image/*" multiple onChange={handlePictureChange} />
                        </FormControl>
                    </FormItem>
                     {imagePreviews.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {imagePreviews.map((src, i) => (
                                <div key={i} className="relative">
                                    <Image src={src} alt={`Preview ${i+1}`} width={60} height={60} className="rounded-md object-cover" style={{ height: 'auto' }} data-ai-hint="measurement image"/>
                                    <Button 
                                        type="button" 
                                        variant="destructive" 
                                        size="icon" 
                                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                                        onClick={() => handlePictureRemove(i)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                    <FormField control={control} name={`entries.${index}.remark`} render={({ field }) => (<FormItem><FormLabel>Remark</FormLabel><FormControl><Textarea {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                    <FormField control={control} name={`entries.${index}.recordAudio`} render={({ field }) => (<FormItem><FormLabel>Record Audio</FormLabel><FormControl><Input type="file" accept="audio/*" onChange={(e) => field.onChange(e.target.files?.[0])} /></FormControl></FormItem>)} />
                 </div>
            </CardContent>
        </Card>
    )
}

const MeasurementPreview = ({
    values,
    customer,
    deal,
    onBack,
    onSubmit,
    loading
} : {
    values: MeasurementFormValues,
    customer: Customer,
    deal: Deal,
    onBack: () => void,
    onSubmit: () => void,
    loading: boolean
}) => {
    return (
        <Card>
             <div id="measurement-preview-content" className="p-6">
                <CardHeader>
                    <CardTitle>Measurement Preview</CardTitle>
                    <CardDescription>Please review the details before confirming.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <p><strong>Customer:</strong> {customer.name}</p>
                        <p><strong>Deal ID:</strong> {deal.dealId}</p>
                        <p><strong>Measurement Type:</strong> {values.typeOf}</p>
                        <p><strong>Doer Name:</strong> {values.doerName}</p>
                    </div>

                    {values.entries.map((entry, index) => (
                        <div key={index} className="border-t pt-4">
                            <h4 className="font-semibold mb-2">Entry #{index + 1}</h4>
                            {values.typeOf === 'Sofa Measurement' ? (
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <p><strong>No. of Sheet:</strong> {entry.noOfSheet}</p>
                                    <p><strong>Fabric Qty 1:</strong> {entry.fabricQty1}</p>
                                    <p><strong>Fabric Qty 2:</strong> {entry.fabricQty2}</p>
                                    <p><strong>Marking:</strong> {entry.marking} MTR</p>
                                    <p><strong>Casement:</strong> {entry.casement} MTR</p>
                                    <p><strong>Niwar:</strong> {entry.niwar} MTR</p>
                                </div>
                            ) : (
                                 <div className="grid grid-cols-2 gap-2 text-sm">
                                    <p><strong>Room:</strong> {entry.roomName}</p>
                                    <p><strong>No. of Pannel:</strong> {entry.noOfPannel}</p>
                                    <p><strong>Height:</strong> {entry.height}</p>
                                    <p><strong>Width:</strong> {entry.width}</p>
                                </div>
                            )}
                             <p className="text-sm mt-2"><strong>Remarks:</strong> {entry.remark || 'N/A'}</p>
                        </div>
                    ))}
                </CardContent>
            </div>
             <CardFooter className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onBack}><StepBack className="mr-2 h-4 w-4"/> Back to Edit</Button>
                <Button onClick={onSubmit} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm & Save
                </Button>
            </CardFooter>
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
    const [view, setView] = React.useState<'form' | 'preview'>('form');

    const form = useForm<MeasurementFormValues>({
        resolver: zodResolver(measurementSchema),
        defaultValues: {
            typeOf: "Curtains",
            doerName: "",
            entries: [{}]
        }
    });
    
    const watchedFormValues = form.watch();

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
    
    const generateAndUploadPdf = async () => {
        const input = document.getElementById('measurement-preview-content');
        if (!input) {
            throw new Error("Preview content not found for PDF generation");
        }
    
        const canvas = await html2canvas(input, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
    
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'px',
            format: [canvas.width, canvas.height]
        });
    
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        const pdfBlob = await pdf.output('blob');
        
        const storage = getStorage();
        const pdfRef = ref(storage, `measurements/${dealId}/${visitId}.pdf`);
        await uploadBytes(pdfRef, pdfBlob);
        return await getDownloadURL(pdfRef);
    };

    const onSubmit = async () => {
        if (!user || !customerId || !dealId) {
            toast({ variant: 'destructive', title: 'Error', description: 'Missing critical information.' });
            setIsSubmitting(false);
            return;
        }
    
        setIsSubmitting(true);
    
        try {
            console.log("Starting PDF generation and upload...");
            const pdfUrl = await generateAndUploadPdf();
            console.log("PDF uploaded, URL:", pdfUrl);
            
            const processedEntries = await Promise.all(
                watchedFormValues.entries.map(async (entry) => {
                    const audioUrl = entry.recordAudio ? await handleFileUpload(entry.recordAudio) : undefined;
                    
                    let pictureUrls: string[] = [];
                    const pictures = entry.pictures;
                    if (pictures && pictures.length > 0) {
                        const filesToUpload = Array.isArray(pictures) ? pictures : Array.from(pictures as FileList);
                        pictureUrls = await Promise.all(filesToUpload.map(file => handleFileUpload(file)));
                    }
    
                    const cleanedEntry: Partial<MeasurementEntry> = { ...entry };
                    delete cleanedEntry.recordAudio;
                    delete cleanedEntry.pictures;
    
                    return { 
                        ...cleanedEntry, 
                        audioUrl, 
                        pictureUrls: pictureUrls.length > 0 ? pictureUrls : undefined, 
                    };
                })
            );
    
            const measurementData: Omit<DealMeasurement, 'id' | 'createdAt' | 'createdBy'> = {
                typeOf: watchedFormValues.typeOf,
                doerName: watchedFormValues.doerName,
                entries: processedEntries as MeasurementEntry[],
            };
            
            const result = await addMeasurementAction(customerId, dealId, visitId, measurementData as DealMeasurement, user.name, pdfUrl);
    
            if (result.success) {
                toast({ title: 'Success', description: 'Measurement saved successfully.' });
                router.push('/mobile');
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        } catch (error: any) {
            console.error("Error during submission process:", error);
            const errorMessage = error.code ? `Firebase Storage Error: ${error.code}. Ensure CORS is configured correctly.` : `An unexpected error occurred: ${error.message}`;
            toast({ 
                variant: 'destructive', 
                title: 'Submission Failed', 
                description: errorMessage,
                duration: 9000
            });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handlePreview = () => {
        form.trigger().then(isValid => {
            if (isValid) {
                setView('preview');
            } else {
                toast({ variant: 'destructive', title: 'Validation Error', description: 'Please fill in all required fields.' });
            }
        });
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
    
    if (!customer || !deal) {
        return <p>Error loading data.</p>
    }
    
    if (view === 'preview') {
        return <MeasurementPreview values={watchedFormValues} customer={customer} deal={deal} onBack={() => setView('form')} onSubmit={() => form.handleSubmit(onSubmit)()} loading={isSubmitting} />
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
                <form className="space-y-4">
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
                            <Button type="button" className="w-full" onClick={handlePreview}>
                                <Eye className="mr-2 h-4 w-4" />
                                Proceed to Preview
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
            </FormProvider>
        </div>
    );
}
