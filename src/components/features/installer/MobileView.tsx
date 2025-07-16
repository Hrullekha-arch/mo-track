
"use client";

import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Phone, MapPin, Loader2, AlertTriangle, Star, CheckCheck } from "lucide-react";
import { Order, Milestone } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export function MobileView() {
  const { user, logout } = useAuth();
  const [assignedOrders, setAssignedOrders] = useState<Order[]>([]);
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
    const q = query(collection(db, "orders"), where("assignedTo", "==", user.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        setAssignedOrders(ordersData);
        setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Filter for active orders (not fully completed with feedback)
  const isFullyCompleted = (order: Order) => order.milestones.every(m => m.completed) && !!order.feedbackRating;
  const activeOrders = assignedOrders.filter(o => !isFullyCompleted(o));

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
        <Button asChild variant="outline" size="sm">
            <Link href="/mobile/completed">
                <CheckCheck className="mr-2 h-4 w-4" />
                History
            </Link>
        </Button>
      </div>

       {locationError && (
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Location Access Required</AlertTitle>
            <AlertDescription>
                {locationError}. Please enable location permissions in your browser settings to continue.
            </AlertDescription>
        </Alert>
      )}

      {activeOrders.length > 0 ? (
        <div className="space-y-4">
          {activeOrders.map(order => (
            <InstallerOrderCard key={order.id} order={order} location={location} locationError={locationError} />
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
    location: { latitude: number; longitude: number; } | null;
    locationError: string | null;
}

export function InstallerOrderCard({ order, location, locationError }: InstallerOrderCardProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isUpdating, setIsUpdating] = useState(false);
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
         if (locationError) {
            toast({ variant: "destructive", title: "Location Access Required", description: "Please enable location access to update status."});
            return;
        }
        if (!canUpdate(milestoneToUpdate)) {
            toast({ variant: "destructive", title: "Cannot update status", description: "A previous step must be completed first."});
            return;
        }
        setIsUpdating(true);
        try {
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
            await updateDoc(orderRef, { milestones: updatedMilestones });
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
    
    const isOrderComplete = order.milestones.every(m => m.completed);


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
                        disabled={isUpdating || !canUpdate(nextInstallerMilestone) || !!locationError}
                    >
                        {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Mark as &quot;{nextInstallerMilestone.name}&quot;
                    </Button>
                )}

                {!nextInstallerMilestone && !isOrderComplete && (
                    <p className="text-sm text-muted-foreground text-center pt-4">Waiting for other departments to complete their tasks.</p>
                 )}
                 
                {isOrderComplete && !order.feedbackRating && (
                    <Dialog open={isOtpDialogOpen} onOpenChange={setIsOtpDialogOpen}>
                        <div className="pt-4 space-y-4">
                            <p className="font-semibold text-center">Order complete. Please provide feedback.</p>
                            <div className="space-y-2">
                                <Label>Rating</Label>
                                <div className="flex items-center gap-1">
                                    {[1,2,3,4,5].map(star => (
                                        <button key={star} onClick={() => setRating(star)}>
                                            <Star className={cn("h-8 w-8", rating >= star ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground")}/>
                                        </button>
                                    ))}
                                </div>
                            </div>
                             <div className="space-y-2">
                                 <Label htmlFor={`remarks-${order.id}`}>Remarks</Label>
                                 <Textarea id={`remarks-${order.id}`} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add any comments..."/>
                             </div>
                            <DialogTrigger asChild>
                                <Button className="w-full" disabled={rating === 0}>
                                    Submit Feedback
                                </Button>
                            </DialogTrigger>
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

                {isOrderComplete && order.feedbackRating && (
                    <div className="pt-4 space-y-2">
                        <p className="font-semibold">Feedback Submitted</p>
                        <div className="flex items-center gap-1">
                            {[1,2,3,4,5].map(star => (
                                <Star key={star} className={cn("h-5 w-5", order.feedbackRating! >= star ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground")}/>
                            ))}
                        </div>
                        {order.feedbackRemarks && <p className="text-sm text-muted-foreground p-2 border rounded-md bg-muted/50">"{order.feedbackRemarks}"</p>}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
