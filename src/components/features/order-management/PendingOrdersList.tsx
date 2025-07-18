
"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, doc, updateDoc, deleteDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, OrderType } from "@/lib/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Package, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { getMilestonesForOrder } from "@/lib/constants";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function PendingOrdersList() {
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
    const { toast } = useToast();
    const { user, role } = useAuth();
    const [selectedOrderTypes, setSelectedOrderTypes] = useState<Record<string, OrderType>>({});

    useEffect(() => {
        setLoading(true);
        // This query is now much more efficient and secure.
        const q = query(collection(db, "orders"), where("isAcknowledged", "==", false));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setPendingOrders(ordersData);
            
            // Initialize selected order types state if not already set
            const initialTypes: Record<string, OrderType> = {};
            ordersData.forEach(order => {
                if (!selectedOrderTypes[order.id]) {
                    initialTypes[order.id] = order.orderType;
                }
            });
            if (Object.keys(initialTypes).length > 0) {
                setSelectedOrderTypes(prev => ({ ...prev, ...initialTypes }));
            }
            
            setLoading(false);
        }, (error) => {
            console.error("Error fetching pending orders:", error);
            setLoading(false);
            toast({
                variant: "destructive",
                title: "Error fetching orders",
                description: "Could not load pending orders. Check permissions.",
            });
        });

        return () => unsubscribe();
    }, [toast]);


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
            
            // Mark the first milestone as complete
            if (newMilestones.length > 0) {
                newMilestones[0] = { 
                    ...newMilestones[0], 
                    completed: true, 
                    completedAt: new Date().toISOString(), 
                    completedBy: user.name,
                    location: null
                };
            }
            
            // Generate 4-digit OTP if it doesn't exist
            const otp = order.otp || Math.floor(1000 + Math.random() * 9000).toString();

            await updateDoc(orderRef, { 
                isAcknowledged: true, // Set the flag to true
                orderType: newOrderType,
                milestones: newMilestones,
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
    
    const handleDeleteOrder = async () => {
        if (!deletingOrder) return;
        try {
            await deleteDoc(doc(db, "orders", deletingOrder.id));
            toast({ title: "Order Deleted", description: `Order ${deletingOrder.id} has been removed.` });
            setDeletingOrder(null);
        } catch (error) {
            console.error("Error deleting order: ", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to delete order." });
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
        <>
            {pendingOrders.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {pendingOrders.map(order => (
                        <Card key={order.id} className="flex flex-col">
                            <CardHeader>
                                <CardTitle>{order.customerName}</CardTitle>
                                <CardDescription>{order.id}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-grow">
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
                            </CardContent>
                            <CardFooter className="flex-col items-stretch space-y-2">
                                <Button className="w-full" onClick={() => handleAcknowledgeOrder(order)}>
                                    <Check className="mr-2 h-4 w-4" />
                                    Acknowledge Order
                                </Button>
                                {role === 'admin' && (
                                    <AlertDialog onOpenChange={() => setDeletingOrder(null)}>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" className="w-full" onClick={() => setDeletingOrder(order)}>
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Delete
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This action cannot be undone. This will permanently delete the order for <span className="font-bold">{deletingOrder?.customerName} ({deletingOrder?.id})</span> from Firestore. 
                                                    This action is irreversible.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleDeleteOrder} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )}
                            </CardFooter>
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
        </>
    );
}
