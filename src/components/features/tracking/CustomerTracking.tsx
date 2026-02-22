
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2, Search, User as UserIcon, Phone, MapPin, MessageSquare, Star } from "lucide-react";
import { Order, User } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MilestoneProgress } from "../order-management/MilestoneProgress";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getPublicOrderDetails } from "@/app/track/actions";
import { getNormalizedOrderMilestones, isOrderComplete as isOrderWorkflowComplete } from "@/lib/order-workflow";

const formSchema = z.object({
  trackingCode: z.string().min(1, { message: "Tracking code is required." }),
});

const feedbackSchema = z.object({
    otp: z.string().length(4, "OTP must be 4 digits."),
    rating: z.number().min(1, "Rating is required."),
    remarks: z.string().optional(),
});

export function CustomerTracking() {
  const [order, setOrder] = useState<Order | null>(null);
  const [installer, setInstaller] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const { toast } = useToast();

  const trackingForm = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      trackingCode: "",
    },
  });

  const feedbackForm = useForm<z.infer<typeof feedbackSchema>>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
        otp: "",
        rating: 0,
        remarks: "",
    }
  });
  const rating = feedbackForm.watch("rating");


  async function onTrackSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    setSearched(true);
    setOrder(null);
    setInstaller(null);
    try {
        const result = await getPublicOrderDetails(values.trackingCode);
        
        if (result.error) {
            throw new Error(result.error);
        }

        setOrder(result.order);
        setInstaller(result.installer);

    } catch (error) {
        console.error("Error fetching order:", error);
        toast({
            variant: "destructive",
            title: "An error occurred",
            description: "Failed to fetch order details. Please try again later.",
        });
    } finally {
        setLoading(false);
    }
  }

  async function onFeedbackSubmit(values: z.infer<typeof feedbackSchema>) {
    if (!order) return;
    if (values.otp !== order.otp) {
        feedbackForm.setError("otp", { message: "Incorrect OTP."});
        return;
    }
    setLoading(true);
    try {
        const orderRef = doc(db, "orders", order.id);
        const updatePayload = {
            customerFeedbackRating: values.rating,
            customerFeedbackRemarks: values.remarks,
        };
        await updateDoc(orderRef, updatePayload);
        setOrder(prev => prev ? {...prev, ...updatePayload} : null);
        toast({ title: "Thank you!", description: "Your feedback has been submitted." });
    } catch (error) {
        console.error("Error submitting feedback:", error);
        toast({ variant: "destructive", title: "Submission Failed", description: "Could not submit your feedback." });
    } finally {
        setLoading(false);
    }
  }
  
  const isOrderComplete = order ? isOrderWorkflowComplete(order) : false;

  return (
    <div className="space-y-6">
      <Form {...trackingForm}>
        <form onSubmit={trackingForm.handleSubmit(onTrackSubmit)} className="flex items-start gap-2">
          <FormField
            control={trackingForm.control}
            name="trackingCode"
            render={({ field }) => (
              <FormItem className="flex-grow">
                <FormControl>
                  <Input placeholder="e.g., MOTRACK-1001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" aria-label="Track Order" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>
      </Form>
      
      {searched && !loading && (
        <div className="mt-6">
          {order ? (
            <Card>
              <CardHeader>
                <CardTitle>Order Status: {order.id}</CardTitle>
                <CardDescription>Hello, {order.customerName}. Here is the latest update on your order.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="space-y-3 rounded-md border p-4 text-sm">
                    <div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-muted-foreground" /><span>{order.customerAddress}</span></div>
                    <div className="flex items-center gap-3"><Phone className="h-5 w-5 text-muted-foreground" /><span>{order.customerPhone}</span></div>
                    {installer && (
                         <div className="flex items-center gap-3"><UserIcon className="h-5 w-5 text-muted-foreground" /><span>Installer: {installer.name}</span></div>
                    )}
                    {order.remarks && (
                         <div className="flex items-start gap-3"><MessageSquare className="h-5 w-5 text-muted-foreground mt-1" /><p className="flex-1">{order.remarks}</p></div>
                    )}
                 </div>
                 <Separator />
                 <div>
                    <h3 className="mb-4 text-lg font-semibold">Order Progress</h3>
                    <MilestoneProgress milestones={getNormalizedOrderMilestones(order)} />
                 </div>
                 {isOrderComplete && (
                    <>
                        <Separator />
                         <div className="space-y-4">
                            <h3 className="text-lg font-semibold">Leave Feedback</h3>
                            {order.customerFeedbackRating ? (
                                <div className="text-center p-8 border-2 border-dashed rounded-lg bg-muted/50">
                                    <p className="font-semibold text-accent">Thank you for your feedback!</p>
                                </div>
                            ) : (
                                <Form {...feedbackForm}>
                                    <form onSubmit={feedbackForm.handleSubmit(onFeedbackSubmit)} className="space-y-4 p-4 border rounded-lg">
                                        <div className="space-y-2">
                                            <Label>Your Rating</Label>
                                            <div className="flex items-center gap-1">
                                                {[1,2,3,4,5].map(star => (
                                                    <button key={star} type="button" onClick={() => feedbackForm.setValue("rating", star, { shouldValidate: true })}>
                                                        <Star className={cn("h-8 w-8", rating >= star ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground")}/>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <FormField
                                            control={feedbackForm.control}
                                            name="remarks"
                                            render={({ field }) => (
                                                <FormItem>
                                                <FormLabel>Remarks (Optional)</FormLabel>
                                                <FormControl>
                                                    <Textarea placeholder="Tell us more about your experience..." {...field} />
                                                </FormControl>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={feedbackForm.control}
                                            name="otp"
                                            render={({ field }) => (
                                                <FormItem>
                                                <FormLabel>Enter OTP</FormLabel>
                                                <FormControl>
                                                    <Input type="tel" maxLength={4} placeholder="4-digit code" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <Button type="submit" disabled={loading}>
                                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Submit Feedback
                                        </Button>
                                    </form>
                                </Form>
                            )}
                         </div>
                    </>
                 )}
              </CardContent>
            </Card>
          ) : (
            <div className="text-center text-muted-foreground p-8 border rounded-lg">
              <p className="font-semibold">Order not found.</p>
              <p>Please check your tracking code and try again.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
