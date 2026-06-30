"use client";
import React, { useEffect, useState, useMemo, useCallback, ReactNode, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Customer, Deal, User, Quotation, DealOrder, DealVisit, DealMeasurement, Cpd, Selection, Order, MeasurementEntry, DealProduct, DealProductsDoc, VasDetail, Receipt } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Calendar, Contact, FileText, GanttChartSquare, Home, MessageSquare, Package, Plane, Receipt as ReceiptIcon, ShoppingCart, User as UserIcon, Contact2, Eye, Loader2, RefreshCw, AlertTriangle, Pencil, Download, Menu, X, Phone, MapPin, MoreHorizontal, PlusCircleIcon, SquareCheckBig, Map, ReceiptIndianRupeeIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getCustomerById, getSalesmen, updateCustomerAction } from "../../actions";
import { getDealById, getDealProducts, getQuotationsForDeal, getOrdersForDeal, getVisitsForDeal, getMeasurementsForDeal, getCpdsForDeal, getSelectionsForDeal, updateSelectionStatusAction, updateDealProducts, createSelectionAction, getReceiptsForDeal, getMeasurementById, getSelectionById, updateQuotationStatusAction, deleteQuotationCascadeAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { QuotationDetailDialog } from "@/components/features/order-management/QuotationDetailDialog";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CpdForm } from "@/components/features/customer/CpdForm";
import { VisitForm } from "@/components/features/customer/VisitForm";
import { MeasurementForm } from "@/components/features/customer/MeasurementForm";
import { ProductForm } from "@/components/features/customer/ProductForm";
import { format } from "date-fns";
import { PrintableSelection } from "@/components/features/order-management/PrintableSelection";
import { PrintableCpd, PrintableCustomerCpd } from "@/components/features/customer/PrintableCpd";
import { Table, TableHeader, TableRow, TableBody, TableCell, TableHead } from "@/components/ui/table";
import { processMeasurementSubmission } from "@/services/measurement-selection-middleware";
import AddedProduct from "@/components/features/customer/AddedProduct";
import { VasForm } from "@/components/features/customer/VasForm";
import { CreateQuotationDialog } from "@/components/features/order-management/CreateQuotationDialog";
import { ReceiptsTab } from "@/components/features/customer/ReceiptsTab";
import { MeasurementPreviewDialog } from "@/components/features/measurement/MeasurementPreviewDialog";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SelectItem } from "@radix-ui/react-select";
import { Input } from "@/components/ui/input";
import { mapDealProductsDocToUi } from "./deal-page-utils";
import {
  OrdersTab,
  QuotationsTab,
  VisitsTab,
} from "./deal-page-primary-tabs";
import {
  CpdTab,
  CrmActivitySkeleton,
  MeasurementsTab,
} from "./deal-page-secondary-tabs";

type TabKey =
  | "visits"
  | "measurement"
  | "cpd"
  | "added-product"
  | "products"
  | "quotations"
  | "orders"
  | "invoice"
  | "receipt"
  | "reminder";

