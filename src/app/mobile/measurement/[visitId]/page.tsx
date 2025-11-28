

"use client";

import * as React from 'react';
import { useForm, useFieldArray, FormProvider, useFormContext, useWatch, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/context/AuthContext';
import { Customer, Deal, DealMeasurement, User, MeasurementEntry } from '@/lib/types';
import { getCustomerById } from '@/app/dashboard/customers/actions';
import { getDealById, addMeasurementAction, uploadFileToDriveAction } from '@/app/dashboard/customers/[customerId]/[dealId]/actions';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ArrowLeft, PlusCircle, Trash2, Eye, StepBack } from "lucide-react";
import Image from 'next/image';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const foamSchema = z.object({
    name: z.string().optional(),
    make: z.string().optional(),
    density: z.string().optional(),
});

const simpleQtySchema = z.object({
    qty: z.string().optional(),
});

const measurementEntrySchema = z.object({
    id: z.string().optional(),
    // Curtain/Wallpaper fields
    height: z.string().optional(),
    heightUnit: z.string().optional().default('inch'),
    width: z.string().optional(),
    widthUnit: z.string().optional().default('inch'),
    noOfPannel: z.string().optional(),
    // Sofa fields
    noOfSheet: z.string().optional(),
    fabricQty1: z.string().optional(),
    fabricQty2: z.string().optional(),
    marking: z.string().optional(),
    casement: simpleQtySchema.optional(),
    niwar: simpleQtySchema.optional(),
    foam: foamSchema.optional(),
    markingFlag: simpleQtySchema.optional(),
    // Common fields
    remark: z.string().optional(),
    pictures: z.any().optional(),
    pictureUrls: z.array(z.string()).optional(),
    recordAudio: z.any().optional(),
    audioUrl: z.string().optional(),
});


const roomSchema = z.object({
    id: z.string().optional(),
    roomName: z.string().min(1, "Room name is required."),
    entries: z.array(measurementEntrySchema),
});

const measurementSchema = z.object({
    typeOf: z.string().min(1, "Type is required"),
    doerName: z.string().min(1, "Doer name is required"),
    rooms: z.array(roomSchema)
});

export type MeasurementFormValues = z.infer<typeof measurementSchema>;

const MEASUREMENT_TYPES = ["Curtains", "Wallpaper", "Wall to Wall", "Sofa Measurement"];
const DOER_OPTIONS = ["TU", "OP", "NC", "VN", "MU"];

// Reusable Dialog for simple quantity input
const SimpleQtyDialog = ({
    isOpen,
    onClose,
    onSave,
    title,
}: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: { qty: string }) => void;
    title: string;
}) => {
    const [qty, setQty] = React.useState('');

    const handleSave = () => {
        onSave({ qty });
        onClose();
        setQty('');
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="qty-input">Quantity (MTR)</Label>
                    <Input id="qty-input" value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// Dialog for Foam details
const FoamDialog = ({
    isOpen,
    onClose,
    onSave,
}: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: z.infer<typeof foamSchema>) => void;
}) => {
    const { register, handleSubmit, reset } = useForm<z.infer<typeof foamSchema>>();

    const handleSave = (data: z.infer<typeof foamSchema>) => {
        onSave(data);
        reset();
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Foam Details</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(handleSave)} className="py-4 space-y-4">
                    <div>
                        <Label htmlFor="foam-name">Name</Label>
                        <Input id="foam-name" {...register("name")} />
                    </div>
                    <div>
                        <Label htmlFor="foam-make">Make</Label>
                        <Input id="foam-make" {...register("make")} />
                    </div>
                    <div>
                        <Label htmlFor="foam-density">Density</Label>
                        <Input id="foam-density" {...register("density")} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button type="submit">Save</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};


