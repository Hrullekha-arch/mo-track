
"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, OrderType, User } from "@/lib/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Loader2, Package, Trash2, User as UserIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { getMilestonesForOrder } from "@/lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PendingOrdersList() {
    const [allOrders, setAllOrders] = useState<Order[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
    const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
    const [acknowledgingOrder, setAcknowledgingOrder] = useState<Order | null>(null);

    const { toast } = useToast();
    const { user, role } = useAuth();
    
    useEffect(() => {
        setLoading(true);
        // Fetch all orders to be filtered on the client-side
        const q = query(collection(db, "orders"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setAllOrders(ordersData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching orders:", error);
            setLoading(false);
            toast({
                variant: "destructive",
                title: "Error fetching orders",
                description: "Could not load orders. Check permissions.",
            });
        });

        const usersQuery = query(collection(db, "users"));
        const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
            const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
            setUsers(usersData);
        });

        return () => {
            unsubscribe();
            unsubscribeUsers();
        };
    }, [toast]);
    
    const pendingOrders = useMemo(() => {
        // An order is "pending" if its first milestone ("Order Received") is not complete.
        // This handles orders created from external sources like Google Sheets.
        return allOrders.filter(order => {
             // A new condition: isAcknowledged is false for orders from "New Order" dialog, which go to O2D
            if (order.isAcknowledged === false) return false;

            const firstMilestone = order.milestones.find(m => m.id === 1);
            return firstMilestone && !firstMilestone.completed;
        });
    }, [allOrders]);

    const handleAcknowledgeOrder = async (orderToAck: Order) => {
        if (!orderToAck || !user) {
            toast({ variant: "destructive", title: "An error occurred." });
            return;
        }
        setUpdatingOrderId(orderToAck.id);
        try {
            const orderRef = doc(db, "orders", orderToAck.id);
            const newMilestones = orderToAck.milestones.map(m => 
                m.id === 1 ? { 
                    ...m, 
                    completed: true, 
                    completedAt: new Date().toISOString(), 
                    completedBy: user.name,
                    location: null // No location needed for this step
                } : m
            );
            
            const updatePayload: any = {
                milestones: newMilestones,
                isAcknowledged: true,
            };

            // If o2dMilestones doesn't exist, initialize it.
            if (!orderToAck.o2dMilestones) {
                updatePayload.o2dMilestones = [];
            }
            
            await updateDoc(orderRef, updatePayload);

            toast({ 
                title: "Order Acknowledged", 
                description: `${orderToAck.id} has been acknowledged and moved to the main dashboard.` 
            });
            setAcknowledgingOrder(null);
        } catch (error) {
            console.error("Error acknowledging order:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        } finally {
            setUpdatingOrderId(null);
        }
    };
    
    const handleDeleteOrder = async () => {
        if (!deletingOrder) return;
        setUpdatingOrderId(deletingOrder.id);
        try {
            await deleteDoc(doc(db, "orders", deletingOrder.id));
            toast({ title: "Order Deleted", description: `Order ${deletingOrder.id} has been removed.` });
            setDeletingOrder(null);
        } catch (error) {
            console.error("Error deleting order: ", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to delete order." });
        } finally {
            setUpdatingOrderId(null);
        }
    };
    
    const handleOrderTypeChange = async (orderId: string, newType: OrderType) => {
        setUpdatingOrderId(orderId);
        try {
            const orderRef = doc(db, "orders", orderId);
            const newMilestones = getMilestonesForOrder(newType);
            await updateDoc(orderRef, {
                orderType: newType,
                milestones: newMilestones,
            });
            toast({
                title: "Order Type Updated",
                description: `Order ${orderId} is now a "${newType}" order.`,
            });
        } catch (error) {
            console.error("Error updating order type:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        } finally {
            setUpdatingOrderId(null);
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
                                    <div>
                                        <Label htmlFor={`order-type-${order.id}`}>Order Type</Label>
                                        <Select 
                                            value={order.orderType} 
                                            onValueChange={(value: OrderType) => handleOrderTypeChange(order.id, value)}
                                            disabled={updatingOrderId === order.id}
                                        >
                                            <SelectTrigger id={`order-type-${order.id}`}>
                                                <SelectValue placeholder="Select order type" />
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
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button className="w-full" onClick={() => setAcknowledgingOrder(order)} disabled={updatingOrderId === order.id}>
                                            {updatingOrderId === order.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                            Acknowledge & Process
                                        </Button>
                                    </AlertDialogTrigger>
                                     {acknowledgingOrder && (
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Acknowledge Order?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will mark order <span className="font-bold">{acknowledgingOrder.id}</span> as "Received" and move it to the main dashboard for further processing.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel onClick={() => setAcknowledgingOrder(null)}>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleAcknowledgeOrder(acknowledgingOrder)}>Continue</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                     )}
                                </AlertDialog>
                                {role === 'admin' && (
                                    <AlertDialog onOpenChange={(isOpen) => !isOpen && setDeletingOrder(null)}>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" className="w-full" onClick={() => setDeletingOrder(order)} disabled={updatingOrderId === order.id}>
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
