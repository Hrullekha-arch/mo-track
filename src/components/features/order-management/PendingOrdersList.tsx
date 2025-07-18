
"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, OrderType } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Package } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { getMilestonesForOrder } from "@/lib/constants";

export function PendingOrdersList() {
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const { user } = useAuth();
    const [selectedOrderTypes, setSelectedOrderTypes] = useState<Record<string, OrderType>>({});

    useEffect(() => {
        setLoading(true);
        // This query finds orders where the 'completed' flag of the first milestone is false.
        // We will fetch all orders and filter client-side. For a large-scale app,
        // a separate 'status' field on the order document would be more efficient.
        const q = query(collection(db, "orders"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            const pending = allOrders.filter(order => order.milestones?.[0]?.completed === false);
            setPendingOrders(pending);
            
            // Initialize selected order types state
            const initialTypes: Record<string, OrderType> = {};
            pending.forEach(order => {
                initialTypes[order.id] = order.orderType;
            });
            setSelectedOrderTypes(initialTypes);

            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleOrderTypeChange = (orderId: string, newType: OrderType) => {
        setSelectedOrderTypes(prev => ({ ...prev, [orderId]: newType }));
    };

    const handleAcknowledgeOrder = async (order: Order) => {
        if (!user) {
            toast({ variant: "destructive", title: "Authentication error" });
            return;
        }
        try {
            const orderRef = doc(db, "orders", order.id);
            const newOrderType = selectedOrderTypes[order.id] || order.orderType;
            const newMilestones = getMilestonesForOrder(newOrderType);
            
            const updatedMilestones = newMilestones.map(m =>
                m.id === 1 ? { ...m, completed: true, completedAt: new Date().toISOString(), completedBy: user.name } : m
            );
            
            // Generate 4-digit OTP if it doesn't exist
            const otp = order.otp || Math.floor(1000 + Math.random() * 9000).toString();

            await updateDoc(orderRef, { 
                orderType: newOrderType,
                milestones: updatedMilestones,
                otp: otp
            });

            toast({ 
                title: "Order Acknowledged", 
                description: `${order.id} has been received. OTP: ${otp}` 
            });
        } catch (error) {
            console.error("Error acknowledging order:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        }
    };

    if (loading) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    return (
        <div>
            {pendingOrders.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {pendingOrders.map(order => (
                        <Card key={order.id}>
                            <CardHeader>
                                <CardTitle>{order.customerName}</CardTitle>
                                <CardDescription>{order.id}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4 text-sm">
                                    <p><strong>Sales Person:</strong> {order.salesPerson}</p>
                                    <p><strong>Created:</strong> {new Date(order.createdAt).toLocaleString()}</p>
                                    <div className="space-y-2">
                                        <Label htmlFor={`order-type-${order.id}`}>Order Type</Label>
                                        <Select 
                                            value={selectedOrderTypes[order.id] || order.orderType} 
                                            onValueChange={(value) => handleOrderTypeChange(order.id, value as OrderType)}
                                        >
                                            <SelectTrigger id={`order-type-${order.id}`}>
                                                <SelectValue placeholder="Select an order type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="delivery">Delivery</SelectItem>
                                                <SelectItem value="stitching">Stitching</SelectItem>
                                                <SelectItem value="stitching+installation">Stitching + Installation</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <Button className="w-full mt-4" onClick={() => handleAcknowledgeOrder(order)}>
                                    <Check className="mr-2 h-4 w-4" />
                                    Acknowledge Order
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center p-12 border-2 border-dashed rounded-lg">
                    <div className="mx-auto bg-primary text-primary-foreground rounded-full p-3 w-fit mb-4">
                        <Package className="h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-semibold">All Caught Up!</h3>
                    <p className="text-sm text-muted-foreground">There are no new orders waiting for acknowledgment.</p>
                </div>
            )}
        </div>
    );
}
