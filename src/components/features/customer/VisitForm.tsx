
"use client";

import React, { useState, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Customer, Deal, User, DealOrder, DealVisit, DeliveryInstallationItem, Selection } from "@/lib/types";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const deliveryInstallationItemSchema = z.object({
  id: z.string(),
  noOfPcs: z.string().optional(),
});

const visitSchema = z.object({
    representative: z.string().min(1, "Representative is required."),
    selectionId: z.string().optional(), // Added for linking to a selection
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
    { id: 'wallpaper-measurement', label: 'Wallpaper Measurement' },
    { id: 'flooring-measurement', label: 'Flooring Measurement' },
    { id: 'blinds-measurement', label: 'Blinds Measurement' },
    { id: 'mattress-measurement', label: 'Mattress Measurement' },
    { id: 'other-measurement', label: 'Other Measurement' },
];

export const subMeasurementBlinds = [
    { id: 'roman-blind', label: 'Roman Blind' },
    { id: 'roller-blind', label: 'Roller Blind' },
    { id: 'zebra-blind', label: 'Zebra Blind' },
    { id: 'wooden-blind', label: 'Wooden Blind' },
];

export const subMeasurementCurtain = [
    { id: 'three-pleat', label: 'Three Pleat' },
    { id: 'two-pleat', label: 'Two Pleat' },
    { id: 'one-pleat', label: 'One Pleat' },
    { id: 'eyelet', label: 'Eyelet' },
    { id: 'rod-pocket', label: 'Rod Pocket' },
    { id: 'box-pleat', label: 'Box Pleat' },
    { id: 'goblet', label: 'Goblet' },
];

export const deliveryInstallationItems: DeliveryInstallationItem[] = [
    { id: 'curtain-installation', noOfPcs: '1' },
    { id: 'blind-installation', noOfPcs: '1' },
    { id: 'wallpaper-installation', noOfPcs: '1' },
    { id: 'flooring-installation', noOfPcs: '1' },
    { id: 'other-installation', noOfPcs: '1' },
];

export const subDeliveryInstallationItems: DeliveryInstallationItem[] = [
    { id: 'roman-blind', noOfPcs: '1' },
    { id: 'roller-blind', noOfPcs: '1' },
    { id: 'zebra-blind', noOfPcs: '1' },
];


export function VisitForm({ salesmen, customerId, dealId, onVisitAdded, visits, orders, selections }: { salesmen: User[], customerId: string, dealId: string, onVisitAdded: (visit: DealVisit) => void, visits: DealVisit[], orders: DealOrder[], selections: Selection[] }) {
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
    
    const MeasurementVisitTabContent = (
        <div className="space-y-6">
            <FormField
                control={form.control}
                name="selectionId"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Link to Selection (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select a pre-made selection..." /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {selections.map(s => <SelectItem key={s.id} value={s.id}>Selection #{s.id} ({s.totalPcs} pcs)</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="measurements"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Type of Measurement</FormLabel>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {measurementItems.map((item) => (
                                <FormField
                                    key={item.id}
                                    control={form.control}
                                    name="measurements"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                            <FormControl><Checkbox checked={field.value?.includes(item.id)} onCheckedChange={(checked) => { return checked ? field.onChange([...(field.value || []), item.id]) : field.onChange(field.value?.filter((value) => value !== item.id))}} /></FormControl>
                                            <FormLabel className="font-normal">{item.label}</FormLabel>
                                        </FormItem>
                                    )}
                                />
                            ))}
                        </div>
                        <FormMessage />
                    </FormItem>
                )}
            />
            {watchedMeasurements?.includes('blinds-measurement') && (
                 <FormField
                    control={form.control}
                    name="blinds"
                    render={() => (
                        <FormItem>
                            <FormLabel>Select Blinds</FormLabel>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {subMeasurementBlinds.map((item) => (
                                    <FormField key={item.id} control={form.control} name="blinds" render={({ field }) => (
                                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                            <FormControl><Checkbox checked={field.value?.includes(item.id)} onCheckedChange={(checked) => {return checked ? field.onChange([...(field.value || []), item.id]) : field.onChange(field.value?.filter((value) => value !== item.id))}} /></FormControl>
                                            <FormLabel className="font-normal">{item.label}</FormLabel>
                                        </FormItem>
                                    )} />
                                ))}
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            )}
             {watchedMeasurements?.includes('curtain-measurement') && (
                <FormField
                    control={form.control}
                    name="curtain"
                    render={() => (
                        <FormItem>
                            <FormLabel>Select Curtain</FormLabel>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {subMeasurementCurtain.map((item) => (
                                    <FormField key={item.id} control={form.control} name="curtain" render={({ field }) => (
                                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                            <FormControl><Checkbox checked={field.value?.includes(item.id)} onCheckedChange={(checked) => {return checked ? field.onChange([...(field.value || []), item.id]) : field.onChange(field.value?.filter((value) => value !== item.id))}} /></FormControl>
                                            <FormLabel className="font-normal">{item.label}</FormLabel>
                                        </FormItem>
                                    )} />
                                ))}
                                <FormField control={form.control} name="otherCurtain" render={({ field }) => ( <FormItem className="col-span-2"><FormControl><Input placeholder="Other..." {...field} /></FormControl></FormItem> )} />
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            )}
        </div>
    );
    
    const DeliveryVisitTabContent = (
        <div className="space-y-6">
            <FormField control={form.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Select Order Number</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an order to associate with this visit" /></SelectTrigger></FormControl><SelectContent>{orders.map(order => ( <SelectItem key={order.id} value={order.orderNo}>{order.orderNo}</SelectItem> ))}</SelectContent></Select><FormMessage /></FormItem> )} />
            <FormField
                control={form.control}
                name="deliveryInstallations"
                render={() => (
                    <FormItem>
                        <FormLabel>Type of Delivery/Installation</FormLabel>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {deliveryInstallationItems.map((item, index) => (
                                <Controller
                                    key={item.id}
                                    control={form.control}
                                    name={`deliveryInstallations.${index}`}
                                    render={({ field }) => (
                                        <div className="flex items-center gap-2 p-2 border rounded-md">
                                            <Checkbox
                                                checked={!!field.value}
                                                onCheckedChange={(checked) => {
                                                    field.onChange(checked ? { id: item.id, noOfPcs: '1' } : null);
                                                }}
                                            />
                                            <Label htmlFor={item.id} className="flex-grow">{item.label}</Label>
                                            {field.value && (
                                                 <Input
                                                    type="number"
                                                    className="w-16 h-8"
                                                    placeholder="Pcs"
                                                    value={field.value.noOfPcs || '1'}
                                                    onChange={(e) => field.onChange({ ...field.value, noOfPcs: e.target.value })}
                                                />
                                            )}
                                        </div>
                                    )}
                                />
                            ))}
                            <FormField control={form.control} name="otherDelivery" render={({ field }) => ( <FormItem className="col-span-full"><FormControl><Input placeholder="Other..." {...field} /></FormControl></FormItem> )} />
                        </div>
                    </FormItem>
                )}
            />
            {watchedDeliveryInstallations?.some(d => d?.id === 'curtain-installation') && (
                 <FormField
                    control={form.control}
                    name="subDeliveryInstallations"
                    render={() => (
                        <FormItem>
                            <FormLabel>Select Sub Delivery/Installation</FormLabel>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {subDeliveryInstallationItems.map((item, index) => (
                                    <Controller
                                        key={item.id}
                                        control={form.control}
                                        name={`subDeliveryInstallations.${index}`}
                                        render={({ field }) => (
                                            <div className="flex items-center gap-2 p-2 border rounded-md">
                                                <Checkbox
                                                    checked={!!field.value}
                                                    onCheckedChange={(checked) => field.onChange(checked ? { id: item.id, noOfPcs: '1' } : null)}
                                                />
                                                <Label htmlFor={item.id} className="flex-grow">{item.label}</Label>
                                                {field.value && (
                                                    <Input
                                                        type="number"
                                                        className="w-16 h-8"
                                                        placeholder="Pcs"
                                                        value={field.value.noOfPcs || '1'}
                                                        onChange={(e) => field.onChange({ ...field.value, noOfPcs: e.target.value })}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    />
                                ))}
                            </div>
                        </FormItem>
                    )}
                />
            )}
        </div>
    );

    return (
        <>
         <Card className="mt-6">
            <CardHeader><CardTitle>Add Visit</CardTitle></CardHeader>
            <CardContent className="p-6">
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <FormField
                            control={form.control}
                            name="representative"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Representative*</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Select a representative" /></SelectTrigger></FormControl>
                                        <SelectContent>{salesmen.map((s) => ( <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem> ))}</SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Separator />
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-5">
                                <TabsTrigger value="measurement" disabled={hasMeasurementVisit}>Measurement</TabsTrigger>
                                <TabsTrigger value="delivery">Delivery</TabsTrigger>
                                <TabsTrigger value="fittings">Fittings</TabsTrigger>
                                <TabsTrigger value="complaint">Complaint</TabsTrigger>
                                <TabsTrigger value="other">Other</TabsTrigger>
                            </TabsList>
                            <TabsContent value="measurement" className="mt-6">{MeasurementVisitTabContent}</TabsContent>
                            <TabsContent value="delivery" className="mt-6">{DeliveryVisitTabContent}</TabsContent>
                            <TabsContent value="fittings" className="mt-6"><p className="text-muted-foreground text-center py-4">Fittings visit form fields will appear here.</p></TabsContent>
                            <TabsContent value="complaint" className="mt-6"><p className="text-muted-foreground text-center py-4">Complaint visit form fields will appear here.</p></TabsContent>
                            <TabsContent value="other" className="mt-6"><p className="text-muted-foreground text-center py-4">Other visit form fields will appear here.</p></TabsContent>
                        </Tabs>

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
