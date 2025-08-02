
"use client";

import { useEffect, useState, use } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Customer, Deal, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PlusCircle, Settings, Archive, Receipt, FileText, CircleDollarSign, Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { NewDealDialog } from "@/components/features/customer/NewDealDialog";
import { useToast } from "@/hooks/use-toast";
import { getCustomerById, getDealsForCustomer, getSalesmen } from '../actions';

export default function CustomerDetailPage({ params: paramsPromise }: { params: Promise<{ customerId: string }> }) {
    const params = use(paramsPromise);
    const { customerId } = params;
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [deals, setDeals] = useState<Deal[]>([]);
    const [salesmen, setSalesmen] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [isNewDealOpen, setIsNewDealOpen] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                const [customerData, dealsData, salesmenData] = await Promise.all([
                    getCustomerById(customerId),
                    getDealsForCustomer(customerId),
                    getSalesmen(),
                ]);

                if (customerData) {
                    setCustomer(customerData);
                    setDeals(dealsData);
                    setSalesmen(salesmenData);
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
                 setLoading(false);
            }
        };

        if (customerId) {
            fetchInitialData();
        }
    }, [customerId, toast]);

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

    return (
        <>
        <div className="p-4 md:p-6 lg:p-8">
            <header className="flex justify-between items-start mb-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">{customer.name}</h1>
                        <Button variant="ghost" size="icon"><Settings className="h-5 w-5 text-muted-foreground" /></Button>
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

             <Tabs defaultValue="deals" className="w-full">
                <TabsList>
                    <TabsTrigger value="deals"><CircleDollarSign className="mr-2 h-4 w-4" />Deals</TabsTrigger>
                    <TabsTrigger value="archived"><Archive className="mr-2 h-4 w-4" />Archived</TabsTrigger>
                    <TabsTrigger value="receipts"><Receipt className="mr-2 h-4 w-4" />Receipts</TabsTrigger>
                    <TabsTrigger value="statement"><FileText className="mr-2 h-4 w-4" />Statement</TabsTrigger>
                </TabsList>
                <TabsContent value="deals" className="pt-4">
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
                                                    {getSalesmanName(deal.representativeId)}
                                                </Badge>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-2xl font-bold text-primary">₹{Number(deal.dealAmount).toLocaleString('en-IN')}</p>
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
                </TabsContent>
                 <TabsContent value="archived">
                    <div className="text-center py-16 px-6 border-2 border-dashed rounded-lg mt-2">
                        <p>Archived deals will appear here.</p>
                    </div>
                 </TabsContent>
                 <TabsContent value="receipts">
                    <div className="text-center py-16 px-6 border-2 border-dashed rounded-lg mt-2">
                        <p>Receipts will appear here.</p>
                    </div>
                 </TabsContent>
                 <TabsContent value="statement">
                     <div className="text-center py-16 px-6 border-2 border-dashed rounded-lg mt-2">
                        <p>Statements will appear here.</p>
                    </div>
                 </TabsContent>
            </Tabs>
        </div>
        <NewDealDialog
            isOpen={isNewDealOpen}
            onClose={() => setIsNewDealOpen(false)}
            onSuccess={handleNewDealSuccess}
            customerId={customer.id}
            salesmen={salesmen}
        />
        </>
    );
    