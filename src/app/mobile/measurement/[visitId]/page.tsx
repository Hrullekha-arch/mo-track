

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
import { Label } from '@/components/ui/label';
import { searchStockByBcn } from '@/app/dashboard/inventory/actions';
import { Combobox } from '@/components/ui/combobox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const foamSchema = z.object({
    foamSize: z.string().optional(),
    qty: z.string().optional(),
    density: z.string().optional(),
});

const simpleQtySchema = z.object({
    qty: z.string().optional(),
});

const blindEntrySchema = z.object({
    id: z.string(),
    bcn: z.string().optional(),
    control: z.enum(['Left', 'Right']).optional(),
    type: z.enum(['IBT', 'OBT']).optional(),
    width: z.string().optional(),
    height: z.string().optional(),
    area: z.string().optional(),
});

const measurementEntrySchema = z.object({
    id: z.string().optional(),
    status: z.enum(['complete', 'item-needed']).optional(),
    // Curtain/Wallpaper fields
    height: z.string().optional(),
    heightUnit: z.string().optional().default('inch'),
    width: z.string().optional(),
    widthUnit: z.string().optional().default('inch'),
    noOfPannel: z.string().optional(),
    // Sofa fields
    itemName: z.string().optional(),
    noOfSheet: z.string().optional(),
    fabricQty1: z.string().optional(),
    stitchingRate: z.string().optional(),
    foam: foamSchema.optional(),
    casement: simpleQtySchema.optional(),
    marking: simpleQtySchema.optional(),
    niwar: simpleQtySchema.optional(),
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
    blinds: z.array(blindEntrySchema).optional(),
});

const measurementSchema = z.object({
    typeOf: z.string().min(1, "Type is required"),
    doerName: z.string().min(1, "Doer name is required"),
    rooms: z.array(roomSchema)
});

export type MeasurementFormValues = z.infer<typeof measurementSchema>;

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
                        <Label htmlFor="foam-size">Foam size</Label>
                        <Input id="foam-size" {...register("foamSize")} />
                    </div>
                     <div>
                        <Label htmlFor="foam-qty">Qty</Label>
                        <Input id="foam-qty" {...register("qty")} />
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

