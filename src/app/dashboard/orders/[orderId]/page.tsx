
"use client";

import { useState, useEffect, use } from 'react';
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, User, Phone, MapPin, Tag, CheckCircle2, Calendar, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { MilestoneProgress } from '@/components/features/order-management/MilestoneProgress';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';

export default function OrderDetailPage({ params }: { params: { orderId: string } }) {
    const { orderId } = params;
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const { user, role } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        const docRef = doc(db, "orders", orderId);
        const unsubscribe = onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                setOrder({ id: doc.id, ...doc.data() } as Order);
            } else {
                setOrder(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [orderId]);
    
    const canEditMilestones = (role === 'admin' || role === 'employee');

    const handleMilestoneChange = async (milestoneId: number, completed: boolean) => {
        if (!order) return;
        if (!canEditMilestones) {
            toast({ variant: "destructive", title: "Permission Denied", description: "You are not authorized to change milestones." });
            return;
        }

        try {
          const orderRef = doc(db, "orders", order.id);
          let updatedMilestones = order.milestones.map(m =>
            m.id === milestoneId ? { ...m, completed, completedAt: completed ? new Date().toISOString() : null, completedBy: completed ? user?.name : null, location: null } : m
          );
          
          if (!completed) {
              const milestoneIndex = updatedMilestones.findIndex(m => m.id === milestoneId);
              if (milestoneIndex !== -1) {
                  for (let i = milestoneIndex + 1; i < updatedMilestones.length; i++) {
                      updatedMilestones[i] = { ...updatedMilestones[i], completed: false, completedAt: null, completedBy: null, location: null };
                  }
              }
          }

          const updatePayload: any = { milestones: updatedMilestones };
          await updateDoc(orderRef, updatePayload);
          toast({ title: "Milestone updated!" });
        } catch (error) {
          console.error("Error updating milestone: ", error);
          toast({ variant: "destructive", title: "Failed to update milestone." });
        }
    };


    if (loading) {
        return (
            <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-4">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }
    
    if (!order) {
        return (
             <div className="container mx-auto p-4 md:p-6 lg:p-8 text-center">
                <h1 className="text-2xl font-bold">Order not found</h1>
                <p className="text-muted-foreground">The order with ID {orderId} could not be found.</p>
                <Button asChild variant="link" className="mt-4">
                    <Link href="/dashboard/orders">Go Back</Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <div className="flex items-center gap-4 mb-4">
                <Button asChild variant="outline" size="icon">
                    <Link href="/dashboard/orders"><ArrowLeft /></Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Order Details</h1>
                    <p className="text-muted-foreground">Viewing details for order: {order.id}</p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Customer & Order Info</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Customer: </span><span className="font-medium">{order.customerName}</span></div></div>
                                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Phone: </span><span className="font-medium">{order.customerPhone}</span></div></div>
                                <div className="flex items-center gap-2 col-span-full"><MapPin className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Address: </span><span className="font-medium">{order.customerAddress}</span></div></div>
                                <Separator className="col-span-full" />
                                <div className="flex items-center gap-2"><Tag className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Sales Person: </span><span className="font-medium">{order.salesPerson}</span></div></div>
                                <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Created: </span><span className="font-medium">{new Date(order.createdAt).toLocaleDateString()}</span></div></div>
                                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Status: </span><span className="font-medium">{order.milestones.slice().reverse().find(m => m.completed)?.name || "Order Received"}</span></div></div>
                                <div className="flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-muted-foreground" /><div><span className="text-muted-foreground">Order Type: </span><span className="font-medium capitalize">{order.orderType.replace('+', ' + ')}</span></div></div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-1">
                     <Card>
                        <CardHeader>
                            <CardTitle>Milestone Progress</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <MilestoneProgress milestones={order.milestones} onMilestoneChange={canEditMilestones ? handleMilestoneChange : undefined} role={role} />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