const MeasurementEntryCard = ({ roomIndex, entryIndex, remove }: { roomIndex: number; entryIndex: number; remove: (index: number) => void }) => {
    const { control, setValue, getValues } = useFormContext<MeasurementFormValues>();
    const typeOf = useWatch({ control, name: "typeOf" });
    const { toast } = useToast();
    
    const [imagePreviews, setImagePreviews] = React.useState<string[]>([]);
    const pictures = useWatch({ control, name: `rooms.${roomIndex}.entries.${entryIndex}.pictures` });
    
    const [openDialog, setOpenDialog] = React.useState<'foam' | 'casement' | 'marking' | 'niwar' | null>(null);

    const entryData = useWatch({ control, name: `rooms.${roomIndex}.entries.${entryIndex}`});


    const handlePictureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = event.target.files;
        if (newFiles) {
            const currentFiles = (getValues(`rooms.${roomIndex}.entries.${entryIndex}.pictures`) || []) as File[];
            const combinedFiles = [...currentFiles, ...Array.from(newFiles)];
            
            if (combinedFiles.length > 5) {
                toast({
                    variant: 'destructive',
                    title: 'Upload Limit Exceeded',
                    description: 'You can only upload a maximum of 5 images per entry.',
                });
                return;
            }
            
            setValue(`rooms.${roomIndex}.entries.${entryIndex}.pictures`, combinedFiles, { shouldValidate: true });
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
        const currentFiles = (getValues(`rooms.${roomIndex}.entries.${entryIndex}.pictures`) || []) as File[];
        const updatedFiles = currentFiles.filter((_, i) => i !== imageIndex);
        setValue(`rooms.${roomIndex}.entries.${entryIndex}.pictures`, updatedFiles, { shouldValidate: true });
    }

    const isSofaMeasurement = typeOf === "Sofa Measurement";

    return (
        <Card className="relative bg-background/50 overflow-hidden p-4">
             <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => remove(entryIndex)}><Trash2 className="h-4 w-4"/></Button>
            <div className="space-y-3">
            {isSofaMeasurement ? (
                <div className="space-y-4">
                    <FormField
                        control={control}
                        name={`rooms.${roomIndex}.entries.${entryIndex}.noOfSheet`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Item Name</FormLabel>
                                <FormControl>
                                    <Input {...field} placeholder="e.g. 3 Seater Sofa" />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={control}
                        name={`rooms.${roomIndex}.entries.${entryIndex}.fabricQty1`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>No Of Seat / Pcs</FormLabel>
                                <FormControl>
                                    <Input {...field} placeholder="e.g. 3" />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={control}
                        name={`rooms.${roomIndex}.entries.${entryIndex}.fabricQty2`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Fabric Qty</FormLabel>
                                <FormControl>
                                    <Input {...field} placeholder="e.g. 4.5 Mtr" />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={control}
                        name={`rooms.${roomIndex}.entries.${entryIndex}.marking`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Stitching Rate / per Sheet</FormLabel>
                                <FormControl>
                                    <Input {...field} placeholder="e.g. ₹200" />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    <div className="space-y-2">
                        <FormLabel className="font-semibold">Options</FormLabel>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setOpenDialog('foam')}>Foam</Button>
                                {entryData?.foam && <p className="text-xs text-muted-foreground mt-1">Name: {entryData.foam.name}, Make: {entryData.foam.make}, Density: {entryData.foam.density}</p>}
                            </div>
                             <div>
                                <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setOpenDialog('casement')}>Casement</Button>
                                {entryData?.casement?.qty && <p className="text-xs text-muted-foreground mt-1">Qty: {entryData.casement.qty} Mtr</p>}
                            </div>
                             <div>
                                <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setOpenDialog('marking')}>Marking</Button>
                                {entryData?.markingFlag?.qty && <p className="text-xs text-muted-foreground mt-1">Qty: {entryData.markingFlag.qty} Mtr</p>}
                            </div>
                             <div>
                                <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setOpenDialog('niwar')}>Niwar</Button>
                                {entryData?.niwar?.qty && <p className="text-xs text-muted-foreground mt-1">Qty: {entryData.niwar.qty} Mtr</p>}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                    <div className="space-y-3">
                        <div className="space-y-2 rounded-lg bg-background/50 p-3 border">
                           <div className="flex items-end gap-2">
                                <FormField control={control} name={`rooms.${roomIndex}.entries.${entryIndex}.height`} render={({ field }) => ( <FormItem className="flex-grow"><FormLabel className="text-xs">Height</FormLabel><FormControl><Input {...field} /></FormControl></FormItem> )} />
                                <FormField control={control} name={`rooms.${roomIndex}.entries.${entryIndex}.heightUnit`} render={({ field }) => ( <FormItem><Select value={field.value ?? "inch"} onValueChange={field.onChange}><FormControl><SelectTrigger className="w-[80px] h-10"><SelectValue placeholder="Inch" /></SelectTrigger></FormControl><SelectContent><SelectItem value="inch">Inch</SelectItem><SelectItem value="mm">MM</SelectItem></SelectContent></Select></FormItem> )} />
                           </div>
                           <div className="flex items-end gap-2">
                                <FormField control={control} name={`rooms.${roomIndex}.entries.${entryIndex}.width`} render={({ field }) => ( <FormItem className="flex-grow"><FormLabel className="text-xs">Width</FormLabel><FormControl><Input {...field} /></FormControl></FormItem> )} />
                                <FormField control={control} name={`rooms.${roomIndex}.entries.${entryIndex}.widthUnit`} render={({ field }) => ( <FormItem><Select value={field.value ?? "inch"} onValueChange={field.onChange}><FormControl><SelectTrigger className="w-[80px] h-10"><SelectValue placeholder="Inch" /></SelectTrigger></FormControl><SelectContent><SelectItem value="inch">Inch</SelectItem><SelectItem value="mm">MM</SelectItem></SelectContent></Select></FormItem> )} />
                           </div>
                        </div>
                        <FormField control={control} name={`rooms.${roomIndex}.entries.${entryIndex}.noOfPannel`} render={({ field }) => (<FormItem><FormLabel>No Of Pannel</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                        <FormField control={control} name={`rooms.${roomIndex}.entries.${entryIndex}.remark`} render={({ field }) => (<FormItem><FormLabel>Remark</FormLabel><FormControl><Textarea {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                    </div>
                )}
                
                <FormItem>
                    <FormLabel>Choose Picture(s)</FormLabel>
                    <div className="flex items-center gap-2">
                        <div className="flex flex-wrap gap-2 mt-2 flex-grow">
                            {imagePreviews.map((src, i) => (
                                <div key={i} className="relative">
                                    <Image src={src} alt={`Preview ${i+1}`} width={60} height={60} className="rounded-md object-cover h-16 w-16" />
                                    <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={() => handlePictureRemove(i)}>
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                         <label htmlFor={`picture-upload-${roomIndex}-${entryIndex}`} className="cursor-pointer border-2 border-dashed rounded-md h-16 w-16 flex items-center justify-center text-muted-foreground hover:bg-accent">
                            <PlusCircle className="h-6 w-6" />
                        </label>
                        <FormControl>
                            <Input id={`picture-upload-${roomIndex}-${entryIndex}`} type="file" accept="image/*" multiple onChange={handlePictureChange} className="hidden" />
                        </FormControl>
                    </div>
                </FormItem>
                <FormField control={control} name={`rooms.${roomIndex}.entries.${entryIndex}.recordAudio`} render={({ field }) => (<FormItem><FormLabel>Record Audio</FormLabel><FormControl><Input type="file" accept="audio/*" onChange={(e) => field.onChange(e.target.files?.[0])} /></FormControl></FormItem>)} />
             </div>
             
            <FoamDialog
                isOpen={openDialog === 'foam'}
                onClose={() => setOpenDialog(null)}
                onSave={(data) => setValue(`rooms.${roomIndex}.entries.${entryIndex}.foam`, data)}
            />
            <SimpleQtyDialog
                isOpen={openDialog === 'casement'}
                onClose={() => setOpenDialog(null)}
                onSave={(data) => setValue(`rooms.${roomIndex}.entries.${entryIndex}.casement`, data)}
                title="Enter Casement Quantity"
            />
            <SimpleQtyDialog
                isOpen={openDialog === 'marking'}
                onClose={() => setOpenDialog(null)}
                onSave={(data) => setValue(`rooms.${roomIndex}.entries.${entryIndex}.markingFlag`, data)}
                title="Enter Marking Quantity"
            />
            <SimpleQtyDialog
                isOpen={openDialog === 'niwar'}
                onClose={() => setOpenDialog(null)}
                onSave={(data) => setValue(`rooms.${roomIndex}.entries.${entryIndex}.niwar`, data)}
                title="Enter Niwar Quantity"
            />
        </Card>
    );
}


const RoomEntryCard = ({ index, remove }: { index: number, remove: (index: number) => void }) => {
    const { control } = useFormContext<MeasurementFormValues>();
    const { fields, append, remove: removeEntry } = useFieldArray({
        control,
        name: `rooms.${index}.entries`
    });

    const roomName = useWatch({
        control,
        name: `rooms.${index}.roomName`
    })

    return (
        <Card className="relative bg-muted/50 overflow-hidden">
            <CardHeader className="flex-row items-center justify-between">
                <FormField
                    control={control}
                    name={`rooms.${index}.roomName`}
                    render={({ field }) => (
                        <FormItem className="w-2/3">
                            <FormLabel>Room Name</FormLabel>
                            <FormControl>
                                <Input {...field} value={field.value || ''} placeholder="e.g. Master Bedroom" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                 <Button type="button" variant="destructive" size="sm" onClick={() => remove(index)}>
                    <Trash2 className="mr-2 h-4 w-4"/> Remove Room
                </Button>
            </CardHeader>
            <CardContent className="space-y-3">
                {fields.map((field, entryIndex) => (
                    <MeasurementEntryCard 
                        key={field.id}
                        roomIndex={index}
                        entryIndex={entryIndex}
                        remove={() => removeEntry(entryIndex)}
                    />
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => append({ id: new Date().toISOString() })}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add New Entry
                </Button>
            </CardContent>
        </Card>
    );
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
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                        <p><strong>Customer:</strong> {customer.name}</p>
                        <p><strong>Deal ID:</strong> {deal.dealId}</p>
                        <p><strong>Measurement Type:</strong> {values.typeOf}</p>
                        <p><strong>Doer Name:</strong> {values.doerName}</p>
                    </div>

                    {values.rooms.map((room, roomIndex) => (
                       <div key={room.id || roomIndex} className="border-t pt-4">
                           <h3 className="font-bold text-lg mb-2">{room.roomName}</h3>
                            {room.entries.map((entry, entryIndex) => (
                                <div key={entry.id || entryIndex} className="border-b last:border-b-0 py-2 space-y-2">
                                    <h4 className="font-semibold">Entry #{entryIndex + 1}</h4>
                                    {values.typeOf === 'Sofa Measurement' ? (
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <p><strong>Item Name:</strong> {entry.noOfSheet || 'N/A'}</p>
                                            <p><strong>No of Seat / Pcs:</strong> {entry.fabricQty1 || 'N/A'}</p>
                                            <p><strong>Fabric Qty:</strong> {entry.fabricQty2 || 'N/A'}</p>
                                            <p><strong>Stitching Rate / per Sheet:</strong> {entry.marking || 'N/A'}</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-1 text-sm">
                                            <p><strong>Dimension:</strong> H {entry.height} {entry.heightUnit} x W {entry.width} {entry.widthUnit}</p>
                                            <p><strong>Panels:</strong> {entry.noOfPannel || 'N/A'}</p>
                                        </div>
                                    )}
                                    <p className="text-sm mt-2"><strong>Remarks:</strong> {entry.remark || 'N/A'}</p>

                                    {entry.pictures && Array.from(entry.pictures as File[]).length > 0 && (
                                        <div className="mt-2">
                                            <p className="text-sm font-semibold">Attached Images:</p>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {Array.from(entry.pictures as File[]).map((file, i) => (
                                                    <Image 
                                                        key={i}
                                                        src={URL.createObjectURL(file)} 
                                                        alt={`Entry ${entryIndex+1} Image ${i+1}`} 
                                                        width={100} 
                                                        height={100} 
                                                        className="rounded-md object-cover"
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                       </div>
                    ))}
                </CardContent>
            </div>
             <CardFooter className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onBack} disabled={loading}>
                    <StepBack className="mr-2 h-4 w-4"/> Back to Edit
                </Button>
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
            rooms: [{ roomName: "", entries: [{ id: new Date().toISOString() }] }]
        }
    });
    
    const watchedFormValues = form.watch();

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "rooms"
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
    
    const fileToB64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = error => reject(error);
        });
    }

    const handleFileUpload = async (file: File): Promise<string> => {
        const b64Data = await fileToB64(file);
        return await uploadFileToDriveAction(file.name, file.type, b64Data);
    };
    
    const generateAndUploadPdf = async (): Promise<string> => {
        const input = document.getElementById('measurement-preview-content');
        if (!input) {
            throw new Error("Preview content not found for PDF generation");
        }

        const canvas = await html2canvas(input, {
            scale: 2,
            useCORS: true,
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF("p", "mm", "a4");

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);

        const imgWidth = canvas.width * ratio;
        const imgHeight = canvas.height * ratio;

        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);

        const pdfBlob = pdf.output('blob');
        const pdfFile = new File([pdfBlob], `${visitId}.pdf`, { type: 'application/pdf' });

        return await handleFileUpload(pdfFile);
    };

    const onSubmit = async (values: MeasurementFormValues) => {
        if (!user || !customerId || !dealId) {
            toast({ variant: 'destructive', title: 'Error', description: 'Missing critical information.' });
            setIsSubmitting(false);
            return;
        }
    
        setIsSubmitting(true);
    
        try {
            const pdfUrl = await generateAndUploadPdf();
            
            const processedRooms = await Promise.all(
                values.rooms.map(async (room) => {
                    const processedEntries = await Promise.all(
                        room.entries.map(async (entry) => {
                             const audioUrl = entry.recordAudio ? await handleFileUpload(entry.recordAudio) : undefined;
                    
                            let pictureUrls: string[] = [];
                            const pictures = entry.pictures;
                            if (pictures && pictures.length > 0) {
                                const filesToUpload = Array.from(pictures as File[]);
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
                    return { ...room, entries: processedEntries };
                })
            );

            const measurementDataForDb = { ...values, rooms: processedRooms };
            
            // This needs to be adapted as addMeasurementAction expects a different structure
            const simplifiedEntries = processedRooms.flatMap(room => room.entries.map(entry => ({ ...entry, roomName: room.roomName })));

            const measurementData: Omit<DealMeasurement, 'id' | 'createdAt' | 'createdBy' | 'pdfUrl'> = {
                typeOf: values.typeOf,
                doerName: values.doerName,
                entries: simplifiedEntries as MeasurementEntry[],
            };
            
            const result = await addMeasurementAction(customerId, dealId, visitId, measurementData as any, user.name, pdfUrl);
    
            if (result.success) {
                toast({ title: 'Success', description: 'Measurement saved successfully.' });
                router.push('/mobile');
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        } catch (error: any) {
            console.error("Error submitting measurement:", error);
            toast({ 
                variant: 'destructive', 
                title: 'Submission Failed', 
                description: `An unexpected error occurred: ${error.message}`,
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
                               <RoomEntryCard key={field.id} index={index} remove={remove} />
                            ))}
                            <Button type="button" variant="outline" onClick={() => append({ id: new Date().toISOString(), roomName: '', entries: [{ id: new Date().toISOString() }] })} className="w-full">
                                <PlusCircle className="mr-2 h-4 w-4"/>Add new Room
                            </Button>
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
