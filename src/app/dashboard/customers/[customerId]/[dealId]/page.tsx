
"use client";

import { use, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Customer, Deal, User } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Contact,
  FileText,
  GanttChartSquare,
  Home,
  MessageSquare,
  Package,
  Plane,
  Receipt,
  ShoppingCart,
  User as UserIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { getCustomerById, getSalesmen } from "../../actions";
import { getDealById } from "./actions";

function CrmActivitySkeleton() {
  return (
    <div className="flex h-full">
      <div className="w-80 border-r p-6 hidden lg:block">
        <Skeleton className="h-6 w-3/4 mb-6" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-5 w-3/4" />
          <Separator />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </div>
      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <Skeleton className="h-10 w-full mb-4" />
        <div className="text-center py-20">
          <Skeleton className="h-32 w-32 rounded-full mx-auto mb-4" />
          <Skeleton className="h-8 w-48 mx-auto mb-2" />
          <Skeleton className="h-5 w-64 mx-auto" />
        </div>
      </div>
    </div>
  );
}

export default function CrmActivityTrackerPage({ params: paramsPromise }: { params: Promise<{ customerId: string, dealId: string }> }) {
  const params = use(paramsPromise);
  const { customerId, dealId } = params;
  const { toast } = useToast();
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [salesmen, setSalesmen] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId || !dealId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [customerData, dealData, salesmenData] = await Promise.all([
          getCustomerById(customerId),
          getDealById(customerId, dealId),
          getSalesmen(),
        ]);
        
        if (!customerData) throw new Error("Customer not found");
        if (!dealData) throw new Error("Deal not found");

        setCustomer(customerData);
        setDeal(dealData);
        setSalesmen(salesmenData);
        
      } catch (error) {
        console.error("Failed to fetch CRM activity data:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: (error as Error).message || "Could not load activity data.",
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [customerId, dealId, toast]);

  if (loading) {
    return <CrmActivitySkeleton />;
  }

  if (!customer || !deal) {
    return (
        <div className="flex items-center justify-center h-full">
            <Card className="m-4">
                <CardContent className="p-8 text-center">
                    <h2 className="text-xl font-semibold mb-2">Data not found</h2>
                    <p className="text-muted-foreground mb-4">The requested customer or deal could not be loaded.</p>
                    <Button asChild>
                        <Link href="/dashboard/customers">Back to Customers</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
  }

  const representative = salesmen.find(s => s.id === deal.representativeId);

  return (
    <div className="flex h-full bg-card">
      {/* Left Sidebar */}
      <aside className="w-[300px] flex-shrink-0 border-r p-6 space-y-6 hidden lg:block overflow-y-auto">
        <h2 className="text-lg font-semibold">CRM Activity Tracker</h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">Deal Name</p>
            <p className="font-semibold text-primary">{deal.dealName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Deal Amount:</p>
            <p className="font-semibold">{deal.dealAmount.toFixed(2)}</p>
          </div>
           <div>
            <p className="text-xs text-muted-foreground">Deal Stage:</p>
            <p className="font-semibold">DEAL CREATED</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Store</p>
            <p className="font-semibold">{customer.state || 'MO GCR BRANCH'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Representative</p>
            <p className="font-semibold">{representative?.name || 'N/A'}</p>
          </div>
          <Separator />
          <div>
            <p className="text-xs text-muted-foreground">Contact Person</p>
            <p className="font-semibold">{customer.name}</p>
            <p className="text-sm text-muted-foreground">Mobile No: {customer.mobileNo}</p>
            <p className="text-sm text-muted-foreground">City: {customer.city || 'N/A'}</p>
          </div>
           <Separator />
            <div>
            <p className="text-xs text-muted-foreground">Deal Description:</p>
            <p className="text-sm">{deal.description || "test"}</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <Button variant="outline" asChild>
            <Link href={`/dashboard/customers/${customerId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Deals
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full bg-pink-500 hover:bg-pink-600 text-white">
            <Plane className="h-5 w-5" />
          </Button>
        </div>

        <Tabs defaultValue="visits">
          <TabsList className="mb-4">
            <TabsTrigger value="visits"><Home className="mr-2 h-4 w-4" />Visits</TabsTrigger>
            <TabsTrigger value="measurement"><GanttChartSquare className="mr-2 h-4 w-4"/>Measurement</TabsTrigger>
            <TabsTrigger value="products"><ShoppingCart className="mr-2 h-4 w-4"/>Products</TabsTrigger>
            <TabsTrigger value="reminder"><Calendar className="mr-2 h-4 w-4"/>Reminder/Notes</TabsTrigger>
            <TabsTrigger value="receipt"><Receipt className="mr-2 h-4 w-4"/>Receipt</TabsTrigger>
            <TabsTrigger value="vas"><Package className="mr-2 h-4 w-4"/>VAS</TabsTrigger>
            <TabsTrigger value="orders"><UserIcon className="mr-2 h-4 w-4"/>Orders</TabsTrigger>
            <TabsTrigger value="quotations"><MessageSquare className="mr-2 h-4 w-4"/>Quotations</TabsTrigger>
            <TabsTrigger value="invoice"><FileText className="mr-2 h-4 w-4"/>Invoice</TabsTrigger>
          </TabsList>
          
          <TabsContent value="visits">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Visits</h3>
              <Button>New Visit +</Button>
            </div>
            <div className="text-center border-2 border-dashed rounded-lg p-12">
              <Image src="https://placehold.co/200x150.png" alt="Manage Visits" width={200} height={150} data-ai-hint="illustration visit" className="mx-auto mb-4" />
              <h4 className="text-lg font-semibold">Manage Visits</h4>
              <p className="text-muted-foreground">Visits are not available you can create visit by clicking</p>
              <Button variant="link" className="text-primary">New Visit</Button>
            </div>
            <div className="mt-6 flex items-center gap-4">
                <p className="text-sm text-red-500">Please click on Update Activity if you have updated any changes.</p>
                <Button variant="default" className="bg-cyan-600 hover:bg-cyan-700">Update Activity</Button>
            </div>
          </TabsContent>
          
          {/* Add other TabsContent here */}
          
        </Tabs>
      </main>
    </div>
  );
}