export default function CrmActivityTrackerPage({ params: paramsPromise }: { params: Promise<{ customerId: string, dealId: string }> }) {
  const params = use(paramsPromise);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { customerId, dealId } = params;
  const { toast } = useToast();
  const { user } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [salesmen, setSalesmen] = useState<User[]>([]);
  const [visits, setVisits] = useState<DealVisit[]>([]);
  const [measurements, setMeasurements] = useState<DealMeasurement[]>([]);
  const [cpds, setCpds] = useState<Cpd[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [orders, setOrders] = useState<DealOrder[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [activityLoading, setActivityLoading] = useState(false);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [isQuotationDialogOpen, setIsQuotationDialogOpen] = useState(false);
  const [quotationInitialItems, setQuotationInitialItems] = useState<DealProduct[]>([]);
  const [quotationInitialVas, setQuotationInitialVas] = useState<VasDetail[]>([]);
  const [quotationInitialData, setQuotationInitialData] = useState<Quotation | null>(null);
  const [viewingSelection, setViewingSelection] = useState<Selection | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);
  const [editCustomerLoading, setEditCustomerLoading] = useState(false);
  const [editCustomerForm, setEditCustomerForm] = useState({ name: "", phone: "", email: "", addressLine1: "" });

  const defaultTab = (searchParams.get('tab') || 'visits') as TabKey;
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  const [loadedTabs, setLoadedTabs] = useState<Partial<Record<TabKey, boolean>>>({});
  const [tabLoading, setTabLoading] = useState<Partial<Record<TabKey, boolean>>>({});
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  // Single source of truth for products in UI
  const [products, setProducts] = useState<DealProduct[]>([]);

    const getProductKey = (p: any) => p.id || p.collectionBrand || p.label || p.bcn ||p.rrpWithGstRs || p.type || `${products.indexOf(p)}`;

    // ✅ derive groupedProducts from products
    const groupedProducts = useMemo(() => {
      return (products || []).reduce((acc, product, index) => {
        const room = (product.room || "Unassigned").trim();
        if (!acc[room]) acc[room] = [];
        // keep originalIndex for delete mapping
        acc[room].push({ ...(product as any), originalIndex: index });
        return acc;
      }, {} as Record<string, (DealProduct & { originalIndex?: number })[]>);
    }, [products]);

    // ✅ Blind dialog state (since you're passing setBlindDialogState)
    const [blindDialogState, setBlindDialogState] = useState<{ isOpen: boolean; roomName: string | null }>({
      isOpen: false,
      roomName: null,
    });

    // ✅ Save products to DB + also update UI immediately
    const handleProductsUpdated = async (updatedProducts: DealProduct[]) => {
      if (!deal) return;

      // ✅ update UI first (instant)
      setProducts(updatedProducts);

      setActivityLoading(true);
      const result = await updateDealProducts(customerId, dealId, updatedProducts, {
        id: user?.id,
        name: user?.name,
      });

      if (result.success) {
        toast({ title: "Activity Updated", description: "Product list has been saved." });
        fetchData(); // pulls fresh deal from DB
      } else {
        toast({ variant: "destructive", title: "Update Failed", description: result.message });
      }

      setActivityLoading(false);
    };

    // Update Activity should save current UI products to dealProducts doc
    const handleUpdateActivity = async () => {
      if (!deal) return;
      await handleProductsUpdated(products);
    };

    // ✅ Create Selection should read from CURRENT UI products
    const handleCreateSelection = async () => {
      if (!user) return toast({ variant: "destructive", title: "Authentication error" });

      const selectedProductIds = Object.keys(selectedRows).filter((id) => selectedRows[id]);
      if (selectedProductIds.length === 0) {
        toast({
          variant: "destructive",
          title: "No Products Selected",
          description: "Please select products to create a selection.",
        });
        return;
      }

      const selectedProducts = (products || []).filter((p) => p.id && selectedProductIds.includes(p.id));
      setSelectionLoading(true);

      try {
        const result = await createSelectionAction(customerId, dealId, selectedProducts, user.name);
        if (result.success) {
          toast({
            title: "Selection Created!",
            description: `Selection #${result.selection?.id} has been saved.`,
          });
          setSelectedRows({});
          fetchData();
        } else {
          toast({ variant: "destructive", title: "Failed to Create Selection", description: result.message });
        }
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
      } finally {
        setSelectionLoading(false);
      }
    };

    // ✅ Quotation click should read from CURRENT UI products
    const handleQuotationClick = () => {
  console.group("🧾 [CREATE QUOTATION] Click Flow");

  console.log("1️⃣ Raw selectedRows:", selectedRows);

  const selectedProductIds = Object.keys(selectedRows).filter(
    (id) => selectedRows[id]
  );

  console.log("2️⃣ Selected Product IDs (from selectedRows):", selectedProductIds);

  console.log(
    "3️⃣ All Products Keys:",
    (products || []).map((p) => ({
      product: p,
      key: getProductKey(p),
    }))
  );

  const itemsToQuote = (products || []).filter((p) =>
    selectedProductIds.includes(getProductKey(p))
  );

  console.log("4️⃣ Matched itemsToQuote:", itemsToQuote);

  if (itemsToQuote.length === 0) {
    console.warn("❌ NO ITEMS MATCHED FOR QUOTATION");

    toast({
      variant: "destructive",
      title: "No Products Selected",
      description: "Please select products to create a quotation.",
    });

    console.groupEnd();
    return;
  }

  const regularItems = itemsToQuote.filter(
    (item) => item.productType !== "VAS"
  );

  const vasItems = itemsToQuote.filter(
    (item) => item.productType === "VAS"
  );

  console.log("5️⃣ Regular Items:", regularItems);
  console.log("6️⃣ VAS Items:", vasItems);

  const initialVas = vasItems.map((item, index) => ({
    vasName: item.subCategory || item.collectionBrand,
    rate: item.rate?.toString() || "0",
    quantity: item.quantity?.toString() || "1",
    room: item.room || "",
  }));

  console.log("7️⃣ Initial VAS Payload:", initialVas);

  setQuotationInitialItems(regularItems);
  setQuotationInitialVas(initialVas);
  setQuotationInitialData(null);
  setIsQuotationDialogOpen(true);

  console.log("✅ Quotation Dialog Opened Successfully");

  console.groupEnd();
};

  const handleCloneQuotation = (quotation: Quotation) => {
    const clonedItems = quotation.items.map((item, index) => ({
      id: item.id || `quotation-item-${index + 1}`,
      collectionBrand: item.collectionBrand,
      serialNo: item.serialNo || "",
      salesDescription: item.salesDescription || item.collectionBrand,
      quantity: String(item.quantity ?? 0),
      rate: item.rate ?? 0,
      mrp: item.rate != null ? String(item.rate) : undefined,
      discountPercent: item.discountPercent ?? 0,
      room: item.room || "",
      noOfPcs: "1",
      remarks: item.remark || "",
    })) as DealProduct[];

    setQuotationInitialItems(clonedItems);
    setQuotationInitialVas(quotation.vasDetails || []);
    setQuotationInitialData(quotation);
    setIsQuotationDialogOpen(true);
  };

  const handleQuotationDialogChange = (open: boolean) => {
    setIsQuotationDialogOpen(open);
    if (!open) {
      setQuotationInitialItems([]);
      setQuotationInitialVas([]);
      setQuotationInitialData(null);
    }
  };






  const fetchCoreData = useCallback(async () => {
    setLoading(true);
    try {
      const [customerData, dealData, salesmenData, dealProductsData] = await Promise.all([
        getCustomerById(customerId),
        getDealById(customerId, dealId),
        getSalesmen(),
        getDealProducts(dealId),
      ]);

      if (!customerData) throw new Error("Customer not found");
      if (!dealData) throw new Error("Deal not found");

      setCustomer(customerData);
      setDeal(dealData);
      setSalesmen(salesmenData);
      setProducts(mapDealProductsDocToUi(dealProductsData));
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
  }, [customerId, dealId, toast]);

  const fetchTabData = useCallback(async (tab: TabKey, force = false) => {
    if (!force && loadedTabs[tab]) return;
    setTabLoading((prev) => ({ ...prev, [tab]: true }));
    try {
      switch (tab) {
        case "visits": {
          const [visitsData, ordersData, selectionsData] = await Promise.all([
            getVisitsForDeal(customerId, dealId),
            getOrdersForDeal(customerId, dealId),
            getSelectionsForDeal(customerId, dealId),
          ]);
          setVisits(visitsData);
          setOrders(ordersData);
          setSelections(selectionsData);
          break;
        }
        case "measurement": {
          const measurementsData = await getMeasurementsForDeal(customerId, dealId);
          setMeasurements(measurementsData);
          break;
        }
        case "cpd": {
          const [cpdsData, quotationsData] = await Promise.all([
            getCpdsForDeal(customerId, dealId),
            getQuotationsForDeal(customerId, dealId),
          ]);
          setCpds(cpdsData);
          setQuotations(quotationsData);
          break;
        }
        case "added-product": {
          const selectionsData = await getSelectionsForDeal(customerId, dealId);
          setSelections(selectionsData);
          break;
        }
        case "receipt": {
          const receiptsData = await getReceiptsForDeal(customerId, dealId);
          setReceipts(receiptsData);
          break;
        }
        case "quotations": {
          const cpdsData = await getCpdsForDeal(customerId, dealId);
          setCpds(cpdsData);
          break;
        }
        default:
          break;
      }
      setLoadedTabs((prev) => ({ ...prev, [tab]: true }));
    } catch (error) {
      console.error(`Failed to fetch ${tab} data:`, error);
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || `Could not load ${tab} data.`,
      });
    } finally {
      setTabLoading((prev) => ({ ...prev, [tab]: false }));
    }
  }, [customerId, dealId, loadedTabs, toast]);

  const fetchData = useCallback(async () => {
    await Promise.all([fetchCoreData(), fetchTabData(activeTab, true)]);
  }, [activeTab, fetchCoreData, fetchTabData]);


  const handleUpdateSelectionStatus = async (selectionId: string, status: 'draft' | 'final') => {
    const result = await updateSelectionStatusAction(customerId, dealId, selectionId, status);
    if (result.success) {
      toast({ title: 'Status Updated', description: result.message });
      fetchData();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
  };

  const handleOpenEditCustomer = () => {
    setEditCustomerForm({
      name: customer?.name || "",
      phone: customer?.phone || customer?.mobileNo || "",
      email: customer?.email || "",
      addressLine1: customer?.billingAddress?.line1 || customer?.addressPinCode || "",
    });
    setIsEditCustomerOpen(true);
  };

  const handleSaveCustomer = async () => {
    if (!editCustomerForm.name.trim()) {
      toast({ variant: "destructive", title: "Name is required" });
      return;
    }
    setEditCustomerLoading(true);
    try {
      await updateCustomerAction(customerId, {
        name: editCustomerForm.name,
        phone: editCustomerForm.phone,
        email: editCustomerForm.email,
        billingAddress: { line1: editCustomerForm.addressLine1 },
      });
      toast({ title: "Customer Updated", description: "Customer details saved successfully." });
      setIsEditCustomerOpen(false);
      fetchCoreData();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update Failed", description: err.message });
    } finally {
      setEditCustomerLoading(false);
    }
  };

  const savedAddresses = useMemo(() => {
      const list = Array.isArray(customer?.savedAddresses)
        ? customer.savedAddresses.filter((addr) => addr?.address)
        : [];
      if (list.length > 0) return list;
      if (customer?.billingAddress?.line1 || customer?.addressPinCode) {
        return [{ address: customer?.billingAddress?.line1 || customer.addressPinCode, landmark: customer.landmark }];
      }
      return [];
    }, [customer]);
  
    const [addressMode, setAddressMode] = useState<"saved" | "new">(
      savedAddresses.length > 0 ? "saved" : "new"
    );


  useEffect(() => {
    if (!customerId || !dealId) return;
    fetchCoreData();
  }, [customerId, dealId, fetchCoreData]);

  useEffect(() => {
    if (!customerId || !dealId) return;
    fetchTabData(activeTab);
  }, [activeTab, customerId, dealId, fetchTabData]);

  useEffect(() => {
    const updateViewport = () => setIsDesktop(window.innerWidth >= 1024);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  if (loading) {
    return <CrmActivitySkeleton />;
  }

  if (!customer || !deal) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Data not found</h2>
        <p className="text-muted-foreground mb-6 text-center">The requested customer or deal could not be loaded.</p>
        <Link href="/dashboard/customers">
          <Button>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
          </Button>
        </Link>
      </div>
    );
  }

  const representativeId = deal.assignedSalesPerson?.id || deal.representativeId;
  const representative = salesmen.find(s => s.id === representativeId);
  const primaryBillingDetail = customer.billingDetails?.[0];

  const tabItems = [
    { value: 'visits', label: 'Visits', icon: Calendar },
    { value: 'measurement', label: 'Measurement', icon: GanttChartSquare },
    { value: 'cpd', label: 'CPD', icon: FileText },
    { value: 'added-product', label: 'Added Product', icon: Package },
    { value: 'products', label: 'Products', icon: ShoppingCart },
    { value: 'quotations', label: 'Quotations', icon: FileText },
    { value: 'orders', label: 'Orders', icon: ShoppingCart },
    { value: 'invoice', label: 'Invoice', icon: ReceiptIcon },
    { value: 'receipt', label: 'Receipt', icon: ReceiptIcon },
    { value: 'reminder', label: 'Reminder/Notes', icon: MessageSquare },
  ];

  console.log("🚀 CRM Activity Data:", {
    customer,
    deal,
    salesmen,
    representative
  });

  const renderTabContent = () => {
    const isFirstLoadForTab = !loadedTabs[activeTab] && !!tabLoading[activeTab];

    if (isFirstLoadForTab) {
      return <CrmActivitySkeleton />;
    }

    switch (activeTab) {
      case "visits":
        return (
          <VisitsTab
            customer={customer}
            deal={deal}
            customerId={customerId}
            dealId={dealId}
            salesmen={salesmen}
            visits={visits}
            onVisitAdded={(visit) => setVisits([...visits, visit])}
            orders={orders}
            selections={selections}
          />
        );
      case "measurement":
        return (
          <MeasurementsTab
            customerId={customerId}
            dealId={dealId}
            measurements={measurements}
            onRefresh={fetchData}
          />
        );
      case "cpd":
        return (
          <CpdTab
            customer={customer}
            salesmen={salesmen}
            deal={deal}
            onRefresh={fetchData}
            quotations={quotations}
            cpds={cpds}
          />
        );
      case "added-product":
        return (
          <AddedProduct
            groupedProducts={groupedProducts}
            fields={products}
            selections={selections}
            selectedRows={selectedRows}
            setSelectedRows={setSelectedRows}
            selectionLoading={selectionLoading}
            activityLoading={activityLoading}
            handleUpdateActivity={handleUpdateActivity}
            handleDeleteItem={(index) => {
              const next = [...products];
              next.splice(index, 1);
              handleProductsUpdated(next);
            }}
            handleViewSelection={setViewingSelection}
            handleCreateSelection={handleCreateSelection}
            handleQuotationClick={handleQuotationClick}
            handleUpdateSelectionStatus={handleUpdateSelectionStatus}
            setBlindDialogState={setBlindDialogState}
            getProductKey={getProductKey}
          />
        );
      case "products":
        return (
          <ProductForm
            initialProducts={products}
            onProductsUpdated={(next) => setProducts(next)}
            onRefresh={fetchData}
          />
        );
      case "quotations":
        return (
          <QuotationsTab
            customerId={customerId}
            dealId={dealId}
            customer={customer}
            deal={deal}
            salesmen={salesmen}
            cpds={cpds}
            onCloneQuotation={handleCloneQuotation}
          />
        );
      case "orders":
        return <OrdersTab customerId={customerId} dealId={dealId} />;
      case "invoice":
        return (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <ReceiptIcon className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>Invoice management coming soon</p>
            </CardContent>
          </Card>
        );
      case "receipt":
        return (
          <ReceiptsTab
            customerId={customerId}
            dealId={dealId}
            receipts={receipts}
            onRefresh={fetchData}
          />
        );
      case "reminder":
        return (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <MessageSquare className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>Reminder and notes feature coming soon</p>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <>
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
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] p-0">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <div className="py-2">
                  {tabItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.value}
                        onClick={() => {
                          setActiveTab(item.value);
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

            {/* Deal Info Cards - Desktop */}
            <Card className="w-full overflow-hidden">
            <CardContent className="p-0">
              {/* Header Section - Deal Summary */}
              <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-2xl font-bold">{deal.title || deal.dealName}</h3>
                      <Badge className="h-6">
                       {deal.status || 'Deal Created'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">ID: {deal.dealId}</p>
                  </div>
                  <div className="text-left lg:text-right">
                    <div className="text-sm text-muted-foreground mb-1">Deal Amount</div>
                    <div className="text-3xl font-bold text-primary">
                      ₹{((typeof deal.expectedValue === "number" ? deal.expectedValue : deal.dealAmount) || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Content Section */}
              <div className="p-6 space-y-6">
                {/* Deal Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {/* Store Info */}
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <MapPin className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Customer Address
                      </div>
                      <div className="font-semibold text-foreground flex flex-wrap gap-1 w-1/2 break-words">
                        {savedAddresses.map((addr, index) => {
                          const addressText = addr.address || `Address ${index + 1}`;
                          const landmarkText = addr.landmark ? ` - ${addr.landmark}` : "";

                          return (
                            <div
                              key={`${addressText}-${index}`}
                              className="whitespace-normal"
                            >
                              {`${addressText}${landmarkText}`}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Representative Info */}
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <UserIcon className="h-5 w-5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Sales Representative
                      </div>
                      <div className="font-semibold text-foreground truncate">
                        {representative?.name || 'Not Assigned'}
                      </div>
                    </div>
                  </div>

                  {/* Contact Person Info */}
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <Contact2 className="h-5 w-5 text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Contact Person
                        </div>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={handleOpenEditCustomer}>
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
                      </div>
                      <div className="font-semibold text-foreground truncate">
                        {customer.name}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {customer.phone || customer.mobileNo || "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Billing Info */}
                  {primaryBillingDetail && (
                    <div className="bg-white/60 backdrop-blur-md border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex gap-4">
                      
                      {/* Icon Section */}
                      <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-xl bg-green-500/10">
                        <Contact2 className="h-5 w-5 text-green-600" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 space-y-2">

                        {/* Header */}
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

                        {/* Name */}
                        <p className="text-sm font-semibold text-foreground">
                          {primaryBillingDetail?.billingName || customer.name}
                        </p>

                        {/* Address */}
                        <div className="flex items-start gap-2 text-xs text-muted-foreground">
                          <MapPin className="h-4 w-4 mt-[2px] text-gray-400" />
                          <p className="leading-relaxed">
                            {primaryBillingDetail?.billingAddress || "Same as Customer Address"}
                          </p>
                        </div>

                        {/* Phone + GST Row */}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">

                          {/* Phone */}
                          <div className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5 text-gray-400" />
                            <span>
                              {customer.phone || customer.mobileNo || "No Phone"}
                            </span>
                          </div>

                          {/* GST */}
                          {primaryBillingDetail?.gstin && (
                            <div className="flex items-center gap-1">
                              <ReceiptIndianRupeeIcon className="h-3.5 w-3.5 text-gray-400" />
                              <span className="font-medium text-foreground">
                                {primaryBillingDetail?.gstin}
                              </span>
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  </div>
                  )}
                  
                </div>

                {/* Deal Description */}
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
          </div>
        </div>

        {/* Mobile Info Cards */}
        <div className="lg:hidden p-4 space-y-3">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Deal Name</div>
                  <div className="font-semibold text-sm">{deal.title || deal.dealName}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Amount</div>
                  <div className="font-semibold text-sm">₹{((typeof deal.expectedValue === "number" ? deal.expectedValue : deal.dealAmount) || 0).toFixed(2)}</div>
                </div>
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer Address:</span>
                  <span className="font-medium flex flex-wrap gap-1 w-1/2 break-words">{customer.billingAddress?.line1 || customer.addressPinCode || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Representative:</span>
                  <span className="font-medium ">{representative?.name || 'N/A'}</span>
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
        </div>

        {/* Content Area */}
        <div className="container mx-auto px-4 lg:px-6 py-6">
          {isDesktop === null ? (
            <CrmActivitySkeleton />
          ) : (
            <>
          {/* Desktop Tabs */}
          {isDesktop && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-5 lg:grid-cols-10 mb-6">
              {tabItems.map((item) => {
                const Icon = item.icon;
                return (
                  <TabsTrigger key={item.value} value={item.value} className="gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="hidden xl:inline">{item.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="visits">
              <VisitsTab
                customer={customer}
                customerId={customerId}
                dealId={dealId}
                salesmen={salesmen}
                visits={visits}
                onVisitAdded={(visit) => setVisits([...visits, visit])}
                orders={orders}
                selections={selections}
              />
            </TabsContent>

            <TabsContent value="measurement">
              <MeasurementsTab
                customerId={customerId}
                dealId={dealId}
                measurements={measurements}
                onRefresh={fetchData}
              />
            </TabsContent>

            <TabsContent value="cpd">
              <CpdTab
                customer={customer}
                salesmen={salesmen}
                deal={deal}
                onRefresh={fetchData}
                quotations={quotations}
                cpds={cpds}
              />
            </TabsContent>

            <TabsContent value="added-product">
              <AddedProduct
                groupedProducts={groupedProducts}
                fields={products}
                selections={selections}
                selectedRows={selectedRows}
                setSelectedRows={setSelectedRows}
                selectionLoading={selectionLoading}
                activityLoading={activityLoading}
                handleUpdateActivity={handleUpdateActivity}
                handleDeleteItem={(index) => {
                  const next = [...products];
                  next.splice(index, 1);
                  handleProductsUpdated(next);
                }}
                handleViewSelection={setViewingSelection}
                handleCreateSelection={handleCreateSelection}
                handleQuotationClick={handleQuotationClick}
                handleUpdateSelectionStatus={handleUpdateSelectionStatus}
                setBlindDialogState={setBlindDialogState}
                getProductKey={getProductKey}
              />
            </TabsContent>

            <TabsContent value="products">
              <ProductForm
                initialProducts={products}
                onProductsUpdated={(next) => setProducts(next)} // ✅ just stage locally
                onRefresh={fetchData}
              />
            </TabsContent>



            <TabsContent value="quotations">
              <QuotationsTab
                customerId={customerId}
                dealId={dealId}
                customer={customer}
                deal={deal}
                salesmen={salesmen}
                cpds={cpds}
                onCloneQuotation={handleCloneQuotation}
              />
            </TabsContent>

            <TabsContent value="orders">
              <OrdersTab customerId={customerId} dealId={dealId} />
            </TabsContent>

            <TabsContent value="invoice">
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <ReceiptIcon className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>Invoice management coming soon</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="receipt">
              <ReceiptsTab
                customerId={customerId}
                dealId={dealId}
                receipts={receipts}
                onRefresh={fetchData}
              />
            </TabsContent>

            <TabsContent value="reminder">
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>Reminder and notes feature coming soon</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          )}

          {/* Mobile Content */}
          {!isDesktop && (
          <div>
            {renderTabContent()}
          </div>
          )}
            </>
          )}
        </div>
      </div>

      {/* Quotation Dialog */}
      <CreateQuotationDialog
        isOpen={isQuotationDialogOpen}
        onOpenChange={handleQuotationDialogChange}
        onSuccess={fetchData}
        deal={deal}
        customer={customer}
        initialItems={quotationInitialItems}
        initialVasDetails={quotationInitialVas}
        initialQuotation={quotationInitialData}
        cpds={cpds}
      />

      {/* Selection View Dialog */}
      <Dialog open={!!viewingSelection} onOpenChange={() => setViewingSelection(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selection Details: #{viewingSelection?.id}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {viewingSelection && (
              <PrintableSelection
                selection={viewingSelection}
                customer={customer}
                deal={deal}
                salesmen={salesmen}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingSelection(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Details Dialog */}
      <Dialog open={isEditCustomerOpen} onOpenChange={setIsEditCustomerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Customer Details</DialogTitle>
            <DialogDescription>Update the customer's name, phone, email, and address.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
              <Input
                value={editCustomerForm.name}
                onChange={(e) => setEditCustomerForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Customer name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={editCustomerForm.phone}
                onChange={(e) => setEditCustomerForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Phone number"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <Input
                value={editCustomerForm.email}
                onChange={(e) => setEditCustomerForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Email address"
                type="email"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Address</label>
              <Input
                value={editCustomerForm.addressLine1}
                onChange={(e) => setEditCustomerForm((f) => ({ ...f, addressLine1: e.target.value }))}
                placeholder="Address line"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditCustomerOpen(false)} disabled={editCustomerLoading}>
              Cancel
            </Button>
            <Button onClick={handleSaveCustomer} disabled={editCustomerLoading}>
              {editCustomerLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

