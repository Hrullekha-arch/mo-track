"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Customer } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PlusCircle, Settings, Archive, Receipt, FileText, CircleDollarSign } from 'lucide-react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Image from 'next/image';
import { getCustomerById } from '../actions';
import { Separator } from '@/components/ui/separator';

export default function CustomerDetailPage() {
    const params = useParams();
    const router = useRouter();
    const customerId = params.customerId as string;
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (customerId) {
            const fetchCustomer = async () => {
                setLoading(true);
                try {
                    const fetchedCustomer = await getCustomerById(customerId);
                    setCustomer(fetchedCustomer);
                } catch (error) {
                    console.error("Failed to fetch customer", error);
                    setCustomer(null);
                } finally {
                    setLoading(false);
                }
            };

            fetchCustomer();
        } else {
            setLoading(false);
        }
    }, [customerId]);

    if (loading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-8 w-1/4" />
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    
    if (!customer) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-semibold">Customer not found</h2>
                 <Button variant="link" asChild className="mt-4">
                    <Link href="/dashboard/customers">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Customers
                    </Link>
                </Button>
            </div>
        )
    }

    return (
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
                    <div className="text-center py-16 px-6 border-2 border-dashed rounded-lg mt-2">
                         <Image 
                            src="https://placehold.co/600x400.png" 
                            alt="No deals illustration"
                            data-ai-hint="empty state illustration"
                            width={200}
                            height={200}
                            className="mx-auto mb-6"
                         />
                        <h3 className="text-xl font-semibold mb-2">There are no deals</h3>
                        <p className="text-muted-foreground mb-6">
                            There are no deals do you want to add deal? <br/>
                             <Link href="#" className="text-primary hover:underline">click here</Link> or click on New Deal button below
                        </p>
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            New Deal
                        </Button>
                    </div>
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
    );
}
