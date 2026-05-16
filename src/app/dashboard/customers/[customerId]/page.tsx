"use client";

import * as React from "react";
import { use } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  Edit,
  PlusCircle,
  Settings,
  Trash2,
  Users,
  TrendingUp,
  Phone,
  Mail,
} from "lucide-react";
import { Customer, Deal, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getCustomerById,
  getDealsForCustomer,
  getSalesmen,
} from "../actions";
import { deleteDealAction } from "./actions";
import { useRouter } from "next/navigation";

// ================= DYNAMIC IMPORTS =================
const NewDealDialog = dynamic(
  () =>
    import("@/components/features/customer/NewDealDialog").then(
      (mod) => mod.NewDealDialog
    ),
  {
    ssr: false,
    loading: () => null,
  }
);

const EditCustomerDialog = dynamic(
  () =>
    import("@/components/features/customer/NewContactDialog").then(
      (mod) => mod.EditCustomerDialog
    ),
  {
    ssr: false,
    loading: () => null,
  }
);

// ================= TYPES =================
interface CustomerHeaderProps {
  customer: Customer;
  onEditClick: () => void;
}

interface DealCardProps {
  deal: Deal;
  customerId: string;
  onDealDelete: (dealId: string) => void;
}

// ================= UTILITIES =================
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const getDealTitle = (deal: Deal): string => {
  return deal.title || deal.dealName || "Untitled Deal";
};

const calculateTotalQuotationAmount = (deal: Deal): number => {
  return (
    deal.recent?.quotations?.reduce(
      (sum: number, quotation: any) =>
        sum + (Number(quotation.totalAmount) || 0),
      0
    ) ?? 0
  );
};

