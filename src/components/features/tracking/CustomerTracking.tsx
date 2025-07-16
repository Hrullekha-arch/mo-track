
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2, Search, User as UserIcon, Phone, MapPin, MessageSquare } from "lucide-react";
import { Order, User } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MilestoneProgress } from "../order-management/MilestoneProgress";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

const formSchema = z.object({
  trackingCode: z.string().min(1, { message: "Tracking code is required." }),
});

export function CustomerTracking() {
  const [order, setOrder] = useState<Order | null>(null);
  const [installer, setInstaller] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      trackingCode: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    setSearched(true);
    setOrder(null);
    setInstaller(null);
    try {
        const orderRef = doc(db, "orders", values.trackingCode.toUpperCase());
        const docSnap = await getDoc(orderRef);
        if (docSnap.exists()) {
            const orderData = { id: docSnap.id, ...docSnap.data() } as Order;
            setOrder(orderData);
            if (orderData.assignedTo) {
                const installerRef = doc(db, "users", orderData.assignedTo);
                const installerSnap = await getDoc(installerRef);
                if (installerSnap.exists()) {
                    setInstaller({ id: installerSnap.id, ...installerSnap.data() } as User);
                }
            }
        } else {
            setOrder(null);
        }
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

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-start gap-2">
          <FormField
            control={form.control}
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
                    <MilestoneProgress milestones={order.milestones} />
                 </div>
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
