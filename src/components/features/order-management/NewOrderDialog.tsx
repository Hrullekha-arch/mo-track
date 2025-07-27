
"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { doc, setDoc, getDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getMilestonesForOrder } from "@/lib/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User, OrderType, FabricDetail, FurnitureDetail } from "@/lib/types";
import { Loader2, PlusCircle, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


const fabricDetailSchema = z.object({
  fabricName: z.string().min(1, "Fabric name is required"),
  quantity: z.string().min(1, "Quantity is required"),
});

const furnitureDetailSchema = z.object({
  furnitureName: z.string().min(1, "Furniture name is required"),
  quantity: z.string().min(1, "Quantity is required"),
});

const formSchema = z.object({
  crmOrderNo: z.string().min(1, "CRM Order No. is required"),
  customerName: z.string().min(1, "Customer name is required"),
  customerPhone: z.string().min(1, "Customer phone is required"),
  customerAddress: z.string().min(1, "Customer address is required"),
  salesPerson: z.string().min(1, "Sales person name or code is required"),
  orderType: z.enum(['delivery', 'stitching', 'stitching+installation'], { required_error: "Order type is required" }),
  remarks: z.string().optional(),
  fabricDetails: z.array(fabricDetailSchema).optional(),
  furnitureDetails: z.array(furnitureDetailSchema).optional(),
});

interface NewOrderDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const FabricForm = ({ form }: { form: any }) => {
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "fabricDetails",
    });

    return (
        <div className="space-y-4">
             <FormLabel>Fabric Details</FormLabel>
            {fields.map((field, index) => (
                 <Card key={field.id} className="p-3">
                    <div className="flex items-end gap-2">
                        <FormField
                            control={form.control}
                            name={`fabricDetails.${index}.fabricName`}
                            render={({ field }) => (
                                <FormItem className="flex-grow">
                                    <FormLabel className="text-xs">Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Fabric name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name={`fabricDetails.${index}.quantity`}
                            render={({ field }) => (
                                <FormItem>
                                     <FormLabel className="text-xs">Qty (Mtr)</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Qty" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                         </Button>
                    </div>
                 </Card>
            ))}
             <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ fabricName: "", quantity: "" })}
            >
                <PlusCircle className="mr-2 h-4 w-4"/>
                Add Fabric
            </Button>
        </div>
    );
};

const FurnitureForm = ({ form }: { form: any }) => {
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "furnitureDetails",
    });

    return (
        <div className="space-y-4">
             <FormLabel>Furniture Details</FormLabel>
            {fields.map((field, index) => (
                 <Card key={field.id} className="p-3">
                    <div className="flex items-end gap-2">
                        <FormField
                            control={form.control}
                            name={`furnitureDetails.${index}.furnitureName`}
                            render={({ field }) => (
                                <FormItem className="flex-grow">
                                    <FormLabel className="text-xs">Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Furniture name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name={`furnitureDetails.${index}.quantity`}
                            render={({ field }) => (
                                <FormItem>
                                     <FormLabel className="text-xs">Qty</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Qty" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                         </Button>
                    </div>
                 </Card>
            ))}
             <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ furnitureName: "", quantity: "" })}
            >
                <PlusCircle className="mr-2 h-4 w-4"/>
                Add Furniture
            </Button>
        </div>
    );
};

export function NewOrderDialog({ isOpen, onClose }: NewOrderDialogProps) {
  const [loading, setLoading] = useState(false);
  const [salesmen, setSalesmen] = useState<User[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  const [itemTab, setItemTab] = useState<"fabric" | "furniture">("fabric");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      crmOrderNo: "",
      customerName: "",
      customerPhone: "",
      customerAddress: "",
      salesPerson: "",
      remarks: "",
      fabricDetails: [],
      furnitureDetails: [],
    },
  });

  useEffect(() => {
    if (isOpen) {
        const salesmenQuery = query(collection(db, "users"), where("role", "==", "salesman"));
        const unsubscribe = onSnapshot(salesmenQuery, (snapshot) => {
            const salesmenData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
            setSalesmen(salesmenData.sort((a, b) => a.name.localeCompare(b.name)));
        });
        return () => unsubscribe();
    }
  }, [isOpen]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) {
        toast({ variant: "destructive", title: "Error", description: "You must be logged in to create an order."});
        return;
    }
    setLoading(true);
    try {
      // Find assigned CRM user for the selected salesman by name or code
      const salesmanIdentifier = values.salesPerson.trim();
      const salesmanUser = salesmen.find(s => 
        s.name.toLowerCase() === salesmanIdentifier.toLowerCase() || 
        (s.salesmanCode && s.salesmanCode.toLowerCase() === salesmanIdentifier.toLowerCase())
      );

      if (!salesmanUser) {
           toast({ 
               variant: "destructive", 
               title: "Salesman not found",
               description: `Could not find a salesman with the name or code "${salesmanIdentifier}".`
            });
           form.setError("salesPerson", { message: "Salesman not found." });
           setLoading(false);
           return;
      }
      const assignmentRef = doc(db, "salesmanCrmAssignments", salesmanUser.name);
      const assignmentSnap = await getDoc(assignmentRef);
      const crmUserId = assignmentSnap.exists() ? assignmentSnap.data().crmUserId : null;

      if (!crmUserId) {
        toast({
          variant: "destructive",
          title: "Assignment Missing",
          description: `The salesman "${salesmanUser.name}" is not assigned to a CRM handler. Please set the assignment in User Management.`,
        });
        setLoading(false);
        return;
      }

      const trackingId = `MOTRACK-${values.crmOrderNo}`;
      const newMilestones = getMilestonesForOrder(values.orderType);
      
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      
      const newOrder = {
        id: trackingId,
        crmOrderNo: values.crmOrderNo,
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        customerAddress: values.customerAddress,
        salesPerson: salesmanUser.name, // Store the actual name
        orderType: values.orderType,
        remarks: values.remarks || "",
        milestones: newMilestones,
        o2dMilestones: [], // Initialize empty O2D milestones
        createdAt: new Date().toISOString(),
        createdBy: {
            id: user.id,
            name: user.name,
        },
        otp: otp,
        handledByCrm: crmUserId, // Automatically assign CRM
        isAcknowledged: false, // Orders start in O2D, so they are not yet acknowledged for the main workflow
        fabricDetails: values.fabricDetails || [],
        furnitureDetails: values.furnitureDetails || [],
      };

      await setDoc(doc(db, "orders", trackingId), newOrder);
      toast({
        title: "Order Created",
        description: `Order ${trackingId} has been created and moved to the O2D dashboard.`,
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
          <DialogDescription>
            Fill in the details below to create a new order. It will be added to the O2D workflow.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[80vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  name="salesPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sales Person (Name or Code)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Jane Doe or S001" {...field} />
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
                    <FormItem className="col-span-1 md:col-span-2">
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
             </div>
             <div className="pt-4">
                 <Tabs
                    value={itemTab}
                    onValueChange={(value) => setItemTab(value as "fabric" | "furniture")}
                    className="w-full"
                >
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="fabric">Fabric Items</TabsTrigger>
                        <TabsTrigger value="furniture">Furniture Items</TabsTrigger>
                    </TabsList>
                    <TabsContent value="fabric" className="mt-4">
                        <FabricForm form={form} />
                    </TabsContent>
                    <TabsContent value="furniture" className="mt-4">
                        <FurnitureForm form={form} />
                    </TabsContent>
                 </Tabs>
             </div>
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
