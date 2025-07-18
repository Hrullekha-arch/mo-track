
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getMilestonesForOrder } from "@/lib/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User, OrderType } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Textarea } from "@/components/ui/textarea";

const formSchema = z.object({
  crmOrderNo: z.string().min(1, "CRM Order No. is required"),
  customerName: z.string().min(1, "Customer name is required"),
  customerPhone: z.string().min(1, "Customer phone is required"),
  customerAddress: z.string().min(1, "Customer address is required"),
  salesPerson: z.string().min(1, "Sales person is required"),
  orderType: z.enum(['delivery', 'stitching', 'stitching+installation'], { required_error: "Order type is required" }),
  remarks: z.string().optional(),
});

const salesmen = [
    "AAS (SAHOO)", "ASD (SAROJ DAS)", "ASB (ABHISHEK SINGH)", "AK (ABHISHEK CARPET)",
    "AM (MINTOO)", "BPS (PAWAN SHARMA)", "BTK (TAPESHWAR)", "CAY (ASHISH)",
    "CP (PRADEEP)", "DS (DAYAL)", "DK (DEEPAK SINHA)", "KD (DEVENDER)", "MU (MURARI)",
    "NK (NAND KISHOR)", "NKD (NEERAJ)", "RA (RAJEEV AGGARWAL)", "RSB (RAJENDRA BISHT)",
    "RK (RAJKUMAR)", "SD (SWETA)", "UMDP (UMESH)", "RD (Bhatiya)", "ANVR (Anvar)", "VD (Vishal Dubey)"
];

interface NewOrderDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewOrderDialog({ isOpen, onClose }: NewOrderDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      crmOrderNo: "",
      customerName: "",
      customerPhone: "",
      customerAddress: "",
      salesPerson: "",
      remarks: "",
    },
  });

  async function getCrmForSalesman(salesman: string): Promise<string | null> {
    try {
        const assignmentDocRef = doc(db, "salesmanCrmAssignments", salesman);
        const docSnap = await getDoc(assignmentDocRef);
        if (docSnap.exists()) {
            return docSnap.data().crmUserId;
        }
        return null;
    } catch (error) {
        console.error("Error fetching salesman assignment:", error);
        return null;
    }
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) {
        toast({ variant: "destructive", title: "Error", description: "You must be logged in to create an order."});
        return;
    }
    setLoading(true);
    try {
      const trackingId = `MOTRACK-${values.crmOrderNo}`;
      const newMilestones = getMilestonesForOrder(values.orderType);
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      const assignedCrmId = await getCrmForSalesman(values.salesPerson);

      // Automatically mark the first milestone as complete
      if (newMilestones.length > 0) {
        newMilestones[0] = {
          ...newMilestones[0],
          completed: true,
          completedAt: new Date().toISOString(),
          completedBy: user.name,
          location: null,
        }
      }
      
      const newOrder: any = {
        id: trackingId,
        crmOrderNo: values.crmOrderNo,
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        customerAddress: values.customerAddress,
        salesPerson: values.salesPerson,
        orderType: values.orderType,
        remarks: values.remarks || "",
        milestones: newMilestones,
        createdAt: new Date().toISOString(),
        createdBy: {
            id: user.id,
            name: user.name,
        },
        otp: otp,
      };

      if (assignedCrmId) {
        newOrder.handledByCrm = assignedCrmId;
      }

      await setDoc(doc(db, "orders", trackingId), newOrder);
      toast({
        title: "Order Created & Acknowledged",
        description: `Order ${trackingId} created with OTP: ${otp}`,
      });
      form.reset();
      onClose();
    } catch (error) {
      console.error("Error creating order: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create the order. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
            form.reset();
            onClose();
        }
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
          <DialogDescription>
            Fill in the details below to create a new order.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[80vh] overflow-y-auto pr-2">
             <FormField
              control={form.control}
              name="crmOrderNo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CRM Order No.</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 12345" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="customerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="customerPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="123-456-7890" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="customerAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St, Anytown, USA" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="salesPerson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sales Person</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a sales person" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {salesmen.map(salesman => (
                                <SelectItem key={salesman} value={salesman}>{salesman}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="orderType"
              render={({ field }) => (
                 <FormItem>
                    <FormLabel>Order Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select an order type" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="delivery">Delivery</SelectItem>
                            <SelectItem value="stitching">Stitching</SelectItem>
                            <SelectItem value="stitching+installation">Stitching + Installation</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remarks</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Add any special instructions or notes here..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Order
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
