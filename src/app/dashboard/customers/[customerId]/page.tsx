"use client";

import { useEffect, useState, use } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Customer, Deal, User, Quotation } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PlusCircle, Settings, Edit, Trash2, Loader2, Contact2 } from "lucide-react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewDealDialog } from "@/components/features/customer/NewDealDialog";
import { useToast } from "@/hooks/use-toast";
import { getCustomerById, getDealsForCustomer, getSalesmen, getQuotationsForDeal as getQuotationsForDealAction } from '../actions';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { updateCustomerAction } from "./actions";
import { add } from "date-fns";


const editCustomerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  mobileNo: z.string().min(10, "Mobile is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
});

type EditCustomerValues = z.infer<typeof editCustomerSchema>;



export default function CustomerDetailPage({ params: paramsPromise }: { params: Promise<{ customerId: string }> }) {
    const params = use(paramsPromise);
    const { customerId } = params;
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [deals, setDeals] = useState<Deal[]>([]);
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [salesmen, setSalesmen] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [isNewDealOpen, setIsNewDealOpen] = useState(false);
    const { toast } = useToast();
    const [editOpen, setEditOpen] = useState(false);
const [savingCustomer, setSavingCustomer] = useState(false);

const editForm = useForm<EditCustomerValues>({
  resolver: zodResolver(editCustomerSchema),
  defaultValues: {
    name: "",
    mobileNo: "",
    email: "",
    address: "",
  },
});


    useEffect(() => {
        let isMounted = true;
        const fetchInitialData = async () => {
            if (!isMounted) return;
            setLoading(true);
            try {
                const [customerData, dealsData, salesmenData] = await Promise.all([
                    getCustomerById(customerId),
                    getDealsForCustomer(customerId),
                    getSalesmen(),
                ]);

                if (!isMounted) return;

                if (customerData) {
                    setCustomer(customerData);
                    editForm.reset({
                    name: customerData.name || "",
                    mobileNo: customerData.mobileNo || "",
                    email: customerData.email || "",
                    address: customerData.addressPinCode || "",
                    });

                    setDeals(dealsData);
                    setSalesmen(salesmenData);
                    // Also fetch all quotations for all deals of this customer
                    const allQuotations: Quotation[] = [];
                    for (const deal of dealsData) {
                        const dealQuotations = await getQuotationsForDealAction(customerId, deal.id);
                        allQuotations.push(...dealQuotations);
                    }
                    if (isMounted) {
                        setQuotations(allQuotations);
                    }
                } else {
                    setCustomer(null);
                    toast({
                        variant: 'destructive',
                        title: 'Error',
                        description: 'Customer could not be found.'
                    })
                }
            } catch (error) {
                console.error("Error fetching customer page data:", error);
                 toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Failed to fetch customer details.'
                })
            } finally {
                 if (isMounted) {
                    setLoading(false);
                }
            }
        };

        if (customerId) {
            fetchInitialData();
        }

        return () => {
            isMounted = false;
        }
    }, [customerId, toast]);

    const handleUpdateCustomer = async (values: EditCustomerValues) => {
    if (!customer) return;

    setSavingCustomer(true);
    try {
        const updated = await updateCustomerAction(customer.id, {
        name: values.name.trim(),
        mobileNo: values.mobileNo.trim(),
        email: (values.email || "").trim() || undefined,
        address: (values.address || "").trim() || undefined,
        });

        // ✅ update local UI state
        setCustomer(updated);

        toast({ title: "Customer updated", description: "Details saved successfully." });
        setEditOpen(false);
    } catch (err: any) {
        console.error(err);
        toast({
        variant: "destructive",
        title: "Update failed",
        description: err?.message || "Could not update customer.",
        });
    } finally {
        setSavingCustomer(false);
    }
    };


    const handleNewDealSuccess = (newDeal: Deal) => {
        setDeals(prevDeals => [newDeal, ...prevDeals]);
        toast({ title: "Deal Created!", description: "The new deal has been successfully added."});
        setIsNewDealOpen(false);
    }

    if (loading) {
        return (
            <div className="p-4 md:p-6 lg:p-8 space-y-4">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-4 w-48" />
                <Separator className="my-4" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-48 col-span-1" />
                    <Skeleton className="h-48 col-span-1" />
                    <Skeleton className="h-48 col-span-1" />
                </div>
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="p-4 md:p-6 lg:p-8 text-center">
                <h1 className="text-2xl font-bold">Customer not found</h1>
                <p>The requested customer could not be found.</p>
                 <Button variant="link" asChild className="mt-4">
                    <Link href="/dashboard/customers">Go back to customer search</Link>
                </Button>
            </div>
        )
    }

    const getSalesmanName = (id?: string) => salesmen.find(s => s.id === id)?.name || "N/A";
    
    const calculateTotalApprovedQuotationAmount = (dealId: string) => {
        return quotations
            .filter(q => q.dealName === deals.find(d => d.id === dealId)?.dealName && (q.status === 'Approved' || q.status === 'Converted to Order'))
            .reduce((total, q) => total + q.totalAmount, 0);
    };

    return (
        <>
        <div className="p-4 md:p-6 lg:p-8">
            <header className="flex justify-between items-start mb-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">{customer.name}</h1>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                editForm.reset({
                                name: customer.name || "",
                                mobileNo: customer.mobileNo || "",
                                email: customer.email || "",
                                address: customer.addressPinCode || "",
                                });
                                setEditOpen(true);
                            }}
                            >
                            <Settings className="h-5 w-5 text-blue-500" />
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">Mobile: {customer.mobileNo} {customer.email && `| Email: ${customer.email}`}</p>
                </div>
                 <Button variant="outline" asChild>
                    <Link href="/dashboard/customers">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Customers
                    </Link>
                </Button>
            </header>

            <Separator className="my-4" />

            <div className="space-y-4">
                    {deals.length > 0 ? (
                        <div className="space-y-4">
                             <div className="flex justify-end">
                                <Button onClick={() => setIsNewDealOpen(true)}>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    New Deal
                                </Button>
                             </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {deals.map(deal => (
                                    <Link key={deal.id} href={`/dashboard/customers/${customerId}/${deal.id}`} className="block">
                                    <Card className="h-full hover:shadow-lg transition-shadow">
                                        <CardHeader>
                                            <CardTitle className="flex justify-between items-start">
                                                <span>{deal.dealName}</span>
                                                <div className="flex items-center gap-1">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7"><Edit className="h-4 w-4"/></Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4"/></Button>
                                                </div>
                                            </CardTitle>
                                            <div className="text-sm text-muted-foreground">
                                                <Badge variant="secondary">
                                                    ID: {deal.dealId}
                                                </Badge>
                                                 <Badge variant="outline" className="ml-2">
                                                    {getSalesmanName(deal.representativeId)}
                                                </Badge>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-2xl font-bold text-primary">₹{calculateTotalApprovedQuotationAmount(deal.id).toLocaleString('en-IN')}</p>
                                            <p className="text-sm text-muted-foreground">{deal.description}</p>
                                        </CardContent>
                                    </Card>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-16 px-6 border-2 border-dashed rounded-lg mt-2">
                            <svg className="mx-auto h-24 w-24 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                            </svg>
                            <h3 className="text-xl font-semibold mb-2">There are no deals</h3>
                            <p className="text-muted-foreground mb-6">
                                There are no deals do you want to add deal? <br/>
                                <button onClick={() => setIsNewDealOpen(true)} className="text-primary hover:underline">click here</button> or click on New Deal button below
                            </p>
                            <Button onClick={() => setIsNewDealOpen(true)}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                New Deal
                            </Button>
                        </div>
                    )}
                </div>
        </div>
        <NewDealDialog
            isOpen={isNewDealOpen}
            onClose={() => setIsNewDealOpen(false)}
            onSuccess={handleNewDealSuccess}
            customerId={customer.id}
            salesmen={salesmen}
        />
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                <DialogTitle>Edit Customer</DialogTitle>
                <DialogDescription>Update customer details and save.</DialogDescription>
                </DialogHeader>

                <FormProvider {...editForm}>
                <Form {...editForm}>
                    <form className="space-y-4" onSubmit={editForm.handleSubmit(handleUpdateCustomer)}>
                    <FormField
                        control={editForm.control}
                        name="name"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                            <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />

                    <FormField
                        control={editForm.control}
                        name="mobileNo"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Mobile</FormLabel>
                            <FormControl>
                            <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />

                    <FormField
                        control={editForm.control}
                        name="email"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email (optional)</FormLabel>
                            <FormControl>
                            <Input {...field} placeholder="name@example.com" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />

                    <FormField
                        control={editForm.control}
                        name="address"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Address (optional)</FormLabel>
                            <FormControl>
                            <Input {...field} placeholder="" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                        Cancel
                        </Button>
                        <Button type="submit" disabled={savingCustomer}>
                        {savingCustomer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                        </Button>
                    </DialogFooter>
                    </form>
                </Form>
                </FormProvider>
            </DialogContent>
            </Dialog>

        </>
    );

    
}
    