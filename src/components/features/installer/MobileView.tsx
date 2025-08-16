

"use client";

import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Phone, MapPin, Loader2, AlertTriangle, Star, CheckCheck, RefreshCw, Milestone, CalendarCheck, ArrowRight, Truck } from "lucide-react";
import { Order, Milestone, DealVisit, User, Customer, Deal, O2DStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, where, doc, updateDoc, writeBatch, getDocs, limit, collectionGroup, getDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { useRouter } from "next/navigation";


type InstallerTask = 
    | { type: 'order'; data: Order }
    | { type: 'visit'; data: EnrichedInstallerVisit };

interface EnrichedInstallerVisit extends DealVisit {
    customer: Customer | null;
    deal: Deal | null;
    dealDocId: string;
    customerId: string;
}

export function MobileView() {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState<InstallerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setLocationError(null);
        },
        (error) => {
          setLocationError(error.message);
        }
      );
    } else {
      setLocationError("Geolocation is not supported by this browser.");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    // Fetch Orders
    const ordersQuery = query(collection(db, "orders"), where("assignedTo", "==", user.id));
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        setTasks(prevTasks => {
            const otherTasks = prevTasks.filter(t => t.type !== 'order');
            const newOrderTasks: InstallerTask[] = ordersData.map(o => ({ type: 'order', data: o }));
            return [...otherTasks, ...newOrderTasks];
        });
        setLoading(false);
    });
    
    // Fetch Visits
    const visitsQuery = query(
        collectionGroup(db, "visits"),
        where("assignedTo", "==", user.id),
        where("status", "!=", "completed")
    );
     const unsubscribeVisits = onSnapshot(visitsQuery, async (snapshot) => {
        const customerCache = new Map<string, Customer>();
        const dealCache = new Map<string, Deal>();
        
        const visitsDataPromises = snapshot.docs.map(async (docSnap) => {
            const visit = docSnap.data() as DealVisit;
            const pathParts = docSnap.ref.path.split('/');
            const customerId = pathParts[1];
            const dealDocId = pathParts[3];

            let customerData: Customer | null = customerCache.get(customerId) || null;
            if (!customerData) {
                const customerRef = doc(db, 'customers', customerId);
                const customerSnap = await getDoc(customerRef);
                if (customerSnap.exists()) {
                    customerData = { id: customerSnap.id, ...customerSnap.data() } as Customer;
                    customerCache.set(customerId, customerData);
                }
            }
            
            const dealCacheKey = `${customerId}-${dealDocId}`;
            let dealData: Deal | null = dealCache.get(dealCacheKey) || null;
            if (!dealData) {
                    const dealRef = doc(db, 'customers', customerId, 'deals', dealDocId);
                    const dealSnap = await getDoc(dealRef);
                    if (dealSnap.exists()) {
                    dealData = { id: dealSnap.id, ...dealSnap.data() } as Deal;
                    dealCache.set(dealCacheKey, dealData);
                }
            }

            return {
                ...visit,
                id: docSnap.id,
                customer: customerData,
                deal: dealData,
                dealDocId: dealDocId,
                customerId: customerId,
            } as EnrichedInstallerVisit;
        });
        
        const visitsData = await Promise.all(visitsDataPromises);
        setTasks(prevTasks => {
            const otherTasks = prevTasks.filter(t => t.type !== 'visit');
            const newVisitTasks: InstallerTask[] = visitsData.map(v => ({ type: 'visit', data: v }));
            return [...otherTasks, ...newVisitTasks];
        });
        setLoading(false);
    });


    return () => {
        unsubscribeOrders();
        unsubscribeVisits();
    };
  }, [user]);

  const activeTasks = useMemo(() => {
    return tasks
      .filter(task => {
        if (task.type === 'order') {
          const isCompleted = task.data.milestones.every(m => m.completed) && (!!task.data.feedbackRating || task.data.bypassedOtp === true);
          return !isCompleted;
        }
        if (task.type === 'visit') {
          return task.data.status !== 'completed';
        }
        return false;
      })
      .sort((a, b) => {
        const dateA = a.type === 'order' ? new Date(a.data.createdAt) : new Date(a.data.dueDate);
        const dateB = b.type === 'order' ? new Date(b.data.createdAt) : new Date(b.data.dueDate);
        return dateA.getTime() - dateB.getTime();
      });
  }, [tasks]);


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
      
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold">Your Tasks</h1>
            <p className="text-muted-foreground">Here are your active assignments.</p>
        </div>
      </div>

       {locationError && (
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Location Access Warning</AlertTitle>
            <AlertDescription>
                {locationError}. Location data will not be saved.
            </AlertDescription>
        </Alert>
      )}

      {activeTasks.length > 0 ? (
        <div className="space-y-4">
          {activeTasks.map((task, index) => (
             <div key={`${task.type}-${task.data.id}`} className="relative">
                 <span className="absolute -top-2 -left-2 bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold z-10">
                    {index + 1}
                </span>
                <InstallerTaskCard task={task} location={location} />
            </div>
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

const InstallerTaskCard = ({ task, location }: { task: InstallerTask, location: { latitude: number; longitude: number; } | null }) => {
    if (task.type === 'order') {
        return <InstallerOrderCard order={task.data} location={location} />;
    }
    if (task.type === 'visit') {
        return <InstallerVisitCard visit={task.data} />;
    }
    return null;
}

const InstallerVisitCard = ({ visit }: { visit: EnrichedInstallerVisit }) => {
    const router = useRouter();

    const handleStartVisit = () => {
        let path = '';
        if (visit.typeOfVisit === 'measurement') {
            path = `/mobile/measurement/${visit.id}?dealId=${visit.dealDocId}&customerId=${visit.customerId}`;
        } else {
             // For any other type of visit like 'delivery', 'fittings', etc.
            path = `/mobile/delivery/${visit.id}?dealId=${visit.dealDocId}&customerId=${visit.customerId}&orderId=${visit.orderId}`;
        }
        router.push(path);
    };

    const getButtonContent = () => {
        switch(visit.typeOfVisit) {
            case 'measurement':
                return { text: 'Start Measurement', icon: <ArrowRight className="ml-2 h-4 w-4" /> };
            case 'delivery':
            case 'fittings':
            case 'complaint':
            case 'tempo':
            case 'selection':
            case 'other':
                return { text: 'Start Visit', icon: <Truck className="ml-2 h-4 w-4" /> };
            default:
                return { text: 'Start Visit', icon: <ArrowRight className="ml-2 h-4 w-4" /> };
        }
    };

    const buttonContent = getButtonContent();
    
    return (
        <Card>
            <CardHeader>
                <CardTitle className="capitalize">{visit.customer?.name || "Unknown Customer"}</CardTitle>
                <CardDescription>
                    {visit.typeOfVisit} visit for Deal #{visit.deal?.dealId || 'N/A'}
                </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
                 <p className="flex items-center gap-2 font-semibold"><CalendarCheck className="h-4 w-4 text-muted-foreground" /> <span>{format(new Date(visit.dueDate), 'PPP p')}</span></p>
                 <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {visit.customer?.mobileNo || 'N/A'}</p>
                 <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {visit.customer?.addressPinCode || visit.customer?.city || 'N/A'}</p>
            </CardContent>
             <CardFooter>
                 <Button className="w-full" onClick={handleStartVisit}>
                    {buttonContent.text}
                    {buttonContent.icon}
                </Button>
            </CardFooter>
        </Card>
    );
}

export function InstallerOrderCard({ order, location }: { order: Order; location: { latitude: number; longitude: number; } | null; }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isUpdating, setIsUpdating] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [rating, setRating] = useState(0);
    const [remarks, setRemarks] = useState("");
    const [otp, setOtp] = useState("");
    const [isOtpDialogOpen, setIsOtpDialogOpen] = useState(false);
    
    const installerMilestoneIds = [7, 8]; 
    const nextInstallerMilestone = order.milestones.find(m => installerMilestoneIds.includes(m.id) && !m.completed);
    
    const canUpdate = (milestone: Milestone) => {
        const currentIndex = order.milestones.findIndex(m => m.id === milestone.id);
        if (currentIndex === 0) return true;
        const prevMilestoneInFlow = order.milestones[currentIndex - 1];
        return prevMilestoneInFlow.completed;
    }

    const handleStatusUpdate = async (milestoneToUpdate: Milestone) => {
        if (!user) {
            toast({ variant: "destructive", title: "Not logged in."});
            return;
        }

        if (!canUpdate(milestoneToUpdate)) {
            toast({ variant: "destructive", title: "Cannot update status", description: "A previous step must be completed first."});
            return;
        }
        setIsUpdating(true);
        try {
            const batch = writeBatch(db);
            const orderRef = doc(db, "orders", order.id);

            const updatedMilestones = order.milestones.map(m =>
                m.id === milestoneToUpdate.id ? { 
                    ...m, 
                    completed: true, 
                    completedAt: new Date().toISOString(), 
                    completedBy: user.name,
                    location: location
                } : m
            );
            batch.update(orderRef, { milestones: updatedMilestones });

            // If this is the final installation milestone, also update the related visit.
            if (milestoneToUpdate.id === 8 && order.customerId && order.dealId) {
                // Find the associated Deal Document ID
                const dealQuery = query(collection(db, 'customers', order.customerId, 'deals'), where('dealId', '==', order.dealId), limit(1));
                const dealSnapshot = await getDocs(dealQuery);

                if (!dealSnapshot.empty) {
                    const dealDocId = dealSnapshot.docs[0].id;

                    // Query for the specific visit linked to this order
                    const visitQuery = query(collection(db, 'customers', order.customerId, 'deals', dealDocId, 'visits'), where('orderId', '==', order.id), limit(1));
                    const visitSnapshot = await getDocs(visitQuery);
                    
                    if (!visitSnapshot.empty) {
                        const visitRef = visitSnapshot.docs[0].ref;
                        batch.update(visitRef, { status: 'completed' });
                    }
                    
                    // Also update the final O2D step
                    const o2dDocRef = doc(db, 'o2d', dealDocId);
                    batch.update(o2dDocRef, {
                        milestones: arrayUnion({
                            stepId: 13, // Installation Done
                            status: 'completed',
                            completedAt: new Date().toISOString(),
                            completedBy: user.name,
                            selection: "Done",
                            remarks: "Completed via mobile app"
                        })
                    });
                }
            }
            
            await batch.commit();

            toast({ title: `Order updated: ${milestoneToUpdate.name}` });
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Update failed", description: "Could not update order status."});
        } finally {
            setIsUpdating(false);
        }
    };
    
    const handleFeedbackSubmit = async () => {
        if (otp !== order.otp) {
            toast({ variant: "destructive", title: "Incorrect OTP", description: "Please enter the correct OTP provided to the customer." });
            return;
        }

        setIsUpdating(true);
        try {
            const orderRef = doc(db, "orders", order.id);
            await updateDoc(orderRef, {
                feedbackRating: rating,
                feedbackRemarks: remarks,
                bypassedOtp: false,
            });
            toast({ title: "Feedback submitted!", description: "Thank you for your input." });
            setIsOtpDialogOpen(false);
        } catch (error) {
            console.error("Error submitting feedback:", error);
            toast({ variant: "destructive", title: "Feedback submission failed" });
        } finally {
            setIsUpdating(false);
        }
    }
    
    const handleBypassOtp = async () => {
         setIsUpdating(true);
        try {
            const orderRef = doc(db, "orders", order.id);
            await updateDoc(orderRef, {
                feedbackRating: 0,
                feedbackRemarks: "Submitted without customer OTP.",
                bypassedOtp: true,
            });
            toast({ title: "Feedback Bypassed", description: "Order has been marked as complete without OTP." });
        } catch (error) {
            console.error("Error bypassing OTP:", error);
            toast({ variant: "destructive", title: "Bypass failed" });
        } finally {
            setIsUpdating(false);
        }
    }

    const handleRefresh = () => {
        setIsRefreshing(true);
        // This is a simulated refresh for user experience.
        setTimeout(() => {
            setIsRefreshing(false);
            toast({title: "Data is up to date."});
        }, 700);
    }
    
    const isOrderComplete = order.milestones.every(m => m.completed);


    return (
        <Card>
            <CardHeader>
                 <div className="flex items-start justify-between">
                    <div className="flex-grow">
                        <CardTitle>{order.customerName}</CardTitle>
                        <CardDescription>ID: {order.id}</CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
                        {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                </div>
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
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                             <Button 
                                className="w-full mt-2" 
                                disabled={isUpdating || !canUpdate(nextInstallerMilestone)}
                            >
                                {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Mark as &quot;{nextInstallerMilestone.name}&quot;
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will complete the milestone: <strong>{nextInstallerMilestone.name}</strong>. This action will be logged with your current location if available.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleStatusUpdate(nextInstallerMilestone)} disabled={isUpdating}>
                                    Continue
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}

                {!nextInstallerMilestone && !isOrderComplete && (
                    <p className="text-sm text-muted-foreground text-center pt-4">Waiting for other departments to complete their tasks.</p>
                 )}
                 
                {isOrderComplete && !order.feedbackRating && !order.bypassedOtp && (
                    <Dialog open={isOtpDialogOpen} onOpenChange={setIsOtpDialogOpen}>
                        <div className="pt-4 space-y-4">
                            <p className="font-semibold text-center">Order complete. Please provide feedback.</p>
                            <div className="space-y-2">
                                <Label>Rating</Label>
                                <div className="flex items-center gap-1">
                                    {[1,2,3,4,5].map(star => (
                                        <button key={star} type="button" onClick={() => setRating(star)}>
                                            <Star className={cn("h-8 w-8", rating >= star ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground")}/>
                                        </button>
                                    ))}
                                </div>
                            </div>
                             <div className="space-y-2">
                                 <Label htmlFor={`remarks-${order.id}`}>Remarks</Label>
                                 <Textarea id={`remarks-${order.id}`} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add any comments..."/>
                             </div>
                             <div className="flex flex-col gap-2">
                                <DialogTrigger asChild>
                                    <Button className="w-full" disabled={rating === 0}>
                                        Submit Feedback
                                    </Button>
                                </DialogTrigger>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                         <Button variant="link" size="sm" className="text-muted-foreground" disabled={isUpdating}>
                                            Submit without OTP
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will mark the order as complete without customer OTP. A zero-star rating will be recorded. Use this only if the customer is unavailable.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleBypassOtp} disabled={isUpdating}>
                                                Continue
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                         <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Enter OTP</DialogTitle>
                                <DialogDescription>
                                    Please enter the 4-digit OTP provided to the customer to confirm feedback submission.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <Input 
                                    type="tel" 
                                    maxLength={4} 
                                    placeholder="_ _ _ _" 
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                    className="text-center text-2xl tracking-[1em]"
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => setIsOtpDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleFeedbackSubmit} disabled={isUpdating || otp.length !== 4}>
                                    {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Confirm
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}

                {isOrderComplete && (order.feedbackRating || order.bypassedOtp) && (
                    <div className="pt-4 space-y-2">
                        <p className="font-semibold">Feedback Submitted</p>
                        {order.bypassedOtp ? (
                             <p className="text-sm text-muted-foreground p-2 border rounded-md bg-muted/50">"Submitted without customer OTP."</p>
                        ) : (
                            <>
                                <div className="flex items-center gap-1">
                                    {[1,2,3,4,5].map(star => (
                                        <Star key={star} className={cn("h-5 w-5", order.feedbackRating! >= star ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground")}/>
                                    ))}
                                </div>
                                {order.feedbackRemarks && <p className="text-xs text-muted-foreground mt-1 p-1.5 border rounded-md bg-muted/50">"{order.feedbackRemarks}"</p>}
                           </>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