// ================= CUSTOMER HEADER =================
const CustomerHeader = React.memo(function CustomerHeader({
  customer,
  onEditClick,
}: CustomerHeaderProps) {
  return (
    <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
            <Users className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{customer.name}</h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onEditClick}
              >
                <Settings className="h-4 w-4 text-primary" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
              {(customer.phone || customer.mobileNo) && (
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{customer.phone || customer.mobileNo}</span>
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{customer.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Customer Stats */}
        {customer.customerId && (
          <div className="flex items-center gap-2 ml-14">
            <Badge variant="secondary" className="text-xs">
              ID: {customer.customerId}
            </Badge>
            {customer.city && (
              <Badge variant="outline" className="text-xs">
                {customer.city}
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" asChild>
          <Link href="/dashboard/customers">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>
    </div>
  );
});

// ================= DEAL CARD =================
const DealCard = React.memo(function DealCard({
  deal,
  customerId,
  onDealDelete,
  onEditClick,
}: DealCardProps) {

  const router = useRouter();

  const [isDeleting, setIsDeleting] = React.useState(false);

  const totalAmount = React.useMemo(
    () => calculateTotalQuotationAmount(deal),
    [deal]
  );

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDeleting(true);
    try {
      await onDealDelete(deal.id);
    } finally {
      setIsDeleting(false);
    }
  };
  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onEditClick(deal.id);
  };
  return (
    <div
      className="block h-full"
    >
      <Card onClick={()=>{router.push(`/dashboard/customers/${customerId}/${deal.id}`)}} className="h-full cursor-pointer hover:shadow-lg transition-all duration-200 hover:-translate-y-1 group">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-3">
            <CardTitle className="line-clamp-2 text-base flex-1">
              {getDealTitle(deal)}
            </CardTitle>

            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditClick(deal.id);
                }}
              >
                <Edit className="h-4 w-4" />
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Deal?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete "{getDealTitle(deal)}" and
                      all associated data. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            {deal.dealId && (
              <Badge variant="secondary" className="text-xs">
                ID: {deal.dealId}
              </Badge>
            )}
            {deal.assignedSalesPerson?.name && (
              <Badge variant="outline" className="text-xs">
                {deal.assignedSalesPerson.name}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(totalAmount)}
              </p>
              <p className="text-xs text-muted-foreground">
                Quotation Value
              </p>
            </div>
          </div>

          {deal.description && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {deal.description}
            </p>
          )}

          <div className="pt-3 border-t">
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // TODO: Implement change salesman
              }}
            >
              Change Salesman
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

// ================= EMPTY STATE =================
const EmptyState = React.memo(function EmptyState({
  onCreateDeal,
}: {
  onCreateDeal: () => void;
}) {
  return (
    <div className="text-center py-16 px-6 border-2 border-dashed rounded-xl bg-muted/20">
      <div className="mx-auto max-w-md">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <PlusCircle className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-2xl font-semibold mb-3">No Deals Yet</h3>
        <p className="text-muted-foreground mb-6">
          Get started by creating your first deal for this customer.
        </p>
        <Button onClick={onCreateDeal}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create First Deal
        </Button>
      </div>
    </div>
  );
});

// ================= LOADING STATE =================
const LoadingState = React.memo(function LoadingState() {
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </div>
  );
});

// ================= MAIN PAGE =================
export default function CustomerDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const params = use(paramsPromise);
  const { customerId } = params;
  const { toast } = useToast();

  // ================= STATES =================
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [salesmen, setSalesmen] = React.useState<User[]>([]);
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isNewDealOpen, setIsNewDealOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editDealId, setEditDealId] = React.useState<string | null>(null);  

  // ================= FETCH DATA =================
  React.useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);

        // Parallel fetch for better performance
        const [customerData, dealsData] = await Promise.all([
          getCustomerById(customerId),
          getDealsForCustomer(customerId),
        ]);

        if (!mounted) return;

        if (!customerData) {
          toast({
            variant: "destructive",
            title: "Customer Not Found",
            description: "The requested customer could not be found.",
          });
          return;
        }

        setCustomer(customerData);
        setDeals(dealsData || []);
      } catch (error: any) {
        console.error("Error fetching customer data:", error);
        
        if (mounted) {
          toast({
            variant: "destructive",
            title: "Error Loading Data",
            description:
              error?.message || "Failed to fetch customer data.",
          });
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    if (customerId) {
      fetchData();
    }

    return () => {
      mounted = false;
    };
  }, [customerId, toast]);

  // ================= FETCH SALESMEN (LAZY) =================
  React.useEffect(() => {
    if (!isNewDealOpen || salesmen.length > 0) return;

    getSalesmen()
      .then((data) => setSalesmen(data || []))
      .catch((error) => {
        console.error("Error fetching salesmen:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load salesmen list.",
        });
      });
  }, [isNewDealOpen, salesmen.length, toast]);

  // ================= HANDLERS =================
  const handleNewDealSuccess = React.useCallback(
    (newDeal: Deal) => {
      setDeals((prev) => [newDeal, ...prev]);
      toast({
        title: "Deal Created",
        description: "New deal added successfully.",
      });
      setIsNewDealOpen(false);
    },
    [toast]
  );

  const handleDeleteDeal = React.useCallback(
    async (dealId: string) => {
      try {
        const result = await deleteDealAction(dealId);

        if (!result.success) {
          throw new Error(result.message || "Failed to delete deal");
        }

        // Optimistically update UI
        setDeals((prev) => prev.filter((deal) => deal.id !== dealId));

        toast({
          title: "Deal Deleted",
          description: result.message || "Deal deleted successfully.",
        });
      } catch (error: any) {
        console.error("Error deleting deal:", error);
        toast({
          variant: "destructive",
          title: "Delete Failed",
          description: error?.message || "Failed to delete deal.",
        });
      }
    },
    [toast]
  );

  const handleCustomerUpdate = React.useCallback(
    (updated: Customer) => {
      setCustomer(updated);
      setEditOpen(false);
      toast({
        title: "Customer Updated",
        description: "Customer information updated successfully.",
      });
    },
    [toast]
  );

  // ================= HANDLE DEAL EDIT (TODO) =================
  const handleEditDeal = React.useCallback(
    (dealId: string) => {
      setEditDealId(dealId);
      setIsNewDealOpen(true);
    },
    []
  );

  // ================= LOADING STATE =================
  if (loading) {
    return <LoadingState />;
  }

  // ================= NOT FOUND =================
  if (!customer) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <Users className="h-10 w-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Customer Not Found</h1>
          <p className="text-muted-foreground">
            The customer you're looking for doesn't exist or has been deleted.
          </p>
          <Button variant="outline" asChild className="mt-4">
            <Link href="/dashboard/customers">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Customers
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // ================= MAIN UI =================
  return (
    <>
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* HEADER */}
        <CustomerHeader
          customer={customer}
          onEditClick={() => setEditOpen(true)}
        />

        {/* NEW DEAL BUTTON (MOBILE) */}
        <div className="lg:hidden">
          <Button
            onClick={() => setIsNewDealOpen(true)}
            className="w-full"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            New Deal
          </Button>
        </div>

        <Separator />

        {/* DEALS SECTION */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Deals</h2>
              <p className="text-sm text-muted-foreground">
                {deals.length} {deals.length === 1 ? "deal" : "deals"} found
              </p>
            </div>
            <Button
              onClick={() => setIsNewDealOpen(true)}
              className="hidden lg:flex"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              New Deal
            </Button>
          </div>

          {deals.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {deals.map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  customerId={customerId}
                  onDealDelete={handleDeleteDeal}
                  onEditClick={handleEditDeal}
                />
              ))}
            </div>
          ) : (
            <EmptyState onCreateDeal={() => setIsNewDealOpen(true)} />
          )}
        </div>
      </div>

      {/* DIALOGS */}
      {isNewDealOpen && (
        <NewDealDialog
          isOpen={isNewDealOpen}
          onClose={() => setIsNewDealOpen(false)}
          onSuccess={handleNewDealSuccess}
          customerId={customer.customerId || customer.id}
          customer={customer}
          salesmen={salesmen}
          dealId={editDealId}
        />
      )}



      {editOpen && (
        <EditCustomerDialog
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          customer={customer}
          onSuccess={handleCustomerUpdate}
        />
      )}
    </>
  );
}