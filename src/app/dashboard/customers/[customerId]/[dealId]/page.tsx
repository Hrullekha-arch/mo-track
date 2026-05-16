"use client";

import React, { useState, useCallback, use, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Calendar, FileText, GanttChartSquare, MessageSquare,
  Package, Receipt as ReceiptIcon, ShoppingCart, MapPin, User as UserIcon,
  Contact2, Phone, Menu, AlertTriangle, Loader2, ReceiptIndianRupeeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { useDealData } from "./hooks/useDealData";

// ✅ Lazy load ALL tab components
const VisitsTab = dynamic<any>(() => import("./components/tabs/VisitsTab"), {
  loading: () => <TabSkeleton />, ssr: false,
});
const MeasurementsTab = dynamic<any>(() => import("./components/tabs/MeasurementsTab"), {
  loading: () => <TabSkeleton />, ssr: false,
});
const QuotationsTab = dynamic<any>(() => import("./components/tabs/QuotationsTab"), {
  loading: () => <TabSkeleton />, ssr: false,
});
const OrdersTab = dynamic<any>(() => import("./components/tabs/OrdersTab"), {
  loading: () => <TabSkeleton />, ssr: false,
});
const AddedProductTab = dynamic<any>(() => import("./components/tabs/AddedProductTab"), {
  loading: () => <TabSkeleton />, ssr: false,
});
const ProductsTab = dynamic<any>(() => import("./components/tabs/ProductsTab"), {
  loading: () => <TabSkeleton />, ssr: false,
});
const ReceiptsTab = dynamic<any>(() => import("./components/tabs/ReceiptsTab"), {
  loading: () => <TabSkeleton />, ssr: false,
});

function TabSkeleton() {
  return <div className="space-y-3 p-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>;
}

const TAB_ITEMS = [
  { value: "visits", label: "Visits", icon: Calendar },
  { value: "measurement", label: "Measurement", icon: GanttChartSquare },
  { value: "added-product", label: "Added Product", icon: Package },
  { value: "products", label: "Products", icon: ShoppingCart },
  { value: "quotations", label: "Quotations", icon: FileText },
  { value: "orders", label: "Orders", icon: ShoppingCart },
  { value: "invoice", label: "Invoice", icon: ReceiptIcon },
  { value: "receipt", label: "Receipt", icon: ReceiptIcon },
  { value: "reminder", label: "Reminder/Notes", icon: MessageSquare },
] as const;

export default function CrmActivityTrackerPage({
  params: paramsPromise,
}: { params: Promise<{ customerId: string; dealId: string }> }) {
  const params = use(paramsPromise);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { customerId, dealId } = params;

  const defaultTab = searchParams.get("tab") || "visits";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ✅ Only fetches deal document on mount
  const { data, coreLoading, tabLoading, fetchTabData, refreshDeal, invalidateCache } = useDealData(customerId, dealId);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    fetchTabData(tab);
  }, [fetchTabData]);

  // ✅ Fetch default tab data after deal loads
  React.useEffect(() => {
    if (!coreLoading && data.deal) {
      fetchTabData(defaultTab);
    }
  }, [coreLoading, data.deal, defaultTab, fetchTabData]);

  // ✅ Extract data from deal document
  const deal = data.deal;
  const customer = data.customer;
  const representative = deal?.assignedSalesPerson;
  const savedAddresses = customer?.shippingAddress?.line1;
  const primaryBillingDetail = customer?.billingDetails;

  const renderActiveTab = () => {
    if (tabLoading) {
      return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }

    switch (activeTab) {
      case "visits":
        return (
          <VisitsTab
          customers={data.customer ? [data.customer] : []}
            customerId={customerId}
            dealId={dealId}
          />
        );
      case "measurement":
        return (
          <MeasurementsTab
            customerId={customerId}
            dealId={dealId}
            onRefresh={refreshDeal}
          />
        );
      case "added-product":
        return (
          <AddedProductTab
            customerId={customerId}
            dealId={dealId}
          />
        );
      case "products":
        return (
          <ProductsTab
            customerId={customerId}
            dealId={dealId}
            existingProducts={data.products}
            onProductsSaved={() => {
              invalidateCache(["dealProducts"]);
              void fetchTabData("products");
            }}
          />
        );
      case "quotations":
        return (
          <QuotationsTab
            customerId={customerId}
            dealId={dealId}
            onRefresh={refreshDeal}
          />
        );
      case "orders":
        return (
          <OrdersTab
            customerId={customerId}
            dealId={dealId}
            onRefresh={refreshDeal}
          />
        );
      case "receipt":
        return (
          <ReceiptsTab
            customerId={customerId}
            dealId={dealId}
            receipts={data.receipts}
            onRefresh={refreshDeal}
          />
        );
      case "invoice":
        return <ComingSoonCard icon={ReceiptIcon} message="Invoice management coming soon" />;
      case "reminder":
        return <ComingSoonCard icon={MessageSquare} message="Reminder and notes feature coming soon" />;
      default:
        return null;
    }
  };

  if (coreLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!deal || !customer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Deal not found</h2>
        <Link href="/dashboard/customers">
          <Button><ArrowLeft className="mr-2 h-4 w-4" />Back to Customers</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-semibold text-lg">CRM Activity</h1>
              <p className="text-xs text-muted-foreground">{deal.dealId}</p>
            </div>
          </div>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] p-0">
              <SheetHeader className="p-4 border-b">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div className="py-2">
                {TAB_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.value}
                      onClick={() => {
                        handleTabChange(item.value);
                        setMobileMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors",
                        activeTab === item.value
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block border-b bg-muted/30">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/customers">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold">CRM Activity Tracker</h1>
                <p className="text-muted-foreground">Manage all deal activities in one place</p>
              </div>
            </div>
          </div>
          <DealInfoCard
            deal={deal}
            customer={customer}
            representative={representative}
            primaryBillingDetail={primaryBillingDetail}
            savedAddresses={savedAddresses}
          />
        </div>
      </div>

      {/* Mobile Info */}
      <div className="lg:hidden p-4 space-y-3">
        <MobileDealInfo
          deal={deal}
          customer={customer}
          representative={representative}
        />
      </div>

      {/* Tabs Navigation */}
      <div className="container mx-auto px-4 lg:px-6 py-6">
        <div className="hidden lg:block mb-6">
          <div className="flex flex-wrap gap-2">
            {TAB_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.value}
                  variant={activeTab === item.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleTabChange(item.value)}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Active Tab Content */}
        <Suspense fallback={<TabSkeleton />}>
          {renderActiveTab()}
        </Suspense>
      </div>
    </div>
  );
}

