"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { mockUsers } from "@/lib/mock-data";
import { Order, Milestone } from "@/lib/types";
import { MoreVertical, User, Phone, MapPin, Tag, Wrench, Trash2, ChevronDown, ChevronUp, CheckCircle2, PackageCheck, Rocket, Wrench as WrenchIcon } from "lucide-react";
import { MilestoneProgress } from "./MilestoneProgress";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";

interface OrderCardProps {
  order: Order;
  onUpdate: (updatedOrder: Order) => void;
}

export function OrderCard({ order: initialOrder, onUpdate }: OrderCardProps) {
  const [order, setOrder] = useState(initialOrder);
  const [showMilestones, setShowMilestones] = useState(false);
  const { role } = useAuth();
  const assignedInstaller = mockUsers.find(u => u.id === order.assignedTo);
  const completedCount = order.milestones.filter(m => m.completed).length;
  const progressPercentage = (completedCount / order.milestones.length) * 100;
  
  const lastCompletedMilestone = order.milestones.slice().reverse().find(m => m.completed);


  const handleMilestoneChange = (milestoneId: number, completed: boolean) => {
    const updatedMilestones = order.milestones.map(m =>
      m.id === milestoneId ? { ...m, completed, completedAt: completed ? new Date().toISOString() : undefined } : m
    );
    // Logic to update subsequent milestones if one is unchecked
    if (!completed) {
        let subsequentMilestone = false;
        const finalMilestones = updatedMilestones.map(m => {
            if (subsequentMilestone) {
                return {...m, completed: false, completedAt: undefined};
            }
            if (m.id === milestoneId) subsequentMilestone = true;
            return m;
        });
        setOrder(prev => ({ ...prev, milestones: finalMilestones }));
    } else {
       setOrder(prev => ({ ...prev, milestones: updatedMilestones }));
    }
  };

  const getStatusInfo = () => {
    if (progressPercentage === 100) {
      return { text: "Completed", icon: CheckCircle2, color: "text-accent" };
    }
    if (order.orderType === 'stitching+installation' && order.milestones.find(m => m.id === 6)?.completed) {
        return { text: "Installation Scheduled", icon: WrenchIcon, color: "text-blue-500" };
    }
     if (order.milestones.find(m => m.id === 5)?.completed) {
      return { text: "Ready for Delivery", icon: PackageCheck, color: "text-orange-500" };
    }
     if (order.milestones.find(m => m.id === 7)?.completed) {
      return { text: "Out for Delivery", icon: Rocket, color: "text-purple-500" };
    }
    return { text: "In Progress", icon: WrenchIcon, color: "text-muted-foreground" };
  };

  const status = getStatusInfo();
  const StatusIcon = status.icon;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
            <div>
                <CardTitle>{order.customerName}</CardTitle>
                <CardDescription>ID: {order.id}</CardDescription>
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem><Wrench className="mr-2 h-4 w-4" />Assign Installer</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
                        <Trash2 className="mr-2 h-4 w-4" />Delete Order
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="flex-grow space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /><span>{order.customerPhone}</span></div>
                <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /><span>{order.customerAddress}</span></div>
            </div>
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground"><Tag className="h-4 w-4" /><span>Sales: {order.salesPerson}</span></div>
                <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>Installer: {assignedInstaller?.name || 'Unassigned'}</span>
                </div>
            </div>
        </div>
        <Separator />
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-2 font-semibold ${status.color}`}>
              <StatusIcon className="h-5 w-5" />
              <span>{status.text}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowMilestones(!showMilestones)}>
              Details
              {showMilestones ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
            </Button>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5">
            <div className="bg-accent h-2.5 rounded-full" style={{ width: `${progressPercentage}%` }}></div>
          </div>
           {lastCompletedMilestone && (
              <p className="text-xs text-muted-foreground">Last update: {lastCompletedMilestone.name}</p>
            )}
        </div>
        
        {showMilestones && (
             <div className="space-y-2 pt-4">
                <div className="flex justify-between items-center">
                    <h4 className="font-semibold">Milestones</h4>
                    <Badge variant={order.orderType === 'delivery' ? 'default' : order.orderType === 'stitching' ? 'secondary' : 'outline'}>{order.orderType.replace('+', ' + ')}</Badge>
                </div>
                <MilestoneProgress milestones={order.milestones} onMilestoneChange={handleMilestoneChange} role={role} />
            </div>
        )}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        <p>Created on {new Date(order.createdAt).toLocaleDateString()}</p>
      </CardFooter>
    </Card>
  );
}
