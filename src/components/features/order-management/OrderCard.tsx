

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Order, User, Milestone, PurchaseRequest, FabricDetail, O2DStatus } from "@/lib/types";
import { MoreVertical, User as UserIcon, Phone, MapPin, Tag, Trash2, ChevronDown, ChevronUp, CheckCircle2, PackageCheck, Wrench as WrenchIcon, CalendarClock, TrendingUp, Users, MessageSquare, Star, RefreshCw, Loader2, AlertCircle, ShoppingBag } from "lucide-react";
import { MilestoneProgress } from "./MilestoneProgress";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { AssignInstallerDialog } from "./AssignInstallerDialog";
import { ScheduleDialog } from "./ScheduleDialog";
import { doc, updateDoc, deleteDoc, getDoc, query, where, getDocs, collection, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { AssignCrmDialog } from "./AssignCrmDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


interface OrderCardProps {
  order: Order;
  onUpdate: (updatedOrder: Order) => void;
  allUsers: User[];
}

interface MaterialDetails {
    fabricDetails: { name: string; quantity: string; unit: string; }[];
}

export function OrderCard({ order, onUpdate, allUsers }: OrderCardProps) {
  const [showMilestones, setShowMilestones] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isAssigningCrm, setIsAssigningCrm] = useState(false);
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false);
  const [isMaterialDialogOpen, setIsMaterialDialogOpen] = useState(false);
  const [materialDetails, setMaterialDetails] = useState<MaterialDetails | null>(null);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(order);
  const [isDeleting, setIsDeleting] = useState(false);

  const { user, role } = useAuth();
  const { toast } = useToast();

  const installers = allUsers.filter(u => u.role === 'installer');
  const crmUsers = allUsers.filter(u => u.designation === 'CRM');
  const assignedInstaller = allUsers.find(u => u.id === currentOrder.assignedTo);
  const crmHandler = allUsers.find(u => u.id === currentOrder.handledByCrm);
  
  const completedCount = currentOrder.milestones.filter(m => m.completed).length;
  const progressPercentage = (completedCount / currentOrder.milestones.length) * 100;
  
  const lastCompletedMilestone = currentOrder.milestones.slice().reverse().find(m => m.completed);
  const isReadyForDelivery = !!currentOrder.milestones.find(m => m.id === 5)?.completed;

  const isOrderComplete = currentOrder.milestones.every(m => m.completed) && (!!currentOrder.feedbackRating || !!currentOrder.customerFeedbackRating || !!currentOrder.bypassedOtp);

  const handleShowMaterial = async () => {
    setIsMaterialDialogOpen(true);
    setMaterialLoading(true);
    try {
        const purchaseRequestRef = doc(db, "purchaseRequests", currentOrder.crmOrderNo);
        const purchaseRequestSnap = await getDoc(purchaseRequestRef);

        if (purchaseRequestSnap.exists()) {
            const prData = purchaseRequestSnap.data() as PurchaseRequest;
            const fabricDetails = (prData.fabricDetails || [])
                .filter(f => f.fabricName)
                .map(f => ({ name: f.fabricName, quantity: f.quantity, unit: 'Mtr' }));
            
            setMaterialDetails({ fabricDetails });
        } else {
            // If no PR, use details from the order itself
            const fabricDetails = (currentOrder.fabricDetails || []).map(f => ({
                name: f.fabricName,
                quantity: f.quantity,
                unit: 'Mtr'
            }));
             setMaterialDetails({ fabricDetails });
        }
    } catch (e) {
        console.error("Error fetching material details: ", e);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch material details.' });
    } finally {
        setMaterialLoading(false);
    }
  };

  // Permissions Logic
  const canAssignCrm = (role === 'admin' || user?.designation === 'PC') && !isOrderComplete;
  const canAssignInstaller = ((role === 'admin' || user?.designation === 'PC' || user?.designation === 'CRM') && isReadyForDelivery) && !isOrderComplete;
  const canSchedule = (role === 'admin' || user?.designation === 'PC' || user?.designation === 'CRM') && !isOrderComplete;
  const canEditMilestones = (role === 'admin' || role === 'employee') && !isOrderComplete;
  const canSendMessage = (role === 'admin' || user?.designation === 'PC') && !isOrderComplete;
  const canDeleteOrder = role === 'admin';


  const handleMilestoneChange = async (milestoneId: number, completed: boolean) => {
    if (!canEditMilestones) {
        toast({ variant: "destructive", title: "Permission Denied", description: "You are not authorized to change milestones." });
        return;
    }
    
    // Employees can only tick up to 'Ready for Delivery'
    if (role === 'employee' && milestoneId > 5) {
        toast({ variant: "destructive", title: "Permission Denied", description: "This milestone is updated by installers." });
        return;
    }

    // Employees cannot revert milestones
    if (role === 'employee' && !completed && currentOrder.milestones.find(m => m.id === milestoneId)?.completed) {
        toast({ variant: "destructive", title: "Permission Denied", description: "You are not authorized to revert milestones." });
        return;
    }
    
    try {
      const orderRef = doc(db, "orders", currentOrder.id);
      let updatedMilestones = currentOrder.milestones.map(m =>
        m.id === milestoneId ? { ...m, completed, completedAt: completed ? new Date().toISOString() : null, completedBy: completed ? user?.name : null, location: null } : m
      );
      
      // If un-checking a milestone, un-check all subsequent milestones
      if (!completed) {
          const milestoneIndex = updatedMilestones.findIndex(m => m.id === milestoneId);
          if (milestoneIndex !== -1) {
              for (let i = milestoneIndex + 1; i < updatedMilestones.length; i++) {
                  updatedMilestones[i] = { ...updatedMilestones[i], completed: false, completedAt: null, completedBy: null, location: null };
              }
          }
      }

      const updatePayload: any = { milestones: updatedMilestones };

      // Generate OTP when order is first received
      if (milestoneId === 1 && completed && !currentOrder.otp) {
        updatePayload.otp = Math.floor(1000 + Math.random() * 9000).toString();
        toast({ title: `Order ${currentOrder.id} Acknowledged`, description: `Generated OTP: ${updatePayload.otp}` });
      }
      
      // Update O2D when "Stitching Done" is completed
      if (milestoneId === 4 && completed && currentOrder.dealId) {
        const o2dQuery = query(collection(db, "o2d"), where("dealId", "==", currentOrder.dealId));
        const o2dSnapshot = await getDocs(o2dQuery);
        if (!o2dSnapshot.empty) {
            const o2dDocRef = o2dSnapshot.docs[0].ref;
            const fullKitingMilestone: O2DStatus = {
                stepId: 9, // 'Full Kiting'
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: user?.name || "System",
                remarks: "Automatically completed with Stitching Done.",
                selection: "Done"
            };
            await updateDoc(o2dDocRef, {
                milestones: arrayUnion(fullKitingMilestone)
            });
             toast({ title: "O2D Step Automated", description: `Full Kiting marked as done for deal ${currentOrder.dealId}.` });
        }
      }

      const updatedOrder = { ...currentOrder, ...updatePayload };
      await updateDoc(orderRef, updatePayload);
      onUpdate(updatedOrder); 
      setCurrentOrder(updatedOrder);
      toast({ title: "Milestone updated!" });
    } catch (error) {
      console.error("Error updating milestone: ", error);
      toast({ variant: "destructive", title: "Failed to update milestone." });
    }
  };
  
  const handleAssignInstaller = async (installerId: string) => {
    try {
      const orderRef = doc(db, "orders", currentOrder.id);
      await updateDoc(orderRef, { assignedTo: installerId });
      const updatedOrder = { ...currentOrder, assignedTo: installerId };
      onUpdate(updatedOrder);
      setCurrentOrder(updatedOrder);
      setIsAssigning(false);
      toast({ title: "Installer assigned!" });
    } catch (error) {
      console.error("Error assigning installer: ", error);
      toast({ variant: "destructive", title: "Failed to assign installer." });
    }
  };

  const handleAssignCrm = async (crmUserId: string) => {
    try {
      const orderRef = doc(db, "orders", currentOrder.id);
      await updateDoc(orderRef, { handledByCrm: crmUserId });
      const updatedOrder = { ...currentOrder, handledByCrm: crmUserId };
      onUpdate(updatedOrder);
      setCurrentOrder(updatedOrder);
      setIsAssigningCrm(false);
      toast({ title: "CRM handler assigned!" });
    } catch (error) {
      console.error("Error assigning CRM handler: ", error);
      toast({ variant: "destructive", title: "Failed to assign CRM handler." });
    }
  };
  
  const handleSchedule = async (date: Date) => {
    try {
      const orderRef = doc(db, "orders", currentOrder.id);
      const scheduledMilestoneId = currentOrder.orderType === 'stitching+installation' ? 6 : 7;
      const updatedMilestones = currentOrder.milestones.map(m =>
        m.id === scheduledMilestoneId ? { ...m, completed: true, completedAt: date.toISOString(), completedBy: user?.name } : m
      );
      const updatedOrder = { ...currentOrder, milestones: updatedMilestones };
      await updateDoc(orderRef, { milestones: updatedMilestones });

      // Find the O2D document and update it
      if (currentOrder.dealId) {
        const o2dQuery = query(collection(db, "o2d"), where("dealId", "==", currentOrder.dealId));
        const o2dSnapshot = await getDocs(o2dQuery);
        if (!o2dSnapshot.empty) {
          const o2dDocRef = o2dSnapshot.docs[0].ref;
          const scheduleMilestone: O2DStatus = {
            stepId: 12, // 'Installation/Delivery Schedule'
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: user?.name || "System",
            remarks: "Automatically completed when scheduled from dashboard.",
            selection: "Done"
          };
          await updateDoc(o2dDocRef, {
            milestones: arrayUnion(scheduleMilestone)
          });
        }
      }

      onUpdate(updatedOrder);
      setCurrentOrder(updatedOrder);
      setIsScheduling(false);
      toast({ title: "Order scheduled!" });
    } catch (error) {
      console.error("Error scheduling order: ", error);
      toast({ variant: "destructive", title: "Failed to schedule order." });
    }
  };

  const handleDeleteOrder = async () => {
    if (!canDeleteOrder) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "orders", currentOrder.id));
      toast({
        title: "Order Deleted",
        description: `${currentOrder.id} has been permanently deleted.`,
      });
      // The onSnapshot listener in the parent component will handle UI updates.
    } catch (error) {
      console.error("Error deleting order:", error);
      toast({
        variant: "destructive",
        title: "Deletion Failed",
        description: "Could not delete the order.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenMessageDialog = async () => {
    let orderToMessage = { ...currentOrder };
    if (!orderToMessage.otp) {
        try {
            const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
            const orderRef = doc(db, "orders", currentOrder.id);
            await updateDoc(orderRef, { otp: newOtp });
            orderToMessage.otp = newOtp;
            setCurrentOrder(orderToMessage);
            onUpdate(orderToMessage);
            toast({ title: "OTP Generated!", description: `New OTP for ${currentOrder.id} is ${newOtp}` });
        } catch (error) {
            console.error("Error generating OTP:", error);
            toast({ variant: "destructive", title: "Failed to generate OTP" });
            return;
        }
    }
    setIsMessageDialogOpen(true);
  }

  const handleRefresh = () => {
    setIsRefreshing(true);
    // This is a simulated refresh for user experience.
    setTimeout(() => {
        setIsRefreshing(false);
        toast({title: "Data is up to date."});
    }, 700);
  }

  const getStatusInfo = () => {
    if (progressPercentage === 100) {
      return { text: "Completed", icon: CheckCircle2, color: "text-accent" };
    }
    const installScheduled = currentOrder.milestones.find(m => m.id === 6)?.completed;
    const deliveryScheduled = currentOrder.milestones.find(m => m.id === 7)?.completed;

    if (installScheduled || deliveryScheduled) {
        return { text: "Scheduled", icon: CalendarClock, color: "text-blue-500" };
    }
     if (isReadyForDelivery) {
      return { text: "Ready for Delivery", icon: PackageCheck, color: "text-orange-500" };
    }
    if (currentOrder.assignedTo) {
      return { text: "Assigned", icon: UserIcon, color: "text-purple-500" };
    }
    return { text: "In Progress", icon: WrenchIcon, color: "text-muted-foreground" };
  };

  const status = getStatusInfo();
  const StatusIcon = status.icon;

  const scheduledDate = currentOrder.milestones.find(m => (m.id === 6 || m.id === 7) && m.completed)?.completedAt;
  const createdAtDate = currentOrder.createdAt ? new Date(currentOrder.createdAt) : new Date();

  const customerMessage = `Hi ${currentOrder.customerName},\n\nThank you for your order with Mo Design!\n\nYour tracking number is: ${currentOrder.id}\nYour OTP for feedback submission is: ${currentOrder.otp}\nPlease share this OTP only with our installer after the job is complete.\n\nYou can track the live status of your order here:\n${typeof window !== 'undefined' ? window.location.origin : ''}/track?code=${currentOrder.id}\n\nWe look forward to serving you!\n- The MoTrack Team`;

  const hasFeedback = currentOrder.feedbackRating || currentOrder.customerFeedbackRating || currentOrder.bypassedOtp;

  return (
    <TooltipProvider>
    <Card className="flex flex-col">
      <CardHeader className="p-3">
        <div className="flex items-start justify-between">
            <div className="flex-grow">
                <CardTitle><span className="text-primary">{currentOrder.customerName}</span></CardTitle>
                <CardDescription>ID: {currentOrder.id}</CardDescription>
            </div>
            <div className="flex items-center gap-1">
                 <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
                    {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
                { canDeleteOrder && (
                <AlertDialog>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem 
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />Delete Order
                                </DropdownMenuItem>
                            </AlertDialogTrigger>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the order for <span className="font-bold">{currentOrder.customerName}</span>.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteOrder} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                )}
            </div>
        </div>
      </CardHeader>
      <CardContent className="flex-grow space-y-3 p-3 pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /><span>{currentOrder.customerPhone}</span></div>
                <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /><span>{currentOrder.customerAddress}</span></div>
            </div>
            <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground"><Tag className="h-4 w-4" /><span>Sales: {currentOrder.salesPerson}</span></div>
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>CRM: <span className="font-medium text-purple-600">{crmHandler?.name || 'Unassigned'}</span></span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                    <UserIcon className="h-4 w-4" />
                    <span>Installer: <span className="font-medium text-indigo-600">{assignedInstaller?.name || 'Unassigned'}</span></span>
                </div>
            </div>
        </div>

        {scheduledDate && (
             <div className="text-sm flex items-center gap-2 text-blue-500 font-medium pt-1">
                <CalendarClock className="h-4 w-4" />
                <span>Scheduled: {new Date(scheduledDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
        )}

        <div className={`flex items-center gap-2 font-semibold ${status.color}`}>
            <TrendingUp className="h-4 w-4" />
            <span>Status: {lastCompletedMilestone?.name || "Order Received"}</span>
        </div>
        
        {hasFeedback && (
            <>
                <Separator className="my-1" />
                <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Feedback</h4>
                    {currentOrder.bypassedOtp && (
                        <div className="flex items-center gap-2 text-orange-500 p-2 border border-orange-500/30 bg-orange-500/10 rounded-md">
                            <AlertCircle className="h-4 w-4"/>
                            <p className="text-xs font-medium">Feedback submitted without customer OTP.</p>
                        </div>
                    )}
                    {currentOrder.feedbackRating && (
                        <div>
                            <p className="text-xs font-medium">Installer Feedback</p>
                             <div className="flex items-center gap-1">
                                {[1,2,3,4,5].map(star => (
                                    <Star key={star} className={cn("h-4 w-4", currentOrder.feedbackRating! >= star ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground")}/>
                                ))}
                            </div>
                            {currentOrder.feedbackRemarks && <p className="text-xs text-muted-foreground mt-1 p-1.5 border rounded-md bg-muted/50">"{currentOrder.feedbackRemarks}"</p>}
                        </div>
                    )}
                     {currentOrder.customerFeedbackRating && (
                        <div>
                            <p className="text-xs font-medium">Customer Feedback</p>
                             <div className="flex items-center gap-1">
                                {[1,2,3,4,5].map(star => (
                                    <Star key={star} className={cn("h-4 w-4", currentOrder.customerFeedbackRating! >= star ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground")}/>
                                ))}
                            </div>
                            {currentOrder.customerFeedbackRemarks && <p className="text-xs text-muted-foreground mt-1 p-1.5 border rounded-md bg-muted/50">"{currentOrder.customerFeedbackRemarks}"</p>}
                        </div>
                    )}
                </div>
            </>
        )}

        <Separator className="my-1" />
        
        <div className="space-y-1">
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
             <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center">
                    <h4 className="font-semibold">Milestone Progress</h4>
                    <Badge variant={currentOrder.orderType === 'delivery' ? 'default' : currentOrder.orderType === 'stitching' ? 'secondary' : 'outline'}>{currentOrder.orderType.replace('+', ' + ')}</Badge>
                </div>
                <MilestoneProgress milestones={currentOrder.milestones} onMilestoneChange={handleMilestoneChange} role={role} />
            </div>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 p-3 pt-0">
         <div className="text-xs text-muted-foreground">
            Created on {createdAtDate.toLocaleDateString()}
        </div>
         {(canAssignCrm || canAssignInstaller || canSchedule || canSendMessage) && (
            <div className="w-full [column-count:2] sm:[column-count:3] lg:[column-count:5] [column-gap:0.5rem] pt-2">
                <div className="break-inside-avoid mb-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full" onClick={handleShowMaterial}>
                                <ShoppingBag className="mr-2 h-4 w-4" />
                                Material
                            </Button>
                        </TooltipTrigger>
                    </Tooltip>
                </div>

                <div className="break-inside-avoid mb-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full" onClick={() => setIsAssigningCrm(true)} disabled={!canAssignCrm}>
                                <Users className="mr-2 h-4 w-4" />
                                Assign CRM
                            </Button>
                        </TooltipTrigger>
                        {!canAssignCrm && <TooltipContent><p>{isOrderComplete ? 'Order is complete' : "You don't have permission."}</p></TooltipContent>}
                    </Tooltip>
                </div>

                <div className="break-inside-avoid mb-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full" onClick={() => setIsAssigning(true)} disabled={!canAssignInstaller}>
                                <UserIcon className="mr-2 h-4 w-4" />
                                {assignedInstaller ? "Re-assign" : "Assign"}
                            </Button>
                        </TooltipTrigger>
                        {isOrderComplete ? <TooltipContent><p>Order is complete.</p></TooltipContent> : !isReadyForDelivery && <TooltipContent><p>Mark "Ready for Delivery" to assign.</p></TooltipContent>}
                        {isReadyForDelivery && !canAssignInstaller && <TooltipContent><p>You don't have permission to assign installers.</p></TooltipContent>}
                    </Tooltip>
                </div>
                
                <div className="break-inside-avoid mb-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full" onClick={() => setIsScheduling(true)} disabled={!canSchedule}>
                                <CalendarClock className="mr-2 h-4 w-4" />
                                Schedule
                            </Button>
                        </TooltipTrigger>
                        {!canSchedule && <TooltipContent><p>{isOrderComplete ? 'Order is complete' : "You don't have permission."}</p></TooltipContent>}
                    </Tooltip>
                </div>

                <div className="break-inside-avoid mb-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full" onClick={handleOpenMessageDialog} disabled={!canSendMessage}>
                                <MessageSquare className="mr-2 h-4 w-4" />
                                Message
                            </Button>
                        </TooltipTrigger>
                        {!canSendMessage && <TooltipContent><p>{isOrderComplete ? 'Order is complete' : "You don't have permission."}</p></TooltipContent>}
                    </Tooltip>
                </div>
            </div>
        )}
      </CardFooter>
    </Card>
    <AssignInstallerDialog
        isOpen={isAssigning}
        onClose={() => setIsAssigning(false)}
        onAssign={handleAssignInstaller}
        installers={installers}
        currentInstallerId={currentOrder.assignedTo}
    />
     <AssignCrmDialog
        isOpen={isAssigningCrm}
        onClose={() => setIsAssigningCrm(false)}
        onAssign={handleAssignCrm}
        crmUsers={crmUsers}
        currentCrmUserId={currentOrder.handledByCrm}
    />
    <ScheduleDialog
        isOpen={isScheduling}
        onClose={() => setIsScheduling(false)}
        onSchedule={handleSchedule}
        orderType={currentOrder.orderType}
    />
    <Dialog open={isMessageDialogOpen} onOpenChange={setIsMessageDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Message Customer</DialogTitle>
                <DialogDescription>
                    This is a preview of the message to be sent to the customer.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <Textarea
                    readOnly
                    value={customerMessage}
                    className="min-h-60 text-sm whitespace-pre-wrap"
                />
                 <Button onClick={() => {
                     navigator.clipboard.writeText(customerMessage);
                     toast({title: "Copied to clipboard!"})
                 }}>
                    Copy Message
                 </Button>
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setIsMessageDialogOpen(false)}>Close</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    <Dialog open={isMaterialDialogOpen} onOpenChange={setIsMaterialDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Material Details for {currentOrder.id}</DialogTitle>
                <DialogDescription>Items requested for this order.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
                {materialLoading ? (
                    <div className="flex justify-center items-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                ) : (
                    <div className="space-y-2 text-sm max-h-60 overflow-y-auto">
                        {(materialDetails?.fabricDetails || []).length > 0 ? (
                            materialDetails?.fabricDetails.map((item, index) => (
                                <div key={index} className="flex justify-between items-center p-2 rounded-md bg-muted">
                                    <span>{item.name}</span>
                                    <span className="font-mono bg-background px-2 py-1 rounded-sm">{item.quantity} {item.unit}</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-muted-foreground text-center">No material details found.</p>
                        )}
                    </div>
                )}
            </div>
            <DialogFooter>
                <Button onClick={() => setIsMaterialDialogOpen(false)}>Close</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </TooltipProvider>
  );
}
