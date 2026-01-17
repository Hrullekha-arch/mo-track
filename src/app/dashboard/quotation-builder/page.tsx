
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Customer, Deal, User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Search, Loader2 } from "lucide-react";

import { NewContactDialog } from '@/components/features/customer/NewContactDialog';
import { CustomerResultsTable } from '@/components/features/customer/CustomerResultsTable';
import { addDealAction, searchCustomersAction } from '@/app/dashboard/customers/actions';

export default function QuotationBuilderPage() {
    const [step, setStep] = useState<'customer' | 'build'>('customer');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

    const [loading, setLoading] = useState(false);
    const [isNewContactOpen, setIsNewContactOpen] = useState(false);
    const [searchResults, setSearchResults] = useState<Customer[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    const router = useRouter();

    const { toast } = useToast();
    const { user } = useAuth();
    
    const [searchFilters, setSearchFilters] = useState({
        customerName: "",
        mobileNo: "",
    });

    const handleSearch = async () => {
        setLoading(true);
        setHasSearched(true);
        try {
            const results = await searchCustomersAction(searchFilters);
            setSearchResults(results);
            if (results.length === 0) {
                 toast({ variant: "destructive", title: "No Customers Found" });
            }
        } catch (error) {
            toast({ variant: "destructive", title: "Search Failed", description: "Could not fetch customer data." });
        } finally {
            setLoading(false);
        }
    };
    
    const handleNewContactSuccess = async (newCustomer: Customer) => {
        setIsNewContactOpen(false);
        await handleCustomerSelect(newCustomer);
    };
    
    const handleCustomerSelect = async (customer: Customer) => {
        if (!user) {
            toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in to create a deal." });
            return;
        }
        setLoading(true);
        try {
            const dealData = {
                customerId: customer.id,
                dealName: "Instant Quotation",
                dealAmount: 1,
                representativeId: user.id,
                description: "Deal created from Instant Quotation flow.",
                advanceForMeasurement: 'No' as const,
            };

            const result = await addDealAction(dealData);

            if (result.success && result.deal) {
                toast({ title: "Deal Created", description: "Redirecting to quotation builder..." });
                // Redirect to the new, dedicated quotation page
                router.push(`/dashboard/customers/${customer.id}/${result.deal.id}/quotation`);
            } else {
                throw new Error(result.message || "Failed to create a new deal.");
            }

        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
            setLoading(false);
        }
    };

    return (
        <>
            <div className="container mx-auto p-4 md:p-6 lg:p-8">
                <header className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Instant Quotation Builder
                    </h1>
                </header>

                <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5"/> Step 1: Find or Create a Customer</CardTitle>
                        <CardDescription>Search for an existing customer or add a new one to begin.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-grow space-y-2">
                                <Label htmlFor="customerName">Name of Customer</Label>
                                <Input id="customerName" value={searchFilters.customerName} onChange={e => setSearchFilters(f => ({...f, customerName: e.target.value}))}/>
                            </div>
                             <div className="flex-grow space-y-2">
                                <Label htmlFor="mobileNo">Mobile No</Label>
                                <Input id="mobileNo" value={searchFilters.mobileNo} onChange={e => setSearchFilters(f => ({...f, mobileNo: e.target.value}))}/>
                            </div>
                             <div className="flex items-end gap-2">
                                <Button onClick={handleSearch} disabled={loading} className="w-full md:w-auto">
                                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                    Search
                                </Button>
                                <Button onClick={() => setIsNewContactOpen(true)} variant="secondary" className="w-full md:w-auto">
                                    <UserPlus className="mr-2 h-4 w-4" />
                                    New Contact
                                </Button>
                            </div>
                        </div>
                        
                         <CustomerResultsTable 
                            customers={searchResults} 
                            isLoading={loading} 
                            hasSearched={hasSearched}
                            onCustomerSelect={handleCustomerSelect}
                         />
                      </CardContent>
                    </Card>
                </div>
                 <NewContactDialog 
                    isOpen={isNewContactOpen} 
                    onClose={() => setIsNewContactOpen(false)}
                    onSuccess={handleNewContactSuccess}
                />
            </div>
        </>
    )
}
