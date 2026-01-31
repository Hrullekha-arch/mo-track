"use client";

import { useState, useEffect, use } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Customer, Deal, Cpd } from "@/lib/types";
import { getCustomerById } from "@/app/dashboard/customers/actions";
import { getDealById, getCpdsForDeal } from "../actions";
import { QuotationForm } from "@/components/features/order-management/QuotationForm";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from 'next/navigation';

export default function InstantQuotationPage({ params: paramsPromise }: { params: { customerId: string, dealId: string } }) {
    const params = use(paramsPromise);
    const { customerId, dealId } = params;
    
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [deal, setDeal] = useState<Deal | null>(null);
    const [cpds, setCpds] = useState<Cpd[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [customerData, dealData, cpdsData] = await Promise.all([
                    getCustomerById(customerId),
                    getDealById(customerId, dealId),
                    getCpdsForDeal(customerId, dealId)
                ]);
                setCustomer(customerData);
                setDeal(dealData);
                setCpds(cpdsData);
            } catch (error) {
                console.error("Error fetching data for quotation builder:", error);
            } finally {
                setLoading(false);
            }
        };

        if (customerId && dealId) {
            fetchData();
        }
    }, [customerId, dealId]);

    const handleQuotationSuccess = () => {
        router.push(`/dashboard/customers/${customerId}/${dealId}`);
    };
    
    if (loading) {
        return (
            <div className="p-6">
                 <header className="mb-6">
                     <Skeleton className="h-8 w-1/2 mb-2" />
                     <Skeleton className="h-4 w-3/4" />
                </header>
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-1/4" />
                        <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-64 w-full" />
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (!customer || !deal) {
        return (
             <div className="p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Error</CardTitle>
                        <CardDescription>Could not load customer or deal information.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        )
    }

    return (
        <div className="p-6">
            <header className="mb-6">
                 <h1 className="text-2xl font-bold">Instant Quotation Builder</h1>
                 <p className="text-muted-foreground">For Customer: {customer.name} | Deal: {deal.title || deal.dealName}</p>
            </header>
            <QuotationForm 
                customer={customer}
                deal={deal}
                cpds={cpds}
                onSuccess={handleQuotationSuccess}
            />
        </div>
    );
}
