
"use client";

import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Phone, MapPin, Loader2 } from "lucide-react";
import { Order, Milestone } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";

export function MobileView() {
  const { user, logout } = useAuth();
  const [assignedOrders, setAssignedOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const q = query(collection(db, "orders"), where("assignedTo", "==", user.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        setAssignedOrders(ordersData);
        setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Filter for active orders (not fully completed)
  const activeOrders = assignedOrders.filter(o => o.milestones.some(m => !m.completed));

  if (loading) {
    return (
        <div className="p-4 space-y-6">
            <header className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <Avatar><AvatarFallback>{user?.name?.[0]}</AvatarFallback></Avatar>
                    <div><p className="font-semibold">{user?.name}</p><p className="text-xs text-muted-foreground">Installer</p></div>
                 </div>
                 <Button variant="ghost" size="icon" disabled><LogOut className="h-5 w-5" /></Button>
            </header>
            <div className="text-center p-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-muted-foreground mt-4">Loading tasks...</p>
            </div>
        </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={`https://placehold.co/100x100.png`} data-ai-hint="avatar" />
            <AvatarFallback>{user?.name?.[0]}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{user?.name}</p>
            <p className="text-xs text-muted-foreground">Installer</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={logout}>
          <LogOut className="h-5 w-5" />
        </Button>
      </header>
      
      <div>
        <h1 className="text-2xl font-bold">Your Tasks</h1>
        <p className="text-muted-foreground">Here are your active assignments.</p>
      </div>

      {activeOrders.length > 0 ? (
        <div className="space-y-4">
          {activeOrders.map(order => (
            <InstallerOrderCard key={order.id} order={order} />
          ))}
        </div>
      ) : (
        <div className="text-center p-8 border-2 border-dashed rounded-lg">
          <p className="font-semibold">All clear!</p>
          <p className="text-sm text-muted-foreground">You have no active assignments.</p>
        </div>
      )}
    </div>
  );
}

interface InstallerOrderCardProps {
    order: Order;
}

function InstallerOrderCard({ order }: InstallerOrderCardProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isUpdating, setIsUpdating] = useState(false);

    // Milestones installers can update ('Out for Delivery/Installation', 'Installation Done')
    const installerMilestoneIds = [7, 8]; 
    const nextInstallerMilestone = order.milestones.find(m => installerMilestoneIds.includes(m.id) && !m.completed);
    
    // The previous milestone must be complete before the installer can act
    // For installers, this means 'Ready for Delivery' (ID 5) must be done for milestone 7,
    // and milestone 7 must be done for milestone 8.
    const canUpdate = (milestone: Milestone) => {
        const currentIndex = order.milestones.findIndex(m => m.id === milestone.id);
        if (currentIndex === 0) return true; // Should not happen for installers
        
        // Find the preceding milestone in the order's specific milestone list
        const prevMilestoneInFlow = order.milestones[currentIndex - 1];
        return prevMilestoneInFlow.completed;
    }

    const handleStatusUpdate = async (milestoneToUpdate: Milestone) => {
        if (!user || !canUpdate(milestoneToUpdate)) {
            toast({ variant: "destructive", title: "Cannot update status", description: "A previous step must be completed first."});
            return;
        }
        setIsUpdating(true);
        try {
            const orderRef = doc(db, "orders", order.id);
            const updatedMilestones = order.milestones.map(m =>
                m.id === milestoneToUpdate.id ? { ...m, completed: true, completedAt: new Date().toISOString(), completedBy: user.name } : m
            );
            await updateDoc(orderRef, { milestones: updatedMilestones });
            toast({ title: `Order updated: ${milestoneToUpdate.name}` });
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Update failed", description: "Could not update order status."});
        } finally {
            setIsUpdating(false);
        }
    };


    return (
        <Card>
            <CardHeader>
                <CardTitle>{order.customerName}</CardTitle>
                <CardDescription>ID: {order.id}</CardDescription>
                <Badge className="w-fit mt-1" variant="outline">{order.orderType.replace('+', ' + ')}</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /><span>{order.customerAddress}</span></div>
                <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /><span>{order.customerPhone}</span></div>
                
                {nextInstallerMilestone && (
                     <div className="pt-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">Next Step</p>
                        <p className="font-medium">{nextInstallerMilestone.name}</p>
                    </div>
                )}

                {nextInstallerMilestone && (
                    <Button 
                        className="w-full mt-2" 
                        onClick={() => handleStatusUpdate(nextInstallerMilestone)}
                        disabled={isUpdating || !canUpdate(nextInstallerMilestone)}
                    >
                        {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Mark as &quot;{nextInstallerMilestone.name}&quot;
                    </Button>
                )}

                {!nextInstallerMilestone && order.milestones.every(m => m.completed) && (
                    <p className="text-sm text-accent font-semibold text-center pt-4">This order is complete.</p>
                )}

                 {!nextInstallerMilestone && !order.milestones.every(m => m.completed) && (
                    <p className="text-sm text-muted-foreground text-center pt-4">Waiting for other departments to complete their tasks.</p>
                 )}
            </CardContent>
        </Card>
    );
}
