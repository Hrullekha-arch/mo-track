
"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { addMeasurementAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, PlusCircle, Calculator } from "lucide-react";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { roomOptions } from "@/lib/constants";
import { DealMeasurement } from "@/lib/types";

const measurementSchema = z.object({
    room: z.string().min(1, "Room is required."),
    measurementReference: z.string().min(1, "Measurement reference is required."),
    noOfUnits: z.string().min(1, "Number of units is required."),
    measurement: z.string().max(2000, "Measurement cannot exceed 2000 characters.").min(1, "Measurement is required."),
    file: z.any().optional(),
});

export type MeasurementFormValues = z.infer<typeof measurementSchema>;

function AddOptionDialog({ isOpen, onClose, onSave, fieldName }: { isOpen: boolean, onClose: () => void, onSave: (value: string) => void, fieldName: string }) {
    const [value, setValue] = useState("");
    const handleSave = () => { if (value.trim()) { onSave(value.trim().toLowerCase().replace(/\s+/g, '-')); onClose(); } };
    return ( <Dialog open={isOpen} onOpenChange={onClose}><DialogContent><DialogHeader><DialogTitle>Add New {fieldName}</DialogTitle></DialogHeader><div className="py-4"><Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Enter new ${fieldName.toLowerCase()}...`} /></div><DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={handleSave}>Save</Button></DialogFooter></DialogContent></Dialog> );
}

export function MeasurementForm({ onMeasurementAdded, customerId, dealId }: { onMeasurementAdded: (measurement: DealMeasurement) => void, customerId: string, dealId: string }) {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();
    const [isAddRoomOpen, setIsAddRoomOpen] = useState(false);
    
    const form = useForm<MeasurementFormValues>({
        resolver: zodResolver(measurementSchema),
        defaultValues: { room: "", measurementReference: "", noOfUnits: "1", measurement: "", file: null },
    });

    const handleSaveNewRoom = (value: string, label: string) => {
        (roomOptions as ComboboxOption[]).push({ value, label: label.toUpperCase() });
        form.setValue('room', value);
    };

    const onSubmit = async (data: MeasurementFormValues) => {
        if (!user) { toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." }); return; }
        setLoading(true);
        // try {
        //     const result = await addMeasurementAction(customerId, dealId, data, user.name);
        //     if (result.success && result.measurement) {
        //         toast({ title: "Measurement Added", description: "The new measurement has been saved." });
        //         onMeasurementAdded(result.measurement);
        //         form.reset();
        //     } else {
        //          toast({ variant: "destructive", title: "Error", description: result.message });
        //     }
        // } catch (e) {
        //     toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
        // } finally {
        //     setLoading(false);
        // }
    }

    return (
        <>
            <Card className="mt-6">
                <CardContent className="p-6">
                    <h3 className="text-xl font-semibold mb-6">Add More Measurements</h3>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            {/* Form fields */}
                            <div className="mt-8 flex"><Button type="submit" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add</Button></div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
            <AddOptionDialog isOpen={isAddRoomOpen} onClose={() => setIsAddRoomOpen(false)} fieldName="Room" onSave={(newValue) => handleSaveNewRoom(newValue, newValue.replace(/-/g, ' '))} />
        </>
    );
}
