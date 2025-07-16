
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Order, User, Milestone } from "@/lib/types";
import { MoreVertical, User as UserIcon, Phone, MapPin, Tag, Trash2, ChevronDown, ChevronUp, CheckCircle2, PackageCheck, Wrench as WrenchIcon, CalendarClock } from "lucide-react";
import { MilestoneProgress } from "./MilestoneProgress";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { AssignInstallerDialog } from "./AssignInstallerDialog";
import { ScheduleDialog } from "./ScheduleDialog";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";

interface OrderCardProps {
  order: Order;
  onUpdate: (updatedOrder: Order) => void;
  allUsers: User[];
}

export function OrderCard({ order, onUpdate, allUsers }: OrderCardProps) {
  const [showMilestones, setShowMilestones] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const { user, role } = useAuth();
  const { toast } = useToast();

  const installers = allUsers.filter(u => u.role === 'installer');
  const assignedInstaller = allUsers.find(u => u.id === order.assignedTo);
  const completedCount = order.milestones.filter(m => m.completed).length;
  const progressPercentage = (completedCount / order.milestones.length) * 100;
  
  const lastCompletedMilestone = order.milestones.slice().reverse().find(m => m.completed);

  const handleMilestoneChange = async (milestoneId: number, completed: boolean) => {
    if (role === 'employee') {
        toast({ variant: "destructive", title: "Permission Denied", description: "You are not authorized to change milestones." });
        return;
    }
    
    try {
      const orderRef = doc(db, "orders", order.id);
      let updatedMilestones = order.milestones.map(m =>
        m.id === milestoneId ? { ...m, completed, completedAt: completed ? new Date().toISOString() : undefined, completedBy: user?.name } : m
      );
      
      // If un-checking a milestone, un-check all subsequent milestones
      if (!completed) {
          const milestoneIndex = updatedMilestones.findIndex(m => m.id === milestoneId);
          if (milestoneIndex !== -1) {
              for (let i = milestoneIndex + 1; i < updatedMilestones.length; i++) {
                  updatedMilestones[i] = { ...updatedMilestones[i], completed: false, completedAt: undefined, completedBy: undefined };
              }
          }
      }
      
      const updatedOrder = { ...order, milestones: updatedMilestones };
      await updateDoc(orderRef, { milestones: updatedMilestones });
      onUpdate(updatedOrder); 
      toast({ title: "Milestone updated!" });
    } catch (error) {
      console.error("Error updating milestone: ", error);
      toast({ variant: "destructive", title: "Failed to update milestone." });
    }
  };
  
  const handleAssignInstaller = async (installerId: string) => {
    try {
      const orderRef = doc(db, "orders", order.id);
      await updateDoc(orderRef, { assignedTo: installerId });
      const updatedOrder = { ...order, assignedTo: installerId };
      onUpdate(updatedOrder);
      setIsAssigning(false);
      toast({ title: "Installer assigned!" });
    } catch (error) {
      console.error("Error assigning installer: ", error);
      toast({ variant: "destructive", title: "Failed to assign installer." });
    }
  };
  
  const handleSchedule = async (date: Date) => {
    try {
      const orderRef = doc(db, "orders", order.id);
      const scheduledMilestoneId = order.orderType === 'stitching+installation' ? 6 : 7;
      const updatedMilestones = order.milestones.map(m =>
        m.id === scheduledMilestoneId ? { ...m, completed: true, completedAt: date.toISOString(), completedBy: user?.name } : m
      );
      const updatedOrder = { ...order, milestones: updatedMilestones };
      await updateDoc(orderRef, { milestones: updatedMilestones });
      onUpdate(updatedOrder);
      setIsScheduling(false);
      toast({ title: "Order scheduled!" });
    } catch (error) {
      console.error("Error scheduling order: ", error);
      toast({ variant: "destructive", title: "Failed to schedule order." });
    }
  }

  const handleDeleteOrder = async () => {
     // This would typically involve a call to delete the document in Firestore
     console.log(`Deleting order ${order.id}`);
     toast({
        title: "Order Deleted",
        description: `${order.id} has been deleted. (Simulation)`,
      });
  }

  const getStatusInfo = () => {
    if (progressPercentage === 100) {
      return { text: "Completed", icon: CheckCircle2, color: "text-accent" };
    }
    const installScheduled = order.milestones.find(m => m.id === 6)?.completed;
    const deliveryScheduled = order.milestones.find(m => m.id === 7)?.completed;

    if (installScheduled || deliveryScheduled) {
        return { text: "Scheduled", icon: CalendarClock, color: "text-blue-500" };
    }
     if (order.milestones.find(m => m.id === 5)?.completed) {
      return { text: "Ready for Delivery", icon: PackageCheck, color: "text-orange-500" };
    }
    if (order.assignedTo) {
      return { text: "Assigned", icon: UserIcon, color: "text-purple-500" };
    }
    return { text: "In Progress", icon: WrenchIcon, color: "text-muted-foreground" };
  };

  const status = getStatusInfo();
  const StatusIcon = status.icon;
  const isEmployee = role === 'employee';

  const scheduledDate = order.milestones.find(m => (m.id === 6 || m.id === 7) && m.completed)?.completedAt;
  const createdAtDate = order.createdAt ? new Date(order.createdAt) : new Date();

  return (
    <>
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
            <div>
                <CardTitle>{order.customerName}</CardTitle>
                <CardDescription>ID: {order.id}</CardDescription>
            </div>
            { !isEmployee && (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      onClick={handleDeleteOrder}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />Delete Order
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            )}
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
                    <UserIcon className="h-4 w-4" />
                    <span>Installer: {assignedInstaller?.name || 'Unassigned'}</span>
                </div>
            </div>
        </div>
        
        {scheduledDate && (
             <div className="text-sm flex items-center gap-2 text-muted-foreground pt-2">
                <CalendarClock className="h-4 w-4 text-blue-500" />
                <span>Scheduled: {new Date(scheduledDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
        )}

        <Separator />
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-2 font-semibold ${status.color}`}>
              <StatusIcon className="h-5 w-5" />
              <span>{status.text}</span>
            </div>
             <Button variant="ghost" size="sm" onClick={() => setShowMilestones(!showMilestones)}>
              Milestones
              {showMilestones ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        </div>
        
        {showMilestones && (
             <div className="space-y-2 pt-4">
                <div className="flex justify-between items-center">
                    <h4 className="font-semibold">Milestone Progress</h4>
                    <Badge variant={order.orderType === 'delivery' ? 'default' : order.orderType === 'stitching' ? 'secondary' : 'outline'}>{order.orderType.replace('+', ' + ')}</Badge>
                </div>
                <MilestoneProgress milestones={order.milestones} onMilestoneChange={handleMilestoneChange} role={role} />
            </div>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 pt-4">
         <div className="text-xs text-muted-foreground">
            Created on {createdAtDate.toLocaleDateString()}
        </div>
         {!isEmployee && (
            <div className="w-full flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="w-full" onClick={() => setIsAssigning(true)}>
                    <UserIcon className="mr-2 h-4 w-4" />
                    {assignedInstaller ? "Re-assign" : "Assign"}
                </Button>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setIsScheduling(true)} disabled={!order.assignedTo}>
                    <CalendarClock className="mr-2 h-4 w-4" />
                    Schedule
                </Button>
            </div>
        )}
      </CardFooter>
    </Card>
    <AssignInstallerDialog
        isOpen={isAssigning}
        onClose={() => setIsAssigning(false)}
        onAssign={handleAssignInstaller}
        installers={installers}
        currentInstallerId={order.assignedTo}
    />
    <ScheduleDialog
        isOpen={isScheduling}
        onClose={() => setIsScheduling(false)}
        onSchedule={handleSchedule}
        orderType={order.orderType}
    />
    </>
  );
}
