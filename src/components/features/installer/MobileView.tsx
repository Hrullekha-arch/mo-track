"use client";

import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Phone, MapPin } from "lucide-react";
import { mockOrders } from "@/lib/mock-data";
import { Order } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export function MobileView() {
  const { user, logout } = useAuth();
  const assignedOrders = mockOrders.filter(o => o.assignedTo === user?.id);

  // Filter for active orders (not fully completed)
  const activeOrders = assignedOrders.filter(o => o.milestones.some(m => !m.completed));

  const handleStatusUpdate = (orderId: string, milestoneId: number) => {
    // In a real app, this would call an API
    console.log(`Updating order ${orderId}, milestone ${milestoneId}`);
    alert(`Status updated for order ${orderId}!`);
  };

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={user?.avatarUrl} />
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
        <p className="text-muted-foreground">Here are your assignments for today.</p>
      </div>

      {activeOrders.length > 0 ? (
        <div className="space-y-4">
          {activeOrders.map(order => (
            <InstallerOrderCard key={order.id} order={order} onUpdate={handleStatusUpdate} />
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
    onUpdate: (orderId: string, milestoneId: number) => void;
}

function InstallerOrderCard({ order, onUpdate }: InstallerOrderCardProps) {
    const nextMilestone = order.milestones.find(m => !m.completed);
    const installerMilestones = [7, 8]; // Milestones installers can update
    const nextInstallerMilestone = order.milestones.find(m => installerMilestones.includes(m.id) && !m.completed);

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
                
                {nextMilestone && (
                     <div className="pt-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">Next Step</p>
                        <p className="font-medium">{nextMilestone.name}</p>
                    </div>
                )}

                {nextInstallerMilestone && (
                    <Button className="w-full mt-2" onClick={() => onUpdate(order.id, nextInstallerMilestone.id)}>
                        Mark as &quot;{nextInstallerMilestone.name}&quot;
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
