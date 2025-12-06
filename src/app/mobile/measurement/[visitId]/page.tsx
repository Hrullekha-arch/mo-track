

"use client";

import * as React from 'react';
import { useForm, useFieldArray, FormProvider, useFormContext, useWatch, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast, useToast } from "@/hooks/use-toast";
import { useAuth } from '@/context/AuthContext';
import { Customer, Deal, DealMeasurement, User, MeasurementEntry } from '@/lib/types';
import { getCustomerById } from '@/app/dashboard/customers/actions';
import { getDealById, addMeasurementAction, uploadFileToDriveAction, getVisitsForDeal, getSelectionsForDeal, getSelectionById, updateBlindsAction, updateItemsAction, updateSofasAction } from '@/app/dashboard/customers/[customerId]/[dealId]/actions';

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
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { processMeasurementSubmission } from '@/services/measurement-selection-middleware';
import { register } from 'module';



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

const MeasurementEntryCard = ({ roomIndex, entryIndex, remove }: { roomIndex: number; entryIndex: number; remove: (index: number) => void }) => {
    const { control, setValue, getValues } = useFormContext<MeasurementFormValues>();
    const typeOf = useWatch({ control, name: "typeOf" });
    const { toast } = useToast();
        // For blind editing
    const [showBlindEdit, setShowBlindEdit] = React.useState(false);
    const [editBlind, setEditBlind] = React.useState<any>(null);
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


const RoomEntryCard = ({
  index,
  remove,
  customerId,
  dealId,
  selectionId
}: {
  index: number;
  remove: (index: number) => void;
  customerId: string;
  dealId: string;
  selectionId: string;
}) => {

  const { control, getValues, setValue, register, watch } = useFormContext<MeasurementFormValues>();

  // ==========================
  // STATES
  // ==========================
  const [addBlindMode, setAddBlindMode] = React.useState(false);

  const [newBlind, setNewBlind] = React.useState({
    blindType: "",
    control: "",
    width: "",
    height: ""
  });

  const [openDialog, setOpenDialog] = React.useState<
    "foam" | "casement" | "marking" | "niwar" | null
  >(null);

  const [selectedEntryIndex, setSelectedEntryIndex] =
    React.useState<number | null>(null);

  const [extraPopup, setExtraPopup] = React.useState({
    open: false,
    roomIndex: -1,
    entryIndex: -1,
    isSofa: false
  });

  // NEW: Item Type Selection Dialog
  const [itemTypeDialog, setItemTypeDialog] = React.useState(false);

  // ==========================
  // FIELD ARRAYS
  // ==========================
  const { fields: fieldsEntries, append: appendEntry, remove: removeEntry } = useFieldArray({
    control,
    name: `rooms.${index}.entries`,
    keyName: "fieldId"
  });

  const { fields: fieldsBlinds, append: appendBlind, remove: removeBlind } =
    useFieldArray({
      control,
      name: `rooms.${index}.blinds`,
      keyName: "fieldId"
    });

  // NEW: Sofa Field Array
  const { fields: fieldsSofas, append: appendSofa, remove: removeSofa } =
    useFieldArray({
      control,
      name: `rooms.${index}.sofas`,
      keyName: "fieldId"
    });

  const roomName = watch(`rooms.${index}.roomName`) || "";

  // ==========================
  // UPDATE BLINDS IN DATABASE
  // ==========================
  const handleUpdateBlinds = async () => {
    const blinds = getValues(`rooms.${index}.blinds`);

    const res = await updateBlindsAction({
      customerId,
      dealId,
      selectionId,
      roomName,
      blinds
    });

    if (res.success) {
      toast({ title: "Blinds Updated", description: "Saved successfully!" });
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error });
    }
  };
  
  //==========================
  // Random UID
  //==========================
  function makeId() {
        return (
            Date.now().toString(36) +
            Math.random().toString(36).substring(2, 9)
        );
    }

  // ==========================
  // UPDATE ITEMS IN DATABASE
  // ==========================
  const handleUpdateItems = async () => {
    let items = getValues(`rooms.${index}.entries`);

    // 🔥 FIX: Only normalize obvious temporary IDs (timestamp or ISO strings); keep UUIDs / Firestore IDs
    items = items.map(item => {
      let id = item.id || null;

      if (id) {
        // Remove IDs that look like raw timestamps (13 digits) or long timestamp-prefixed strings
        const isTimestampId = /^\d{13}$/.test(id) || /^\d{13}/.test(id);

        // Remove ISO date string IDs (e.g., "2024-01-15T12:30:00.000Z")
        const isISODateId = /\d{4}-\d{2}-\d{2}T/.test(id);

        if (isTimestampId || isISODateId) {
          id = null;
        }
      }

      return { ...item, id };
    });

    console.log("🔥 CLEAN ITEMS BEING SENT:", items);

    const res = await updateItemsAction({
    customerId,
    dealId,
    selectionId,
    roomName,
    items,
  });

    if (res.success) {
      toast({ title: "Items Updated", description: "Saved successfully!" });

      // 🎯 CRITICAL: Update form with returned IDs from backend
      if (res.items && Array.isArray(res.items)) {
        setValue(`rooms.${index}.entries`, res.items);
      }
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error });
    }
  };


  // ==========================
  // UPDATE SOFAS IN DATABASE
  // ==========================
  const handleUpdateSofas = async () => {
    const sofas = getValues(`rooms.${index}.sofas`);

    const res = await updateSofasAction({
      customerId,
      dealId,
      selectionId,
      roomName,
      sofas
    });

    if (res.success) {
      toast({ title: "Sofas Updated", description: "Saved successfully!" });
    } else {
      toast({ variant: "destructive", title: "Error", description: res.error });
    }
  };

  // ==========================
  // HANDLE ITEM TYPE SELECTION
  // ==========================
  const handleAddItemType = (type: string) => {
    if (type === "Sofa") {
      appendSofa({
        id: makeId(),
        itemName: "",
        noOfSeat: "",
        fabricQty: "",
        stitchingRate: "",
        foam: null,
        casement: null,
        marking: null
      });
    } else {
      // For Curtain, Wall to Wall, Wallpaper
      appendEntry({
        id: null,   // ⚠️ NEW ITEMS HAVE NO ID
        isNew: true, // keep track
        itemType: type,
        itemName: "",
        noOfPannel: "",
        height: "",
        width: "",
        remark: "",
        casement: null,
        marking: null,
        niwar: null
      });
    }
    setItemTypeDialog(false);
  };

  return (
    <Card className="relative bg-muted/50 overflow-hidden">

      {/* ROOM HEADER */}
      <CardHeader className="flex-row items-center justify-between">
        <FormField
          control={control}
          name={`rooms.${index}.roomName`}
          render={({ field }) => (
            <FormItem className="w-2/3">
              <FormLabel>Room Name</FormLabel>
              <FormControl>
                <Input {...field} value={field.value || ""} placeholder="e.g. Living Room" />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="button" size="sm" variant="destructive" onClick={() => remove(index)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">

        {/* =====================
            BLINDS SECTION
        ===================== */}
        <div className="space-y-3 border rounded-lg p-3 bg-white/50">

          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-sm">Blinds</h3>

            <Button type="button" onClick={() => setAddBlindMode(true)}>+ Add Blind</Button>
          </div>

          {/* EXISTING BLINDS TABLE */}
          {fieldsBlinds.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Blind</TableHead>
                  <TableHead>Control</TableHead>
                  <TableHead>W</TableHead>
                  <TableHead>H</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {fieldsBlinds.map((blind, bIndex) => (
                  <TableRow key={blind.fieldId ?? blind.id ?? bIndex}>
                    <TableCell>
                      <Input {...register(`rooms.${index}.blinds.${bIndex}.blindType`)} />
                    </TableCell>

                    <TableCell>
                      <Select
                        value={watch(`rooms.${index}.blinds.${bIndex}.control`)}
                        onValueChange={(val) =>
                          setValue(`rooms.${index}.blinds.${bIndex}.control`, val)
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Left">Left</SelectItem>
                          <SelectItem value="Right">Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>

                    <TableCell>
                      <Input {...register(`rooms.${index}.blinds.${bIndex}.width`)} />
                    </TableCell>

                    <TableCell>
                      <Input {...register(`rooms.${index}.blinds.${bIndex}.height`)} />
                    </TableCell>

                    <TableCell className="text-center">
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        onClick={() => removeBlind(bIndex)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>

              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5}>
                    <Button type="button" className="bg-blue-600 text-white" onClick={handleUpdateBlinds}>
                      Update Blinds
                    </Button>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}

          {/* ADD BLIND INLINE FORM */}
          {addBlindMode && (
            <div className="grid grid-cols-2 gap-3 mt-2 p-3 border rounded-lg bg-muted/40">
              <Input
                placeholder="Blind Name"
                value={newBlind.blindType}
                onChange={(e) =>
                  setNewBlind({ ...newBlind, blindType: e.target.value })
                }
              />

              <Select
                onValueChange={(val) => setNewBlind({ ...newBlind, control: val })}
              >
                <SelectTrigger><SelectValue placeholder="Control" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Left">Left</SelectItem>
                  <SelectItem value="Right">Right</SelectItem>
                </SelectContent>
              </Select>

              <Input
                placeholder="Width"
                value={newBlind.width}
                onChange={(e) => setNewBlind({ ...newBlind, width: e.target.value })}
              />

              <Input
                placeholder="Height"
                value={newBlind.height}
                onChange={(e) => setNewBlind({ ...newBlind, height: e.target.value })}
              />

              <div className="col-span-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setAddBlindMode(false)}>
                  Cancel
                </Button>

                <Button
                    type="button"
                    onClick={() => {
                        appendBlind({
                        id: makeId(),
                        blindType: newBlind.blindType,
                        control: newBlind.control,
                        width: newBlind.width,
                        height: newBlind.height
                        });

                        setNewBlind({ blindType: "", control: "", width: "", height: "" });
                        setAddBlindMode(false);
                    }}
                    >
                    Save Blind
                </Button>

              </div>
            </div>
          )}
        </div>

        {/* =====================
            SOFA SECTION (NEW)
        ===================== */}
        {/* SOFA EXTRAS SUMMARY */}
{fieldsSofas.some((_sofa, idx) => {
  const foam = watch(`rooms.${index}.sofas.${idx}.foam`);
  const casement = watch(`rooms.${index}.sofas.${idx}.casement`);
  const marking = watch(`rooms.${index}.sofas.${idx}.marking`);
  return foam || casement || marking;
}) && (
  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
    <h4 className="font-semibold text-sm mb-2">Extras Summary (Sofas)</h4>

    <div className="space-y-1 text-sm">
      {fieldsSofas.map((sofa, idx) => {
        const itemName =
          watch(`rooms.${index}.sofas.${idx}.itemName`) || `Sofa ${idx + 1}`;

        const foam = watch(`rooms.${index}.sofas.${idx}.foam`);
        const casement = watch(`rooms.${index}.sofas.${idx}.casement`);
        const marking = watch(`rooms.${index}.sofas.${idx}.marking`);

        const hasExtras = foam || casement || marking;
        if (!hasExtras) return null;

        return (
          <div key={sofa.fieldId ?? sofa.id ?? idx} className="flex gap-2 items-center flex-wrap">
            <span className="font-medium">{itemName}:</span>

            {foam && (
              <span className="text-xs bg-white px-2 py-1 rounded border">
                Foam: {foam.qty} Foam Size : {foam.foamsize} Density : {foam.density}
              </span>
            )}

            {casement && (
              <span className="text-xs bg-white px-2 py-1 rounded border">
                Casement: {casement.qty}
              </span>
            )}

            {marking && (
              <span className="text-xs bg-white px-2 py-1 rounded border">
                Marking: {marking.qty}
              </span>
            )}
          </div>
        );
      })}
    </div>
  </div>
)}

        {fieldsSofas.length > 0 && (
          <div className="space-y-3 border rounded-lg p-3 bg-white/50">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-sm">Sofas</h3>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  <TableHead>No of Seat</TableHead>
                  <TableHead>Fabric Qty</TableHead>
                  <TableHead>Stitching Rate/Seat</TableHead>
                  <TableHead>Extras</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {fieldsSofas.map((sofa, sofaIndex) => {
                  const foam = watch(`rooms.${index}.sofas.${sofaIndex}.foam`);
                  const casement = watch(`rooms.${index}.sofas.${sofaIndex}.casement`);
                  const marking = watch(`rooms.${index}.sofas.${sofaIndex}.marking`);
                  const hasExtras = foam || casement || marking;

                  return (
                    <TableRow key={sofa.fieldId ?? sofa.id ?? sofaIndex}>
                      <TableCell>
                        <Input
                          {...register(`rooms.${index}.sofas.${sofaIndex}.itemName`)}
                          placeholder="Item Name"
                          className="w-32"
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          {...register(`rooms.${index}.sofas.${sofaIndex}.noOfSeat`)}
                          placeholder="Seats"
                          className="w-20"
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          {...register(`rooms.${index}.sofas.${sofaIndex}.fabricQty`)}
                          placeholder="Qty"
                          className="w-20"
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          {...register(`rooms.${index}.sofas.${sofaIndex}.stitchingRate`)}
                          placeholder="Rate"
                          className="w-20"
                        />
                      </TableCell>

                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant={hasExtras ? "default" : "outline"}
                          onClick={() => {
                            setSelectedEntryIndex(sofaIndex);
                            setExtraPopup({
                              roomIndex: index,
                              entryIndex: sofaIndex,
                              open: true,
                              isSofa: true
                            });
                          }}
                        >
                          {hasExtras ? "Edit" : "Add"}
                        </Button>
                      </TableCell>

                      <TableCell className="text-center">
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          onClick={() => removeSofa(sofaIndex)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <Button type="button" className="bg-blue-600 text-white mt-3" onClick={handleUpdateSofas}>
              Update Sofas
            </Button>
          </div>
        )}

        {/* =====================
            ITEMS SECTION (CURTAIN, WALL TO WALL, WALLPAPER)
        ===================== */}
        <div className="space-y-3 border rounded-lg p-3 bg-white/50">

          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-sm">Items</h3>

            <Button
              type="button"
              onClick={() => setItemTypeDialog(true)}
            >
              + Add Item
            </Button>
          </div>

          {/* EXTRAS SUMMARY */}
          {fieldsEntries.some((_entry, idx) => {
            const casement = watch(`rooms.${index}.entries.${idx}.casement`);
            const marking = watch(`rooms.${index}.entries.${idx}.marking`);
            const niwar = watch(`rooms.${index}.entries.${idx}.niwar`);
            return casement || marking || niwar;
            //////// For Sofa////////////
            
          }) && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <h4 className="font-semibold text-sm mb-2">Extras Summary</h4>
              <div className="space-y-1 text-sm">
                {fieldsEntries.map((entry, idx) => {
                  const itemName = watch(`rooms.${index}.entries.${idx}.itemName`) || `Item ${idx + 1}`;
                  const casement = watch(`rooms.${index}.entries.${idx}.casement`);
                  const marking = watch(`rooms.${index}.entries.${idx}.marking`);
                  const niwar = watch(`rooms.${index}.entries.${idx}.niwar`);
                  const width = watch(`rooms.${index}.entries.${idx}.width`);
                  
                  const hasExtras = casement || marking || niwar;
                  
                  if (!hasExtras) return null;
                  
                  return (
                    <div key={entry.fieldId ?? entry.id ?? idx} className="flex gap-2 items-center flex-wrap">
                      <span className="font-medium">{itemName}:</span>
                      {casement && <span className="text-xs bg-white px-2 py-1 rounded border">Casement: {casement.qty}</span>}
                      {marking && <span className="text-xs bg-white px-2 py-1 rounded border">Marking: {marking.qty}</span>}
                      {niwar && <span className="text-xs bg-white px-2 py-1 rounded border">Niwar: {niwar.qty}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}


          {fieldsEntries.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>No of Panel</TableHead>
                  <TableHead>Height</TableHead>
                  <TableHead>Width</TableHead>
                  <TableHead>Remark</TableHead>
                  <TableHead>Extras</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {fieldsEntries.map((entry, entryIndex) => {
                  const casement = watch(`rooms.${index}.entries.${entryIndex}.casement`);
                  const marking = watch(`rooms.${index}.entries.${entryIndex}.marking`);
                  const niwar = watch(`rooms.${index}.entries.${entryIndex}.niwar`);
                  const hasExtras = casement || marking || niwar;
                  const width = watch(`rooms.${index}.entries.${entryIndex}.width`);
                  React.useEffect(() => {
                    if (!width) return;

                    const widthNum = parseFloat(width);
                    if (isNaN(widthNum)) return;

                    const panels = Math.ceil(widthNum / 20);

                    setValue(
                      `rooms.${index}.entries.${entryIndex}.noOfPannel`,
                      String(panels),
                      { shouldValidate: true }
                    );
                  }, [width]);



                  return (
                    <TableRow key={entry.fieldId ?? entry.id ?? entryIndex}>                  
                      <TableCell>
                        <Input
                          {...register(`rooms.${index}.entries.${entryIndex}.itemType`)}
                          placeholder="Type"
                          className="w-24"
                          disabled
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          {...register(`rooms.${index}.entries.${entryIndex}.itemName`)}
                          placeholder="Item"
                          className="w-32"
                        />
                      </TableCell>

                      <TableCell>
                          <Input
                            {...register(`rooms.${index}.entries.${entryIndex}.noOfPannel`)}
                            readOnly
                          />
                        </TableCell>


                      <TableCell>
                        <Input
                          {...register(`rooms.${index}.entries.${entryIndex}.height`)}
                          placeholder="H"
                          className="w-16"
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          {...register(`rooms.${index}.entries.${entryIndex}.width`)}
                          placeholder="W"
                          className="w-16"
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          {...register(`rooms.${index}.entries.${entryIndex}.remark`)}
                          placeholder="Remark"
                          className="w-24"
                        />
                      </TableCell>

                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant={hasExtras ? "default" : "outline"}
                          onClick={() => {
                            setSelectedEntryIndex(entryIndex);
                            setExtraPopup({
                              roomIndex: index,
                              entryIndex,
                              open: true,
                              isSofa: false
                            });
                          }}
                        >
                          {hasExtras ? "Edit" : "Add"}
                        </Button>
                      </TableCell>

                      <TableCell className="text-center">
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          onClick={() => removeEntry(entryIndex)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <Button type="button" className="bg-blue-600 text-white mt-3" onClick={handleUpdateItems}>
            Update Items
          </Button>

        </div>
      </CardContent>

      {/* ===================================================
                ITEM TYPE SELECTION DIALOG (NEW)
      =================================================== */}
      <Dialog open={itemTypeDialog} onOpenChange={setItemTypeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Item Type</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <Button
              type="button"
              variant="outline"
              className="h-24 flex flex-col gap-2"
              onClick={() => handleAddItemType("Sofa")}
            >
              <span className="text-2xl">🛋️</span>
              <span>Sofa</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-24 flex flex-col gap-2"
              onClick={() => handleAddItemType("Curtain")}
            >
              <span className="text-2xl">🪟</span>
              <span>Curtain</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-24 flex flex-col gap-2"
              onClick={() => handleAddItemType("Wall to Wall")}
            >
              <span className="text-2xl">📏</span>
              <span>Wall to Wall</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-24 flex flex-col gap-2"
              onClick={() => handleAddItemType("Wallpaper")}
            >
              <span className="text-2xl">🎨</span>
              <span>Wallpaper</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===================================================
                EXTRA POPUP
      =================================================== */}
      <Dialog
        open={extraPopup.open}
        onOpenChange={() => setExtraPopup({ ...extraPopup, open: false })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Additional Options</DialogTitle>
          </DialogHeader>

          {!extraPopup.isSofa ? (
            <div className="space-y-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSelectedEntryIndex(extraPopup.entryIndex);
                  setOpenDialog("casement");
                  setExtraPopup({ ...extraPopup, open: false });
                }}
              >
                Casement
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSelectedEntryIndex(extraPopup.entryIndex);
                  setOpenDialog("marking");
                  setExtraPopup({ ...extraPopup, open: false });
                }}
              >
                Marking
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSelectedEntryIndex(extraPopup.entryIndex);
                  setOpenDialog("niwar");
                  setExtraPopup({ ...extraPopup, open: false });
                }}
              >
                Niwar
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSelectedEntryIndex(extraPopup.entryIndex);
                  setOpenDialog("foam");
                  setExtraPopup({ ...extraPopup, open: false });
                }}
              >
                Foam
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSelectedEntryIndex(extraPopup.entryIndex);
                  setOpenDialog("casement");
                  setExtraPopup({ ...extraPopup, open: false });
                }}
              >
                Casement
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSelectedEntryIndex(extraPopup.entryIndex);
                  setOpenDialog("marking");
                  setExtraPopup({ ...extraPopup, open: false });
                }}
              >
                Marking
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===================================================
                ACTUAL EXTRA DIALOGS
      =================================================== */}
      <FoamDialog
        isOpen={openDialog === "foam"}
        onClose={() => setOpenDialog(null)}
        onSave={(data) => {
          if (selectedEntryIndex !== null) {
            if (extraPopup.isSofa) {
              setValue(
                `rooms.${index}.sofas.${selectedEntryIndex}.foam`,
                data
              );
            } else {
              setValue(
                `rooms.${index}.entries.${selectedEntryIndex}.foam`,
                data
              );
            }
          }
        }}
      />

      <SimpleQtyDialog
        isOpen={openDialog === "casement"}
        title="Casement Qty (MTR)"
        onClose={() => setOpenDialog(null)}
        onSave={(data) => {
          if (selectedEntryIndex !== null) {
            if (extraPopup.isSofa) {
              setValue(
                `rooms.${index}.sofas.${selectedEntryIndex}.casement`,
                data
              );
            } else {
              setValue(
                `rooms.${index}.entries.${selectedEntryIndex}.casement`,
                data
              );
            }
          }
        }}
      />

      <SimpleQtyDialog
        isOpen={openDialog === "marking"}
        title="Marking Qty (MTR)"
        onClose={() => setOpenDialog(null)}
        onSave={(data) => {
          if (selectedEntryIndex !== null) {
            if (extraPopup.isSofa) {
              setValue(
                `rooms.${index}.sofas.${selectedEntryIndex}.marking`,
                data
              );
            } else {
              setValue(
                `rooms.${index}.entries.${selectedEntryIndex}.marking`,
                data
              );
            }
          }
        }}
      />

      <SimpleQtyDialog
        isOpen={openDialog === "niwar"}
        title="Niwar Qty (MTR)"
        onClose={() => setOpenDialog(null)}
        onSave={(data) => {
          if (selectedEntryIndex !== null) {
            setValue(
              `rooms.${index}.entries.${selectedEntryIndex}.niwar`,
              data
            );
          }
        }}
      />
    
    </Card>
  );
};



const MeasurementPreview = ({
    values,
    customer,
    deal,
    onBack,
    onSubmit,
    loading
}: {
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

                <CardContent className="space-y-8">

                    {/* BASIC INFO */}
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                        <p><strong>Customer:</strong> {customer.name}</p>
                        <p><strong>Deal ID:</strong> {deal.dealId}</p>
                        <p><strong>Measurement Type:</strong> {values.typeOf}</p>
                        <p><strong>Doer Name:</strong> {values.doerName}</p>
                    </div>

                    {/* ROOMS */}
                    {values.rooms.map((room, roomIndex) => (
                        <div key={room.id || roomIndex} className="border-t pt-4">

                            <h3 className="font-bold text-xl mb-3">
                                {room.roomName || `Room ${roomIndex + 1}`}
                            </h3>

                            {/* ======================
                                SOFAS PREVIEW
                            ====================== */}
                            {room.sofas && room.sofas.length > 0 && (
                                <div className="mb-6">
                                    <h4 className="font-semibold text-lg mb-2">Sofas</h4>

                                    <table className="w-full text-sm border">
                                        <thead className="bg-gray-100">
                                            <tr>
                                                <th className="border p-2">Item</th>
                                                <th className="border p-2">Seats</th>
                                                <th className="border p-2">Fabric Qty</th>
                                                <th className="border p-2">Stitching Rate</th>
                                                <th className="border p-2">Extras</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {room.sofas.map((sofa, sIndex) => (
                                                <tr key={sIndex}>
                                                    <td className="border p-2">{sofa.itemName}</td>
                                                    <td className="border p-2">{sofa.noOfSeat}</td>
                                                    <td className="border p-2">{sofa.fabricQty}</td>
                                                    <td className="border p-2">{sofa.stitchingRate}</td>

                                                    <td className="border p-2 space-x-2">
                                                        {sofa.foam && (
                                                            <span className="bg-blue-100 px-2 py-1 rounded text-xs">
                                                                Foam: {sofa.foam.foamSize}/{sofa.foam.qty}/{sofa.foam.density}
                                                            </span>
                                                        )}
                                                        {sofa.casement && (
                                                            <span className="bg-green-100 px-2 py-1 rounded text-xs">
                                                                Casement: {sofa.casement.qty}
                                                            </span>
                                                        )}
                                                        {sofa.marking && (
                                                            <span className="bg-yellow-100 px-2 py-1 rounded text-xs">
                                                                Marking: {sofa.marking.qty}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* ======================
                                WINDOW ITEMS PREVIEW
                            ====================== */}
                            {room.entries && room.entries.length > 0 && (
                                <div className="mb-6">
                                    <h4 className="font-semibold text-lg mb-2">Window Items</h4>

                                    <table className="w-full text-sm border">
                                        <thead className="bg-gray-100">
                                            <tr>
                                                <th className="border p-2">Item</th>
                                                <th className="border p-2">Height</th>
                                                <th className="border p-2">Width</th>
                                                <th className="border p-2">Panels</th>
                                                <th className="border p-2">Remark</th>
                                                <th className="border p-2">Extras</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {room.entries.map((entry, eIndex) => (
                                                <tr key={eIndex}>
                                                    <td className="border p-2">{entry.itemName}</td>
                                                    <td className="border p-2">{entry.height}</td>
                                                    <td className="border p-2">{entry.width}</td>
                                                    <td className="border p-2">{entry.noOfPannel}</td>
                                                    <td className="border p-2">{entry.remark}</td>

                                                    <td className="border p-2 space-x-2">
                                                        {entry.casement && (
                                                            <span className="bg-green-100 px-2 py-1 rounded text-xs">
                                                                Casement: {entry.casement.qty}
                                                            </span>
                                                        )}
                                                        {entry.marking && (
                                                            <span className="bg-yellow-100 px-2 py-1 rounded text-xs">
                                                                Marking: {entry.marking.qty}
                                                            </span>
                                                        )}
                                                        {entry.niwar && (
                                                            <span className="bg-red-100 px-2 py-1 rounded text-xs">
                                                                Niwar: {entry.niwar.qty}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* ======================
                                BLINDS PREVIEW
                            ====================== */}
                            {room.blinds && room.blinds.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-lg mb-2">Blinds</h4>

                                    <table className="w-full text-sm border">
                                        <thead className="bg-gray-100">
                                            <tr>
                                                <th className="border p-2">Blind Type</th>
                                                <th className="border p-2">Control</th>
                                                <th className="border p-2">Width</th>
                                                <th className="border p-2">Height</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {room.blinds.map((blind, bIndex) => (
                                                <tr key={bIndex}>
                                                    <td className="border p-2">{blind.blindType}</td>
                                                    <td className="border p-2">{blind.control}</td>
                                                    <td className="border p-2">{blind.width}</td>
                                                    <td className="border p-2">{blind.height}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                        </div>
                    ))}

                </CardContent>
            </div>

            {/* FOOTER BUTTONS */}
            <CardFooter className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onBack} disabled={loading}>
                    <StepBack className="mr-2 h-4 w-4" /> Back to Edit
                </Button>
                <Button onClick={onSubmit} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm & Save
                </Button>
            </CardFooter>
        </Card>
    );
};


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
    const [visitDataState, setVisitDataState] = React.useState<any>(null);
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
        name: "rooms",
        keyName: "fieldId"
    });
    
React.useEffect(() => {
    if (!customerId || !dealId || !visitId) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Missing customer, deal or visit ID.'
        });
        router.back();
        return;
    }

    const fetchData = async () => {
        console.log("🟡 FETCH STARTED");
        console.log("➡ customerId:", customerId);
        console.log("➡ dealId:", dealId);
        console.log("➡ visitId:", visitId);

        setLoading(true);

        try {
            // -----------------------------
            // 1. FETCH CUSTOMER + DEAL
            // -----------------------------
            const [customerData, dealData] = await Promise.all([
                getCustomerById(customerId),
                getDealById(customerId, dealId)
            ]);

            console.log("✅ CUSTOMER FETCHED:", customerData);
            console.log("✅ DEAL FETCHED:", dealData);

            setCustomer(customerData);
            setDeal(dealData);

            // -----------------------------
            // 2. FETCH ALL VISITS & FIND CURRENT
            // -----------------------------
            const visitList = await getVisitsForDeal(customerId, dealId);
            console.log("📘 ALL VISITS:", visitList);

            if (!Array.isArray(visitList)) {
                console.log("❌ visitList is not an array:", visitList);
                return;
            }

            const visitData = visitList.find(v => v.id === visitId);
            setVisitDataState(visitData);
            console.log("📙 CURRENT VISIT:", visitData);

            if (!visitData) {
                console.log("❌ Visit not found");
                return;
            }

            // -----------------------------
            // 3. CHECK SELECTION ID
            // -----------------------------
            if (!visitData.selectionId || visitData.selectionId === "none") {
                console.log("🚫 No selectionId → skipping auto-fill");
                return;
            }

            console.log("🎉 VALID selectionId FOUND:", visitData.selectionId);

            // -----------------------------
            // 4. FETCH SELECTION (WITH FULL PRODUCTS)
            // -----------------------------
            const selection = await getSelectionById(customerId, dealId, visitData.selectionId);
            console.log("📦 SELECTION FETCHED:", selection);

            if (!selection) {
                console.log("❌ Selection not found");
                return;
            }

            if (!selection.products || selection.products.length === 0) {
                console.log("⚠ No products stored inside selection");
                return;
            }

            const products = selection.products; // ⭐ CORRECT SOURCE
            console.log("🟪 PRODUCTS INSIDE SELECTION:", products);

            // -----------------------------
            // 5. CONVERT PRODUCTS → ROOMS → ENTRIES
            // -----------------------------
            let groupedRooms: any = {};

            products.forEach((prod: any, index: number) => {
                const roomName = prod.room || `Room-${index + 1}`;

                if (!groupedRooms[roomName]) {
                    groupedRooms[roomName] = {
                        roomName,
                        blinds: [],
                        entries: []
                    };
                }

                // 🟦 BLIND PRODUCT
                if (prod.isBlind === true) {
                    groupedRooms[roomName].blinds.push({
                        id: prod.id,
                        blindType: prod.blindType || "",
                        operating: prod.operating || "",
                        control: prod.control || "",
                        bottomChannel: prod.bottomChannel || "",
                        bottomRailColor: prod.bottomRailColor || "",
                        bracket: prod.bracket || "",
                        shadeNo: prod.shadeNo || "",
                        width: prod.width || "",
                        height: prod.height || "",
                        noOfBlind: prod.noOfBlind || "",
                        usesType: prod.usesType || "",
                        room: roomName,
                        status: "blind-needed",
                    });
                }

                // 🟩 NON-BLIND PRODUCT
                if (!prod.isBlind) {
                    groupedRooms[roomName].entries.push({
                        id: prod.id,
                        status: "item-needed",
                        itemName: prod.salesDescription || "",
                        height: prod.height || "",
                        width: prod.width || "",
                        noOfPannel: prod.noOfPcs || "",
                        remark: prod.remarks || ""
                    });
                }
            });

            const finalRooms = Object.values(groupedRooms);
            console.log("🟣 FINAL AUTO-MAPPED ROOMS:", finalRooms);

            // -----------------------------
            // 6. APPLY TO FORM
            // -----------------------------
            form.setValue("rooms", finalRooms);
            console.log("🟢 ROOMS APPLIED:", form.getValues("rooms"));

        } catch (err) {
            console.error("❌ FETCH ERROR:", err);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not load required data."
            });
        } finally {
            setLoading(false);
            console.log("🟢 FETCH COMPLETED");
        }
    };

    fetchData();
}, [customerId, dealId, visitId]);


  



    
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
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Missing critical information.',
        });
        setIsSubmitting(false);
        return;
    }

    setIsSubmitting(true);

    try {
        // 1️⃣ Generate PDF (your existing flow)
        const pdfUrl = await generateAndUploadPdf();

        // 2️⃣ Process rooms, audio, pictures
        const processedRooms = await Promise.all(
            values.rooms.map(async (room) => {
                const processedEntries = await Promise.all(
                    room.entries.map(async (entry) => {
                        const audioUrl = entry.recordAudio
                            ? await handleFileUpload(entry.recordAudio)
                            : undefined;

                        let pictureUrls: string[] = [];
                        if (entry.pictures && entry.pictures.length > 0) {
                            const filesToUpload = Array.from(entry.pictures as File[]);
                            pictureUrls = await Promise.all(
                                filesToUpload.map((file) => handleFileUpload(file))
                            );
                        }

                        const cleanedEntry: Partial<MeasurementEntry> = { ...entry };
                        delete cleanedEntry.recordAudio;
                        delete cleanedEntry.pictures;

                        return {
                            ...cleanedEntry,
                            audioUrl,
                            pictureUrls: pictureUrls.length > 0 ? pictureUrls : undefined,
                            status: "item-needed",
                        };
                    })
                );

                return { ...room, entries: processedEntries };
            })
        );

        // 3️⃣ Prepare simplified entries for DB
        const simplifiedEntries = processedRooms.flatMap((room) =>
            room.entries.map((entry) => ({
                ...entry,
                roomName: room.roomName,
            }))
        );

        // ------------------------------------------
        // ⭐ 4️⃣ GET LATEST SELECTION ID FROM DEAL
        // ------------------------------------------
        async function getLatestSelectionId(customerId, dealId) {
            const res = await fetch(
                `/api/mobile/latest-selection?customerId=${customerId}&dealId=${dealId}`
            );
            const data = await res.json();
            return data.latestSelectionId || null;
        }

        const latestSelectionId = await getLatestSelectionId(customerId, dealId);

        console.log("⭐ Latest Selection ID:", latestSelectionId);

        // ------------------------------------------
        // ⭐ 5️⃣ CALL MIDDLEWARE
        // ------------------------------------------
        const middlewareResult = await processMeasurementSubmission({
            customerId,
            dealId,
            visitId,   // ADD THIS if available in props
            selectionId: latestSelectionId,   // ⭐ USE LATEST REAL SELECTION
            rooms: processedRooms,
            itemDetails: [],
            createdBy: user.name,
        });

        if (!middlewareResult.success) {
            toast({
                variant: "destructive",
                title: "Error",
                description: middlewareResult.error || "Measurement saving failed.",
            });
            return;
        }

        // ------------------------------------------
        // ⭐ 6️⃣ SUCCESS → redirect
        // ------------------------------------------
        toast({
            title: "Measurement Saved",
            description: middlewareResult.message,
        });

        router.push("/mobile");

    } catch (error: any) {
        console.error("Error submitting measurement:", error);
        toast({
            variant: "destructive",
            title: "Submission Failed",
            description: `An unexpected error occurred: ${error.message}`,
            duration: 9000,
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
                        <CardContent className="pt-6 grid grid-cols-2 gap-4">
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
                               <RoomEntryCard key={field.fieldId ?? field.id ?? index} index={index} remove={remove} customerId={customerId!} dealId={dealId!} selectionId={visitDataState?.selectionId!} />
                            ))}
                            <Button type="button" variant="outline" onClick={() => append({ id: new Date().toISOString(), roomName: '', entries: [{ id: null, isNew: true }], blinds: [] })} className="w-full">
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
