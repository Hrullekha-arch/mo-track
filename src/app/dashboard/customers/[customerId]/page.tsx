"use client";

import { useEffect, useState, use } from "react";
import { Customer, Deal, User, Quotation } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PlusCircle, Settings, Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NewDealDialog } from "@/components/features/customer/NewDealDialog";
import { EditCustomerDialog } from "@/components/features/customer/NewContactDialog";
import { useToast } from "@/hooks/use-toast";
import {
  getCustomerById,
  getDealsForCustomer,
  getSalesmen,
  getQuotationsForDeal as getQuotationsForDealAction,
  updateDealSalesmanAction,
} from '../actions';



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
    const [salesmanDraftByDeal, setSalesmanDraftByDeal] = useState<Record<string, string>>({});
    const [updatingDealSalesmanId, setUpdatingDealSalesmanId] = useState<string | null>(null);


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
                    setDeals(dealsData);
                    setSalesmen(salesmenData);
                    setSalesmanDraftByDeal(
                      dealsData.reduce((acc, deal) => {
                        acc[deal.id] = deal.assignedSalesPerson?.id || deal.representativeId || "";
                        return acc;
                      }, {} as Record<string, string>)
                    );
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

    const handleNewDealSuccess = (newDeal: Deal) => {
        setDeals(prevDeals => [newDeal, ...prevDeals]);
        setSalesmanDraftByDeal((prev) => ({
          ...prev,
          [newDeal.id]: newDeal.assignedSalesPerson?.id || newDeal.representativeId || "",
        }));
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
    const getDealTitle = (deal: Deal) => deal.title || deal.dealName || "Untitled Deal";
    const getDealSalesmanId = (deal: Deal) => deal.assignedSalesPerson?.id || deal.representativeId || "";
    const getDraftSalesmanId = (deal: Deal) => salesmanDraftByDeal[deal.id] || getDealSalesmanId(deal);
    const isDealSalesmanDirty = (deal: Deal) => {
      const draftSalesmanId = getDraftSalesmanId(deal);
      return Boolean(draftSalesmanId) && draftSalesmanId !== getDealSalesmanId(deal);
    };
    
    const calculateTotalApprovedQuotationAmount = (dealId: string) => {
        return quotations
            .filter(q => q.dealName === deals.find(d => d.id === dealId)?.dealName && (q.status === 'Approved' || q.status === 'Converted to Order'))
            .reduce((total, q) => total + q.totalAmount, 0);
    };

    const handleSalesmanChangeForDeal = async (deal: Deal) => {
      const selectedSalesmanId = getDraftSalesmanId(deal);
      const currentSalesmanId = getDealSalesmanId(deal);

      if (!selectedSalesmanId) {
        toast({
          variant: "destructive",
          title: "Select salesman",
          description: "Please select a salesman first.",
        });
        return;
      }

      if (selectedSalesmanId === currentSalesmanId) {
        toast({
          title: "No changes",
          description: "Selected salesman is already assigned to this deal.",
        });
        return;
      }

      setUpdatingDealSalesmanId(deal.id);
      try {
        const result = await updateDealSalesmanAction(customerId, deal.id, selectedSalesmanId);
        if (!result.success || !result.deal) {
          toast({
            variant: "destructive",
            title: "Update failed",
            description: result.message || "Could not update salesman.",
          });
          return;
        }

        setDeals((prevDeals) =>
          prevDeals.map((existingDeal) =>
            existingDeal.id === deal.id ? { ...existingDeal, ...result.deal } : existingDeal
          )
        );
        setSalesmanDraftByDeal((prev) => ({
          ...prev,
          [deal.id]:
            result.deal?.assignedSalesPerson?.id || result.deal?.representativeId || selectedSalesmanId,
        }));
        toast({
          title: "Salesman updated",
          description: `Deal ${deal.dealId} assigned to ${
            result.deal.assignedSalesPerson?.name || getSalesmanName(selectedSalesmanId)
          }.`,
        });
      } catch (error) {
        console.error("Failed to update deal salesman:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update deal salesman.",
        });
      } finally {
        setUpdatingDealSalesmanId(null);
      }
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
                            onClick={() => setEditOpen(true)}
                            >
                            <Settings className="h-5 w-5 text-blue-500" />
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">Phone: {customer.phone || customer.mobileNo || "—"} {customer.email && `| Email: ${customer.email}`}</p>
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
                                                <span>{getDealTitle(deal)}</span>
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
                                                    {deal.assignedSalesPerson?.name || getSalesmanName(deal.representativeId)}
                                                </Badge>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-2xl font-bold text-primary">₹{calculateTotalApprovedQuotationAmount(deal.id).toLocaleString('en-IN')}</p>
                                            <p className="text-sm text-muted-foreground">{deal.description}</p>
                                            <div
                                              className="mt-3 border-t pt-3 space-y-2"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                              }}
                                            >
                                              <p className="text-xs font-medium text-muted-foreground">Change Salesman</p>
                                              <div className="flex items-center gap-2">
                                                <Select
                                                  value={getDraftSalesmanId(deal) || undefined}
                                                  onValueChange={(value) =>
                                                    setSalesmanDraftByDeal((prev) => ({
                                                      ...prev,
                                                      [deal.id]: value,
                                                    }))
                                                  }
                                                  disabled={updatingDealSalesmanId === deal.id}
                                                >
                                                  <SelectTrigger className="h-8">
                                                    <SelectValue placeholder="Select salesman" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {salesmen.map((salesman) => (
                                                      <SelectItem key={salesman.id} value={salesman.id}>
                                                        {salesman.name}
                                                      </SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  className="h-8"
                                                  disabled={!isDealSalesmanDirty(deal) || updatingDealSalesmanId === deal.id}
                                                  onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    void handleSalesmanChangeForDeal(deal);
                                                  }}
                                                >
                                                  {updatingDealSalesmanId === deal.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                  ) : (
                                                    "Save"
                                                  )}
                                                </Button>
                                              </div>
                                            </div>
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
            customerId={customer.customerId || customer.id}
            salesmen={salesmen}
        />
        <EditCustomerDialog
            isOpen={editOpen}
            onClose={() => setEditOpen(false)}
            customer={customer}
            onSuccess={(updated) => {
                setCustomer(updated);
                setEditOpen(false);
            }}
        />

        </>
    );

    
}
    
