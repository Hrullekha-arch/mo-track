
"use client";

import React, { useState, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Customer, Deal, User, DealOrder, DealVisit, DeliveryInstallationItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { addVisitAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Share2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export const deliveryInstallationItemSchema = z.object({
  id: z.string(),
  noOfPcs: z.string().optional(),
});

const visitSchema = z.object({
    representative: z.string().min(1, "Representative is required."),
    measurements: z.array(z.string()).optional(),
    blinds: z.array(z.string()).optional(),
    curtain: z.array(z.string()).optional(),
    otherCurtain: z.string().optional(),
    deliveryInstallations: z.array(deliveryInstallationItemSchema.nullable()).optional(),
    subDeliveryInstallations: z.array(deliveryInstallationItemSchema.nullable()).optional(),
    otherDelivery: z.string().optional(),
    orderId: z.string().optional(),
});

export type VisitFormValues = z.infer<typeof visitSchema>;

export const measurementItems = [
    { id: 'curtain-measurement', label: 'Curtain Measurement' },
    { id: 'sofa-measurement', label: 'Sofa Measurement' },
    // ... all other measurement items
];

export const subMeasurementBlinds = [ { id: 'roman-blind', label: 'Roman Blind' }, /* ... */ ];
export const subMeasurementCurtain = [ { id: 'three-pleat', label: 'Three Pleat' }, /* ... */ ];
export const deliveryInstallationItems = [ { id: 'curtain-installation', label: 'Curtain Installation' }, /* ... */ ];
export const subDeliveryInstallationItems = [ { id: 'roman-blind', label: 'Roman Blind' }, /* ... */ ];


export function VisitForm({ salesmen, customerId, dealId, onVisitAdded, visits, orders }: { salesmen: User[], customerId: string, dealId: string, onVisitAdded: (visit: DealVisit) => void, visits: DealVisit[], orders: DealOrder[] }) {
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('measurement');
    const [showShareDialog, setShowShareDialog] = useState(false);
    const [whatsAppUrl, setWhatsAppUrl] = useState('');
    const { toast } = useToast();
    const { user } = useAuth();
    
    const hasMeasurementVisit = useMemo(() => visits.some(v => v.typeOfVisit === 'measurement'), [visits]);

    const form = useForm<VisitFormValues>({
        resolver: zodResolver(visitSchema),
        defaultValues: {
            representative: "", measurements: [], blinds: [], curtain: [], otherCurtain: '',
            deliveryInstallations: [], subDeliveryInstallations: [], otherDelivery: '', orderId: '',
        }
    });

    const watchedMeasurements = form.watch("measurements");
    const watchedDeliveryInstallations = form.watch("deliveryInstallations");

    async function onSubmit(data: VisitFormValues) {
        if (!user) {
            toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
            return;
        }
        setLoading(true);
        try {
            const visitDataForDb = { ...data, typeOfVisit: activeTab };
            const result = await addVisitAction(customerId, dealId, visitDataForDb, user.name);
            if (result.success && result.visit) {
                toast({ title: "Visit Request Created", description: "Share the link with the customer to confirm." });
                onVisitAdded(result.visit);
                if (result.whatsAppUrl) {
                    setWhatsAppUrl(result.whatsAppUrl);
                    setShowShareDialog(true);
                }
                form.reset();
            } else {
                 toast({ variant: "destructive", title: "Error", description: result.message });
            }
        } catch (e) {
             toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
        } finally {
            setLoading(false);
        }
    }
    
    const DeliveryVisitTabContent = (
        <div className="space-y-6">
            <FormField control={form.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Select Order Number</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an order to associate with this visit" /></SelectTrigger></FormControl><SelectContent>{orders.map(order => ( <SelectItem key={order.id} value={order.orderNo}>{order.orderNo}</SelectItem> ))}</SelectContent></Select><FormMessage /></FormItem> )} />
            {/* ... rest of the delivery form */}
        </div>
    );

    return (
        <>
         <Card className="mt-6">
            <CardHeader><CardTitle>Add Visit</CardTitle></CardHeader>
            <CardContent className="p-6">
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        {/* ... form fields ... */}
                        <div className="mt-8 flex">
                            <Button type="submit" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update Activity</Button>
                        </div>
                    </form>
                 </Form>
            </CardContent>
        </Card>
        <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
            <DialogContent>
                <DialogHeader><DialogTitle>Share Visit Confirmation Link</DialogTitle><DialogDescription>Copy the link below and share it with the customer via WhatsApp so they can confirm their visit details.</DialogDescription></DialogHeader>
                <div className="py-4"><Input value={whatsAppUrl} readOnly /></div>
                <DialogFooter><Button variant="secondary" onClick={() => { navigator.clipboard.writeText(whatsAppUrl); toast({title: "Link Copied!"})}}>Copy Link</Button><Button asChild><a href={whatsAppUrl} target="_blank" rel="noopener noreferrer"><Share2 className="mr-2 h-4 w-4" /> Open WhatsApp</a></Button></DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    )
}
