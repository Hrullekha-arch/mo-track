
"use client";

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from '@/context/AuthContext';
import { useToast } from "@/hooks/use-toast";
import { doc, getDoc, updateDoc, writeBatch, arrayUnion, collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Customer, Deal, DealVisit, Order, VasDetail, FabricDetail, O2DStatus } from '@/lib/types';
import { getCustomerById } from '@/app/dashboard/customers/actions';
import { getDealById } from '@/app/dashboard/customers/[customerId]/[dealId]/actions';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ArrowLeft, Package, User, Phone, MapPin, Truck, Check, Circle, CheckCheck } from "lucide-react";
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

type DeliveryItem = (FabricDetail | VasDetail) & { type: 'fabric' | 'vas', gathered: boolean };

const DeliveryChecklist = ({ items, onCheckChange, allChecked }: { items: DeliveryItem[], onCheckChange: (index: number, checked: boolean) => void, allChecked: boolean }) => {
    return (
        <div className="space-y-3">
            {items.map((item, index) => (
                <div key={`${item.type}-${index}`} className="flex items-center p-3 border rounded-lg bg-background">
                    <Checkbox
                        id={`item-${index}`}
                        checked={item.gathered}
                        onCheckedChange={(checked) => onCheckChange(index, !!checked)}
                        className="h-5 w-5 mr-4"
                    />
                    <Label htmlFor={`item-${index}`} className="flex-grow">
                        <p className="font-semibold">{'fabricName' in item ? item.fabricName : item.vasName}</p>
                        <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                    </Label>
                </div>
            ))}
        </div>
    );
};

