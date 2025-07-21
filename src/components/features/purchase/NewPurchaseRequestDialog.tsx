
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { doc, setDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Textarea } from "@/components/ui/textarea";

const formSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  requestingPerson: z.string().min(1, "Requesting person's name is required"),
  remarks: z.string().optional(),
});

interface NewPurchaseRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewPurchaseRequestDialog({ isOpen, onClose }: NewPurchaseRequestDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      itemName: "",
      requestingPerson: "",
      remarks: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) {
        toast({ variant: "destructive", title: "Error", description: "You must be logged in."});
        return;
    }
    setLoading(true);
    try {
      const newRequestRef = doc(collection(db, "purchaseRequests"));
      
      const newRequest = {
        id: newRequestRef.id,
        itemName: values.itemName,
        requestingPerson: values.requestingPerson,
        remarks: values.remarks || "",
        milestones: [],
        createdAt: new Date().toISOString(),
        createdBy: {
            id: user.id,
            name: user.name,
        },
        vendorType: 'undecided',
        status: 'pending',
      };

      await setDoc(newRequestRef, newRequest);
      toast({
        title: "Purchase Request Created",
        description: `Request for ${values.itemName} has been created.`,
      });
      form.reset();
      onClose();
    } catch (error) {
      console.error("Error creating purchase request: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create the request. Please try again.",
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
          <DialogTitle>New Purchase Request</DialogTitle>
          <DialogDescription>
            Fill in the details below to start a new purchase workflow.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
             <FormField
              control={form.control}
              name="itemName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Fabric Model X" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="requestingPerson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Requesting Person</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remarks (Optional)</FormLabel>
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
                    Create Request
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
