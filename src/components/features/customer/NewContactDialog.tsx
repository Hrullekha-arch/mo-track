
"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info, PlusCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Customer } from "@/lib/types";
import { addCustomerAction, updateCustomerAction } from "@/app/dashboard/customers/actions";
import { useDebounce } from "use-debounce";


const contactSchema = z
  .object({
    name: z.string().min(1, "Name is required."),
    phone: z.string().min(10, "Phone number must be at least 10 digits.").max(15),
    email: z.string().email("Invalid email address.").optional().or(z.literal('')),
    salesSupport: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    gstin: z.string().optional(),
    panNo: z.string().optional(),
    referenceName: z.string().optional(),
    sourceOfCustomer: z.string().optional(),
    pinCode: z.string().optional(),
    useDifferentBillingDetails: z.boolean().default(false),
    billingName: z.string().optional(),
    billingPhone: z.string().optional(),
    billingAddress: z.string().optional(),
    billingGstin: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.useDifferentBillingDetails) return;
    if (!String(values.billingName || "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["billingName"], message: "Billing name is required." });
    }
    if (!String(values.billingPhone || "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["billingPhone"], message: "Billing phone is required." });
    }
    if (!String(values.billingAddress || "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["billingAddress"], message: "Billing address is required." });
    }
    if (!String(values.billingGstin || "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["billingGstin"], message: "Billing GST is required." });
    }
  });

type ContactFormValues = z.infer<typeof contactSchema>;

interface CustomerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (customer: Customer) => void;
  mode?: "create" | "edit";
  customer?: Customer | null;
}

const CustomFormLabel = ({ children, tooltip }: { children: React.ReactNode, tooltip?: string }) => (
    <FormLabel className="flex items-center gap-1">
        {children}
        {tooltip && <Info className="h-3 w-3 text-muted-foreground" />}
    </FormLabel>
);

const resolveDefaultBillingValues = (customer?: Customer | null) => {
  const normalizedHistory = Array.isArray((customer as any)?.billingDetails)
    ? (customer as any).billingDetails
        .map((entry: any) => ({
          billingName: String(entry?.billingName || "").trim(),
          billingPhone: String(entry?.billingPhone || "").trim(),
          billingAddress: String(entry?.billingAddress || "").trim(),
          gstin: String(entry?.gstin || "").trim().toUpperCase(),
          isDefault: entry?.isDefault === true,
        }))
        .filter((entry: any) =>
          entry.billingName || entry.billingPhone || entry.billingAddress || entry.gstin
        )
    : [];

  const preferred = normalizedHistory.find((entry: any) => entry.isDefault) || normalizedHistory[0];
  const hasPreferred = Boolean(
    preferred?.billingName ||
    preferred?.billingPhone ||
    preferred?.billingAddress ||
    preferred?.gstin
  );

  return {
    useDifferentBillingDetails: hasPreferred,
    billingName: preferred?.billingName || customer?.name || "",
    billingPhone: preferred?.billingPhone || customer?.phone || customer?.mobileNo || "",
    billingAddress:
      preferred?.billingAddress ||
      customer?.billingAddress?.line1 ||
      customer?.addressPinCode ||
      "",
    billingGstin: preferred?.gstin || customer?.gstin || "",
  };
};

function CustomerDialog({ isOpen, onClose, onSuccess, mode = "create", customer }: CustomerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
        name: "",
        phone: "",
        email: "",
        salesSupport: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        gstin: "",
        panNo: "",
        referenceName: "",
        sourceOfCustomer: "",
        pinCode: "",
        useDifferentBillingDetails: false,
        billingName: "",
        billingPhone: "",
        billingAddress: "",
        billingGstin: "",
    }
  });

  const pinCodeValue = form.watch("pinCode");
  const [debouncedPinCode] = useDebounce(pinCodeValue, 800);
  const useDifferentBillingDetails = form.watch("useDifferentBillingDetails");

  useEffect(() => {
    if (mode !== "edit" || !customer) return;
    const defaults = resolveDefaultBillingValues(customer);
    form.reset({
      name: customer.name || "",
      phone: customer.phone || customer.mobileNo || "",
      email: customer.email || "",
      salesSupport: customer.assignedSalesPerson?.name || customer.salesSupport || "",
      addressLine1: customer.billingAddress?.line1 || customer.addressPinCode || "",
      addressLine2: customer.billingAddress?.line2 || customer.landmark || "",
      city: customer.billingAddress?.city || customer.city || "",
      state: customer.billingAddress?.state || customer.state || "",
      gstin: customer.gstin || "",
      panNo: customer.panNo || "",
      referenceName: customer.referenceName || "",
      sourceOfCustomer: customer.sourceOfCustomer || "",
      pinCode: customer.billingAddress?.pincode || customer.pinCode || "",
      useDifferentBillingDetails: defaults.useDifferentBillingDetails,
      billingName: defaults.billingName,
      billingPhone: defaults.billingPhone,
      billingAddress: defaults.billingAddress,
      billingGstin: defaults.billingGstin,
    });
  }, [mode, customer, form]);

  useEffect(() => {
    const fetchLocationFromPin = async () => {
      console.log(`[PINCODE_DEBUG] useEffect triggered. Debounced Pin Code: '${debouncedPinCode}'`);
      if (debouncedPinCode && debouncedPinCode.length === 6) {
        setIsFetchingLocation(true);
        console.log("[PINCODE_DEBUG] Length is 6, starting fetch...");
        try {
          // Corrected URL as per user feedback
          const autocompleteUrl = `/api/places/autocomplete?input=${debouncedPinCode}&types=geocode&components=country:in`;
          console.log("[PINCODE_DEBUG] Fetching corrected autocomplete URL:", autocompleteUrl);
          
          const response = await fetch(autocompleteUrl);
          const data = await response.json();
          console.log("[PINCODE_DEBUG] Autocomplete response data:", data);

          if (data.error) {
            throw new Error(`Autocomplete API Error: ${data.error}`);
          }

          if (data.predictions && data.predictions.length > 0) {
            const placeId = data.predictions[0].place_id;
            console.log("[PINCODE_DEBUG] Found place_id:", placeId);

            const detailsUrl = `/api/places/details?place_id=${placeId}`;
            console.log("[PINCODE_DEBUG] Fetching details URL:", detailsUrl);

            const detailsResponse = await fetch(detailsUrl);
            const detailsData = await detailsResponse.json();
            console.log("[PINCODE_DEBUG] Details response data:", detailsData);
            
            if (detailsData.error) {
                throw new Error(`Details API Error: ${detailsData.error}`);
            }

            if (detailsData.result) {
              const addressComponents = detailsData.result.address_components;
              const city = addressComponents.find((c: any) => c.types.includes("locality"))?.long_name || addressComponents.find((c: any) => c.types.includes("administrative_area_level_2"))?.long_name || "";
              const state = addressComponents.find((c: any) => c.types.includes("administrative_area_level_1"))?.long_name || "";
              console.log(`[PINCODE_DEBUG] Extracted City: '${city}', State: '${state}'`);

              form.setValue('city', city);
              form.setValue('state', state);
            } else {
                 console.log("[PINCODE_DEBUG] No result in details data.");
            }
          } else {
            console.log("[PINCODE_DEBUG] No predictions found for this pin code.");
          }
        } catch (error) {
          console.error("[PINCODE_DEBUG] Failed to fetch location from pincode:", error);
          toast({
            variant: "destructive",
            title: "Could not fetch location",
            description: "Please enter City and State manually.",
          });
        } finally {
          setIsFetchingLocation(false);
          console.log("[PINCODE_DEBUG] Fetch finished.");
        }
      } else {
         console.log("[PINCODE_DEBUG] Pin code is not 6 digits, skipping fetch.");
      }
    };
    fetchLocationFromPin();
  }, [debouncedPinCode, form, toast]);


  async function onSubmit(data: ContactFormValues) {
    if (!user) {
        toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
        return;
    }
    setLoading(true);
    try {
        const billingDetailsPayload = data.useDifferentBillingDetails
          ? {
              billingName: String(data.billingName || "").trim(),
              billingPhone: String(data.billingPhone || "").trim(),
              billingAddress: String(data.billingAddress || "").trim(),
              gstin: String(data.billingGstin || "").trim().toUpperCase(),
              isDefault: true,
            }
          : undefined;

        const payload = {
          name: data.name,
          phone: data.phone,
          email: data.email,
          gstin: data.gstin,
          isGstRegistered: Boolean(data.gstin),
          billingAddress: {
            line1: data.addressLine1,
            line2: data.addressLine2,
            city: data.city,
            state: data.state,
            pincode: data.pinCode,
          },
          shippingAddress: {
            line1: data.addressLine1,
            line2: data.addressLine2,
            city: data.city,
            state: data.state,
            pincode: data.pinCode,
          },
          assignedSalesPerson: data.salesSupport
            ? { name: data.salesSupport }
            : undefined,
          salesSupport: data.salesSupport,
          panNo: data.panNo,
          referenceName: data.referenceName,
          sourceOfCustomer: data.sourceOfCustomer,
          pinCode: data.pinCode,
          city: data.city,
          state: data.state,
          billingDetails: billingDetailsPayload,
        };

        if (mode === "edit" && customer) {
          const updated = await updateCustomerAction(customer.customerId || customer.id, {
            ...payload,
          });
          toast({
            title: "Customer Updated",
            description: `${data.name} has been updated.`,
          });
          form.reset();
          onSuccess(updated as Customer);
        } else {
          const result = await addCustomerAction({
            ...payload,
            createdBy: user.name,
          });
          if (result.success && result.customer) {
            toast({
              title: "Contact Created",
              description: `${data.name} has been added to your contacts.`,
            });
            form.reset();
            onSuccess(result.customer);
          } else {
            toast({ variant: "destructive", title: "Error", description: result.message });
          }
        }
    } catch (error) {
        console.error("Error creating contact:", error);
        toast({ variant: "destructive", title: "Error", description: `Could not save the ${mode === "edit" ? "customer" : "new contact"}.` });
    } finally {
        setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit Customer" : "Add New Contact"}</DialogTitle>
        </DialogHeader>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                            <CustomFormLabel tooltip="Customer's full name">Name*</CustomFormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem>
                            <CustomFormLabel tooltip="Customer's primary contact number">Phone*</CustomFormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email Id</FormLabel>
                            <FormControl><Input type="email" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="salesSupport" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-1">Architect / Sales Support <Button type="button" size="icon" variant="ghost" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="arch_1">Architect 1</SelectItem>
                                    <SelectItem value="sales_1">Sales Support 1</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                     )} />
                </div>
                
                <div className="space-y-4">
                    <h3 className="text-base font-semibold text-muted-foreground border-b pb-2">Address Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <FormField control={form.control} name="addressLine1" render={({ field }) => (
                            <FormItem className="md:col-span-2">
                                <CustomFormLabel>Flat, House no., Building, Company, Apartment</CustomFormLabel>
                                <FormControl><Input {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="addressLine2" render={({ field }) => (
                            <FormItem className="md:col-span-2">
                                <CustomFormLabel>Area, Street, Sector, Village</CustomFormLabel>
                                <FormControl><Input {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="pinCode" render={({ field }) => (
                            <FormItem>
                                <CustomFormLabel tooltip="Enter a 6-digit pin code to auto-fill city and state.">Pin Code</CustomFormLabel>
                                <div className="relative">
                                    <FormControl><Input {...field} maxLength={6} /></FormControl>
                                    {isFetchingLocation && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                                </div>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="city" render={({ field }) => (
                            <FormItem><CustomFormLabel>City</CustomFormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="state" render={({ field }) => (
                            <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4">
                        <FormField control={form.control} name="gstin" render={({ field }) => (
                            <FormItem><FormLabel>GSTIN</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="panNo" render={({ field }) => (
                            <FormItem><FormLabel>PAN No</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                         <FormField control={form.control} name="referenceName" render={({ field }) => (
                            <FormItem><CustomFormLabel tooltip="Name of the person who referred this customer">Reference Name</CustomFormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                         <FormField control={form.control} name="sourceOfCustomer" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center gap-1">Source Of Customer <Button type="button" size="icon" variant="ghost" className="h-5 w-5"><PlusCircle className="h-4 w-4 text-primary" /></Button></FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="--SELECT--" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="website">Website</SelectItem>
                                        <SelectItem value="referral">Referral</SelectItem>
                                        <SelectItem value="walk-in">Walk-in</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                         )} />
                </div>

                <div className="space-y-4">
                    <h3 className="text-base font-semibold text-muted-foreground border-b pb-2">Billing Details (Invoice)</h3>
                    <FormField
                      control={form.control}
                      name="useDifferentBillingDetails"
                      render={({ field }) => (
                        <FormItem className="rounded-md border p-3">
                          <div className="flex items-center space-x-3">
                            <FormControl>
                              <Checkbox
                                checked={Boolean(field.value)}
                                onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                              />
                            </FormControl>
                            <FormLabel className="m-0">Use separate billing details</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                    {useDifferentBillingDetails && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <FormField
                          control={form.control}
                          name="billingName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Billing Name</FormLabel>
                              <FormControl><Input {...field} placeholder="Company / billing name" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="billingPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Billing Phone</FormLabel>
                              <FormControl><Input {...field} placeholder="Billing contact number" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="billingAddress"
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Billing Address</FormLabel>
                              <FormControl><Textarea rows={3} {...field} placeholder="Billing address" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="billingGstin"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Billing GSTIN</FormLabel>
                              <FormControl><Input {...field} placeholder="GSTIN" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                </div>

                 <DialogFooter className="pt-8">
                    <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                    <Button type="submit" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                    </Button>
                </DialogFooter>
            </form>
            </Form>
      </DialogContent>
    </Dialog>
  );
}

export function NewContactDialog({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: (newCustomer: Customer) => void; }) {
  return <CustomerDialog isOpen={isOpen} onClose={onClose} onSuccess={onSuccess} mode="create" />;
}

export function EditCustomerDialog({ isOpen, onClose, onSuccess, customer }: { isOpen: boolean; onClose: () => void; onSuccess: (customer: Customer) => void; customer: Customer | null; }) {
  return (
    <CustomerDialog
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
      mode="edit"
      customer={customer}
    />
  );
}