export default function DeliveryVisitPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const { toast } = useToast();

    const visitId = params.visitId as string;
    const dealId = searchParams.get('dealId');
    const customerId = searchParams.get('customerId');
    const orderId = searchParams.get('orderId');

    const [loading, setLoading] = React.useState(true);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    
    const [customer, setCustomer] = React.useState<Customer | null>(null);
    const [deal, setDeal] = React.useState<Deal | null>(null);
    const [visit, setVisit] = React.useState<DealVisit | null>(null);
    const [order, setOrder] = React.useState<Order | null>(null);

    const [deliveryItems, setDeliveryItems] = React.useState<DeliveryItem[]>([]);
    const allItemsGathered = deliveryItems.every(item => item.gathered);

    React.useEffect(() => {
        if (!customerId || !dealId || !orderId || !visitId) {
            toast({ variant: 'destructive', title: 'Error', description: 'Missing required IDs in URL.' });
            router.back();
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                const [customerData, dealData, orderData, visitData] = await Promise.all([
                    getCustomerById(customerId),
                    getDealById(customerId, dealId),
                    getDoc(doc(db, "orders", orderId)),
                    getDoc(doc(db, 'customers', customerId, 'deals', dealId, 'visits', visitId))
                ]);

                if (!customerData || !dealData || !orderData.exists() || !visitData.exists()) {
                    throw new Error("Could not find all required documents.");
                }

                setCustomer(customerData);
                setDeal(dealData);
                setOrder({ id: orderData.id, ...orderData.data() } as Order);
                setVisit({ id: visitData.id, ...visitData.data() } as DealVisit);

                const order = { id: orderData.id, ...orderData.data() } as Order;
                const items: DeliveryItem[] = [
                    ...(order.fabricDetails || []).map(f => ({ ...f, type: 'fabric' as const, gathered: false })),
                    ...(order.vasDetails || []).map(v => ({ ...v, type: 'vas' as const, gathered: false }))
                ];
                setDeliveryItems(items);
                
            } catch (error) {
                console.error("Failed to fetch data:", error);
                toast({ variant: "destructive", title: "Error", description: "Could not load delivery details." });
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [customerId, dealId, orderId, visitId, toast, router]);
    
    const handleCheckChange = (index: number, checked: boolean) => {
        setDeliveryItems(prev => {
            const newItems = [...prev];
            newItems[index].gathered = checked;
            return newItems;
        });
    };

    const handleUpdateStatus = async (status: 'out for delivery' | 'completed') => {
        if (!user || !order || !visit) return;
        setIsSubmitting(true);
        try {
            const batch = writeBatch(db);
            const orderRef = doc(db, "orders", order.id);
            const visitRef = doc(db, 'customers', customer!.id, 'deals', deal!.id, 'visits', visit.id);
            const o2dRef = doc(db, 'o2d', deal!.id);
            
            if (status === 'out for delivery') {
                const milestoneToUpdate = order.milestones.find(m => m.id === 7);
                if (milestoneToUpdate) {
                    const updatedMilestones = order.milestones.map(m => m.id === 7 ? { ...m, completed: true, completedAt: new Date().toISOString(), completedBy: user.name } : m);
                    batch.update(orderRef, { milestones: updatedMilestones });
                }
            } else if (status === 'completed') {
                const milestoneToUpdate = order.milestones.find(m => m.id === 8);
                if (milestoneToUpdate) {
                    const updatedMilestones = order.milestones.map(m => m.id === 8 ? { ...m, completed: true, completedAt: new Date().toISOString(), completedBy: user.name } : m);
                    batch.update(orderRef, { milestones: updatedMilestones });
                }
                batch.update(visitRef, { status: 'completed' });
                const o2dDoneMilestone: O2DStatus = {
                    stepId: 13, status: 'completed', completedAt: new Date().toISOString(), completedBy: user.name, selection: "Done", remarks: "Completed via mobile app"
                };
                batch.update(o2dRef, { milestones: arrayUnion(o2dDoneMilestone) });
            }
            
            await batch.commit();
            toast({ title: 'Status Updated!', description: `Visit is now marked as ${status}.`});
            router.push('/mobile');
        } catch (error) {
            console.error("Error updating status:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to update status.' });
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
        )
    }

    if (!customer || !deal || !order || !visit) {
        return <p>Error loading data.</p>
    }
    
    const outForDelivery = !!order.milestones.find(m => m.id === 7)?.completed;
    const installationDone = !!order.milestones.find(m => m.id === 8)?.completed;

    return (
        <div className="min-h-screen bg-gray-50 p-4">
             <header className="flex items-center gap-2 mb-4">
                 <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft />
                 </Button>
                 <h1 className="text-xl font-bold">Delivery Workflow</h1>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle>Delivery for {customer.name}</CardTitle>
                    <CardDescription>Order ID: {order.id}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {customer.mobileNo}</p>
                    <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {customer.addressPinCode}</p>
                </CardContent>
            </Card>

            <Card className="mt-4">
                <CardHeader>
                    <CardTitle>Item Checklist</CardTitle>
                    <CardDescription>Please gather and verify all items before proceeding.</CardDescription>
                </CardHeader>
                <CardContent>
                    <DeliveryChecklist items={deliveryItems} onCheckChange={handleCheckChange} allChecked={allItemsGathered} />
                </CardContent>
            </Card>

            <Card className="mt-4">
                <CardHeader>
                    <CardTitle>Update Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Button 
                            className="w-full" 
                            disabled={!allItemsGathered || isSubmitting || outForDelivery}
                            onClick={() => handleUpdateStatus('out for delivery')}
                        >
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Truck className="mr-2 h-4 w-4" />}
                            {outForDelivery ? 'Out for Delivery' : 'Mark as Out for Delivery'}
                        </Button>
                        {!allItemsGathered && <p className="text-xs text-muted-foreground text-center mt-2">All items must be checked first.</p>}
                    </div>

                    <Separator />

                     <div>
                        <Button 
                            className="w-full" 
                            disabled={!outForDelivery || isSubmitting || installationDone}
                            onClick={() => handleUpdateStatus('completed')}
                        >
                             {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCheck className="mr-2 h-4 w-4" />}
                            {installationDone ? 'Installation Done' : 'Mark as Installation Done'}
                        </Button>
                        {!outForDelivery && <p className="text-xs text-muted-foreground text-center mt-2">Must be "Out for Delivery" first.</p>}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