const AddBlindsDialog = ({ isOpen, onClose, roomIndex }: { isOpen: boolean; onClose: () => void; roomIndex: number; }) => {
    const { control, getValues, setValue } = useFormContext<MeasurementFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: `rooms.${roomIndex}.blinds` });
    const { toast } = useToast();
    const [bcnOptions, setBcnOptions] = React.useState<any[]>([]);

    const handleSearch = async (query: string) => {
        if (query.length < 2) return;
        const results = await searchStockByBcn(query);
        setBcnOptions(results.map(r => ({ label: r.bcn, value: r.bcn })));
    };

    const calculateArea = (widthStr?: string, heightStr?: string) => {
        const width = parseFloat(widthStr || '0');
        const height = parseFloat(heightStr || '0');
        if (!isNaN(width) && !isNaN(height)) {
            return (width * height).toFixed(2);
        }
        return '0.00';
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Add Blinds for {getValues(`rooms.${roomIndex}.roomName`)}</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Sr No</TableHead>
                                <TableHead>BCN</TableHead>
                                <TableHead>Control</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>W</TableHead>
                                <TableHead>H</TableHead>
                                <TableHead>Area</TableHead>
                                <TableHead>Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fields.map((field, index) => {
                                const blind = getValues(`rooms.${roomIndex}.blinds`)?.[index];
                                const area = calculateArea(blind?.width, blind?.height);
                                return (
                                    <TableRow key={field.id}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>
                                            <FormField control={control} name={`rooms.${roomIndex}.blinds.${index}.bcn`} render={({ field }) => (
                                                <Combobox options={bcnOptions} value={field.value} onSelect={field.onChange} onSearch={handleSearch} placeholder="Search BCN..." />
                                            )} />
                                        </TableCell>
                                        <TableCell>
                                            <FormField control={control} name={`rooms.${roomIndex}.blinds.${index}.control`} render={({ field }) => (
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent><SelectItem value="Left">Left</SelectItem><SelectItem value="Right">Right</SelectItem></SelectContent>
                                                </Select>
                                            )} />
                                        </TableCell>
                                        <TableCell>
                                            <FormField control={control} name={`rooms.${roomIndex}.blinds.${index}.type`} render={({ field }) => (
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent><SelectItem value="IBT">IBT</SelectItem><SelectItem value="OBT">OBT</SelectItem></SelectContent>
                                                </Select>
                                            )} />
                                        </TableCell>
                                        <TableCell><FormField control={control} name={`rooms.${roomIndex}.blinds.${index}.width`} render={({ field }) => <Input {...field} placeholder="W" onChange={(e) => { field.onChange(e); setValue(`rooms.${roomIndex}.blinds.${index}.area`, calculateArea(e.target.value, getValues(`rooms.${roomIndex}.blinds.${index}.height`))) }} />} /></TableCell>
                                        <TableCell><FormField control={control} name={`rooms.${roomIndex}.blinds.${index}.height`} render={({ field }) => <Input {...field} placeholder="H" onChange={(e) => { field.onChange(e); setValue(`rooms.${roomIndex}.blinds.${index}.area`, calculateArea(getValues(`rooms.${roomIndex}.blinds.${index}.width`), e.target.value)) }} />} /></TableCell>
                                        <TableCell>{area}</TableCell>
                                        <TableCell><Button variant="destructive" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    <Button variant="outline" onClick={() => append({ id: new Date().toISOString() })}><PlusCircle className="mr-2 h-4 w-4"/>Add Blind</Button>
                </div>
                <DialogFooter>
                    <Button onClick={onClose}>Submit</Button>
                </DialogFooter>
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
                        name={`rooms.${roomIndex}.entries.${entryIndex}.itemName`}
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
                        name={`rooms.${roomIndex}.entries.${entryIndex}.noOfSheet`}
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
                        name={`rooms.${roomIndex}.entries.${entryIndex}.fabricQty1`}
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
                        name={`rooms.${roomIndex}.entries.${entryIndex}.stitchingRate`}
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
                        <FormLabel>Options</FormLabel>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setOpenDialog('foam')}>Foam</Button>
                                {entryData?.foam && <p className="text-xs text-muted-foreground mt-1">Size: {entryData.foam.foamSize}, Qty: {entryData.foam.qty}, Density: {entryData.foam.density}</p>}
                            </div>
                             <div>
                                <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setOpenDialog('casement')}>Casement</Button>
                                {entryData?.casement?.qty && <p className="text-xs text-muted-foreground mt-1">Qty: {entryData.casement.qty} MTR</p>}
                            </div>
                             <div>
                                <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setOpenDialog('marking')}>Marking</Button>
                                {entryData?.marking?.qty && <p className="text-xs text-muted-foreground mt-1">Qty: {entryData.marking.qty} MTR</p>}
                            </div>
                             <div>
                                <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setOpenDialog('niwar')}>Niwar</Button>
                                {entryData?.niwar?.qty && <p className="text-xs text-muted-foreground mt-1">Qty: {entryData.niwar.qty} MTR</p>}
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
                        
                    </div>
                )}
                 <FormField control={control} name={`rooms.${roomIndex}.entries.${entryIndex}.remark`} render={({ field }) => (<FormItem><FormLabel>Additional notes</FormLabel><FormControl><Textarea placeholder="Any other details..." {...field} value={field.value || ''} /></FormControl></FormItem>)} />
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
                onSave={(data) => setValue(`rooms.${roomIndex}.entries.${entryIndex}.marking`, data)}
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
    const { control, getValues, setValue } = useFormContext<MeasurementFormValues>();
    const { fields, append, remove: removeEntry } = useFieldArray({
        control,
        name: `rooms.${index}.entries`
    });
    const [isBlindDialogOpen, setIsBlindDialogOpen] = React.useState(false);

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
                 <div className="flex items-center space-x-2">
                    <Checkbox id={`add-blind-${index}`} onCheckedChange={(checked) => checked && setIsBlindDialogOpen(true)} />
                    <Label htmlFor={`add-blind-${index}`}>Add Blind</Label>
                </div>
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
            <AddBlindsDialog isOpen={isBlindDialogOpen} onClose={() => setIsBlindDialogOpen(false)} roomIndex={index} />
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
                                        <>
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                <div><p><strong>Item Name:</strong> {entry.itemName || 'N/A'}</p></div>
                                                <div><p><strong>No of Seat / Pcs:</strong> {entry.noOfSheet || 'N/A'}</p></div>
                                                <div><p><strong>Fabric Qty:</strong> {entry.fabricQty1 || 'N/A'}</p></div>
                                                <div><p><strong>Stitching Rate / per Sheet:</strong> {entry.stitchingRate || 'N/A'}</p></div>
                                                <div className="col-span-2"><p><strong>Remarks:</strong> {entry.remark || 'N/A'}</p></div>
                                            </div>
                                             {(entry.foam || entry.casement || entry.marking || entry.niwar) && (
                                                <div className="mt-2 pt-2 border-t">
                                                    <h5 className="font-semibold text-xs text-muted-foreground mb-1">OPTIONS</h5>
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                                        {entry.foam?.foamSize && <p><strong>Foam:</strong> {entry.foam.foamSize} / {entry.foam.qty} / {entry.foam.density}</p>}
                                                        {entry.casement?.qty && <p><strong>Casement:</strong> {entry.casement.qty} MTR</p>}
                                                        {entry.marking?.qty && <p><strong>Marking:</strong> {entry.marking.qty} MTR</p>}
                                                        {entry.niwar?.qty && <p><strong>Niwar:</strong> {entry.niwar.qty} MTR</p>}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="space-y-1 text-sm">
                                            <p><strong>Dimension:</strong> H {entry.height} {entry.heightUnit} x W {entry.width} {entry.widthUnit}</p>
                                            <p><strong>Panels:</strong> {entry.noOfPannel || 'N/A'}</p>
                                             <p><strong>Remarks:</strong> {entry.remark || 'N/A'}</p>
                                        </div>
                                    )}

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

const MEASUREMENT_TYPES = [
    "Curtains",
    "Sofa Measurement",
    "Blinds",
    "Flooring",
    "Wallpaper",
    "Mattress",
    "Paneling",
    "Other"
];

const DOER_OPTIONS = ["Anil", "Sunil", "Raj", "Amit"];


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
            rooms: [{ roomName: "", entries: [{ id: new Date().toISOString(), status: 'item-needed' }], blinds: [] }]
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
                                status: 'item-needed', // Always set to item-needed on creation by installer
                            };
                        })
                    );
                    return { ...room, entries: processedEntries };
                })
            );

            const measurementDataForDb = { ...values, rooms: processedRooms };
            
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
                            <Button type="button" variant="outline" onClick={() => append({ id: new Date().toISOString(), roomName: '', entries: [{ id: new Date().toISOString() }], blinds: [] })} className="w-full">
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