// ── Helper Components ──

function ComingSoonCard({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <Card>
      <CardContent className="p-8 text-center text-muted-foreground">
        <Icon className="mx-auto h-12 w-12 mb-4 opacity-50" />
        <p>{message}</p>
      </CardContent>
    </Card>
  );
}

const DealInfoCard = React.memo(function DealInfoCard({
  deal,
  customer,
  representative,
  primaryBillingDetail,
  savedAddresses,
}: any) {
  return (
    <Card className="w-full overflow-hidden">
      <CardContent className="p-0">
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-2xl font-bold">{deal.title || deal.dealName}</h3>
                <Badge className="h-6">{deal.status || "Deal Created"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">ID: {deal.dealId}</p>
            </div>
            <div className="text-left lg:text-right">
              <div className="text-sm text-muted-foreground mb-1">Deal Amount</div>
              <div className="text-3xl font-bold text-primary">
                ₹{(deal.expectedValue || deal.dealAmount || 0).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Address */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Customer Address
                </div>
                <div className="font-semibold text-foreground">
                  {savedAddresses || "No saved address"}
                </div>
              </div>
            </div>

            {/* Representative */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <UserIcon className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Sales Representative
                </div>
                <div className="font-semibold text-foreground truncate">
                  {representative?.name || "Not Assigned"}
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Contact2 className="h-5 w-5 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Contact Person
                </div>
                <div className="font-semibold text-foreground truncate">
                  {customer.name}
                </div>
                <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {customer.phone || customer.mobileNo || "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Billing */}
            {primaryBillingDetail && (
              <div className="bg-white/60 backdrop-blur-md border rounded-2xl p-4 shadow-sm">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-xl bg-green-500/10">
                    <Contact2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
                        Billing Details
                      </p>
                      {primaryBillingDetail?.gstin && (
                        <span className="text-[10px] px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                          GST Registered
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      {primaryBillingDetail?.billingName || customer.name}
                    </p>
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-4 w-4 mt-[2px] text-gray-400" />
                      <p className="leading-relaxed">
                        {primaryBillingDetail?.billingAddress || "Same as Customer Address"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5 text-gray-400" />
                        <span>{customer.phone || customer.mobileNo || "No Phone"}</span>
                      </div>
                      {primaryBillingDetail?.gstin && (
                        <div className="flex items-center gap-1">
                          <ReceiptIndianRupeeIcon className="h-3.5 w-3.5 text-gray-400" />
                          <span className="font-medium text-foreground">
                            {primaryBillingDetail.gstin}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          {deal.description && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Deal Description
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed">
                  {deal.description}
                </p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

const MobileDealInfo = React.memo(function MobileDealInfo({
  deal,
  customer,
  representative,
}: any) {
  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Deal Name</div>
              <div className="font-semibold text-sm">{deal.title || deal.dealName}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Amount</div>
              <div className="font-semibold text-sm">
                ₹{(deal.expectedValue || deal.dealAmount || 0).toFixed(2)}
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Representative:</span>
              <span className="font-medium">{representative?.name || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contact:</span>
              <span className="font-medium">{customer.name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Mobile:</span>
              <span>{customer.phone || customer.mobileNo || "—"}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      {deal.description && (
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-2">Description</div>
            <p className="text-sm">{deal.description}</p>
          </CardContent>
        </Card>
      )}
    </>
  );
});
