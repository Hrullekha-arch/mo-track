

"use client";

import React, { useEffect, useState, useMemo, useCallback, ReactNode, use } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Customer, Deal, User, Quotation, DealOrder, DealVisit, DealMeasurement, Cpd, Selection, Order } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription,CardFooter } from "@/components/ui/card";
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
  Contact2,
  Eye,
  Loader2,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getCustomerById, getSalesmen } from "../../actions";
import { getDealById, getQuotationsForDeal, getOrdersForDeal, getVisitsForDeal, getMeasurementsForDeal, getCpdsForDeal, getSelectionsForDeal, updateSelectionStatusAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { QuotationDetailDialog } from "@/components/features/order-management/QuotationDetailDialog";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CpdForm } from "@/components/features/customer/CpdForm";
import { VisitForm } from "@/components/features/customer/VisitForm";
import { MeasurementForm } from "@/components/features/customer/MeasurementForm";
import { ProductForm } from "@/components/features/customer/ProductForm";
import { format } from "date-fns";
import { PrintableSelection } from "@/components/features/order-management/PrintableSelection";
import { PrintableCpd, PrintableCustomerCpd } from "@/components/features/customer/PrintableCpd";
import { Table, TableHeader, TableRow, TableBody, TableCell, TableHead } from "@/components/ui/table";


function QuotationsTab({ customerId, dealId, deal, salesmen, cpds, onOrderCreated }: { customerId: string, dealId: string, deal: Deal, salesmen: User[], cpds: Cpd[], onOrderCreated: () => void }) {
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
    const router = useRouter();

    const parseDate = (date: any): Date => {
        if (date instanceof Date) return date;
        if (date && date._seconds) { // Handle Firestore Timestamps
            return new Date(date._seconds * 1000 + (date._nanoseconds || 0) / 1000000);
        }
        if (typeof date === 'string' || typeof date === 'number') {
            const parsed = new Date(date);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        return new Date(); // Fallback
    }

    useEffect(() => {
        const fetchQuotations = async () => {
            setLoading(true);
            const data = await getQuotationsForDeal(customerId, dealId);
            setQuotations(data);
            setLoading(false);
        };
        fetchQuotations();
    }, [customerId, dealId]);
    
    const handleConvertToOrder = (quotation: Quotation) => {
        router.push(`/dashboard/invoice/new?customerId=${customerId}&dealId=${dealId}&quotationId=${quotation.id}`);
    };

    if (loading) {
        return (
            <div className="mt-6">
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }

    return (
        <>
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Quotation Details</CardTitle>
                </CardHeader>
                <CardContent>
                    {quotations.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Quotation No</TableHead>
                                    <TableHead>Quotation Date</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead>Store</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {quotations.map((q, i) => (
                                    <TableRow key={q.id}>
                                        <TableCell>{i + 1}</TableCell>
                                        <TableCell>
                                            <Button variant="link" className="p-0 h-auto" onClick={() => setSelectedQuotation(q)}>
                                                {q.quotationNo}
                                            </Button>
                                        </TableCell>
                                        <TableCell>{format(parseDate(q.date), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell>{q.customerName}</TableCell>
                                        <TableCell>
                                            <Badge variant={
                                                q.status === 'Approved' ? 'default' : 
                                                q.status === 'Converted to Order' ? 'default' : 
                                                'secondary'
                                            } className={cn(
                                                q.status === 'Approved' && 'bg-green-500',
                                                q.status === 'Converted to Order' && 'bg-blue-500'
                                            )}>
                                                {q.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">{q.totalAmount.toFixed(2)}</TableCell>
                                        <TableCell>{q.store}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-10 text-muted-foreground">
                            No quotations have been generated for this deal yet.
                        </div>
                    )}
                </CardContent>
            </Card>
            {selectedQuotation && (
                 <QuotationDetailDialog
                    isOpen={!!selectedQuotation}
                    onClose={() => setSelectedQuotation(null)}
                    quotation={selectedQuotation}
                    deal={deal}
                    salesmen={salesmen}
                    cpds={cpds}
                />
            )}
        </>
    );
}

function OrdersTab({ customerId, dealId }: { customerId: string, dealId: string }) {
    const [orders, setOrders] = useState<DealOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        setLoading(true);
        const q = collection(db, 'customers', customerId, 'deals', dealId, 'orders');
        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DealOrder));
                setOrders(ordersData.sort((a,b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()));
                setLoading(false);
            },
            (error) => {
                console.error("Error fetching orders:", error);
                toast({ variant: "destructive", title: "Error", description: "Could not load orders for this deal." });
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, [customerId, dealId, toast]);
    
    const parseDate = (date: any): Date => {
        if (date instanceof Date) return date;
        if (date && date._seconds) { // Handle Firestore Timestamps
            return new Date(date._seconds * 1000 + (date._nanoseconds || 0) / 1000000);
        }
        if (typeof date === 'string' || typeof date === 'number') {
            const parsed = new Date(date);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        return new Date(); // Fallback
    }

    if (loading) {
        return (
            <div className="mt-6">
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }
    
    return (
         <Card className="mt-6">
            <CardHeader>
                <CardTitle>Orders Details</CardTitle>
            </CardHeader>
            <CardContent>
                {orders.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Order No</TableHead>
                                <TableHead>Order Remark</TableHead>
                                <TableHead>Order Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Created By</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders.map((order, i) => (
                                <TableRow key={order.id}>
                                    <TableCell>{i + 1}</TableCell>
                                    <TableCell>
                                        <Button variant="link" asChild className="p-0 h-auto">
                                            <Link href={`/dashboard/orders/${order.orderNo}`}>{order.orderNo}</Link>
                                        </Button>
                                    </TableCell>
                                    <TableCell>{order.remark || '-'}</TableCell>
                                    <TableCell>{format(parseDate(order.orderDate), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell>
                                        <Badge variant={order.status === 'Approved' ? 'default' : 'secondary'} className={cn(order.status === 'Approved' && 'bg-green-500')}>{order.status}</Badge>
                                    </TableCell>
                                    <TableCell>{order.createdBy}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="text-center py-10 text-muted-foreground">
                        No orders have been generated for this deal yet.
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function VisitsTab({ customerId, dealId, salesmen, visits, onVisitAdded, orders, selections }: { customerId: string, dealId: string, salesmen: User[], visits: DealVisit[], onVisitAdded: (visit: DealVisit) => void, orders: DealOrder[], selections: Selection[] }) {
    const [loading] = useState(false); // Visits are passed as props, no internal loading needed
    const [selectedVisit, setSelectedVisit] = useState<DealVisit | null>(null);

    const renderMeasurementDetails = (visit: DealVisit) => (
        <div className="space-y-2">
            <div>
                <h4 className="font-semibold">Measurements Selected:</h4>
            </div>
        </div>
    );

    const renderDeliveryDetails = (visit: DealVisit) => (
        <div className="space-y-2">
             <div>
                <h4 className="font-semibold">Delivery/Installation Selected:</h4>
            </div>
        </div>
    );


    return (
        <div>
            <VisitForm salesmen={salesmen} customerId={customerId} dealId={dealId} onVisitAdded={onVisitAdded} visits={visits} orders={orders} selections={selections} />
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Visit History</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <Skeleton className="h-24 w-full" />
                    ) : visits.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Due Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Representative</TableHead>
                                    <TableHead>Created By</TableHead>
                                    <TableHead>Created At</TableHead>
                                    <TableHead>Details</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visits.map((visit, i) => (
                                    <TableRow key={visit.id}>
                                        <TableCell>{i + 1}</TableCell>
                                        <TableCell className="capitalize">{visit.typeOfVisit}</TableCell>
                                        <TableCell>
                                            {visit.dueDate ? (
                                                format(new Date(visit.dueDate), 'PPP p')
                                            ) : (
                                                <Badge variant="destructive">Not Set</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={visit.status === 'completed' ? 'default' : 'secondary'} className={cn(visit.status === 'completed' && 'bg-green-600')}>{visit.status || 'requested'}</Badge>
                                        </TableCell>
                                        <TableCell>{salesmen.find(s => s.id === visit.representative)?.name || visit.representative}</TableCell>
                                        <TableCell>{visit.createdBy}</TableCell>
                                        <TableCell>{format(new Date(visit.createdAt), 'dd/MM/yy')}</TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="icon" onClick={() => setSelectedVisit(visit)}>
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-10 text-muted-foreground">
                            No visits have been logged for this deal yet.
                        </div>
                    )}
                </CardContent>
            </Card>
             {selectedVisit && (
                <Dialog open={!!selectedVisit} onOpenChange={() => setSelectedVisit(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Visit Details</DialogTitle>
                            <DialogDescription>
                                Details for visit on {selectedVisit.dueDate ? format(new Date(selectedVisit.dueDate), 'PPP p') : 'N/A'}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                           {selectedVisit.typeOfVisit === 'measurement'
                                ? renderMeasurementDetails(selectedVisit)
                                : renderDeliveryDetails(selectedVisit)}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

function MeasurementsTab({ customer, dealId, measurements }: { customer: Customer; dealId: string, measurements: DealMeasurement[] }) {
    const [localMeasurements, setLocalMeasurements] = useState<DealMeasurement[]>(measurements);
    const { role } = useAuth();
    
    const handleMeasurementAdded = (newMeasurement: DealMeasurement) => {
        setLocalMeasurements(prev => [newMeasurement, ...prev]);
    };

    const getMeasurementStatus = (measurement: DealMeasurement) => {
        const totalEntries = measurement.entries?.length || 0;
        if (totalEntries === 0) return { color: 'bg-gray-200', text: 'Empty' };

        const itemsNeededCount = measurement.entries.filter(e => e.status === 'item-needed').length;

        if (itemsNeededCount === 0) return { color: 'bg-green-500', text: 'Complete' };
        if (itemsNeededCount === totalEntries) return { color: 'bg-red-500', text: 'Item Details Needed' };
        return { color: 'bg-yellow-500', text: 'Partially Detailed' };
    };

    return (
        <div>
            {/* The form to add a new measurement will be on the mobile page for the installer */}
            {role !== 'installer' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Measurement History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {localMeasurements.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Doer</TableHead>
                                        <TableHead>Entries</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {localMeasurements.map((m, i) => {
                                        const status = getMeasurementStatus(m);
                                        return (
                                            <TableRow key={m.id}>
                                                <TableCell>{i + 1}</TableCell>
                                                <TableCell>{m.typeOf}</TableCell>
                                                <TableCell>{m.doerName}</TableCell>
                                                <TableCell>{m.entries?.length || 0}</TableCell>
                                                <TableCell>
                                                    <div className="text-xs">
                                                        <p>{m.createdBy}</p>
                                                        <p className="text-muted-foreground">{format(new Date(m.createdAt), 'dd/MM/yy')}</p>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge style={{ backgroundColor: status.color }} className="text-white">{status.text}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {m.pdfUrl && (
                                                        <Button asChild variant="ghost" size="icon">
                                                            <Link href={m.pdfUrl} target="_blank" rel="noopener noreferrer">
                                                                <Eye className="h-4 w-4" />
                                                            </Link>
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="text-center py-10 text-muted-foreground">
                                No measurements have been logged for this deal yet.
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
             {role === 'installer' && <MeasurementForm onMeasurementAdded={handleMeasurementAdded} customer={customer} dealId={dealId} />}
        </div>
    );
}

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
  const router = useRouter();
  const { customerId, dealId } = params;
  const { toast } = useToast();
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [salesmen, setSalesmen] = useState<User[]>([]);
  const [visits, setVisits] = useState<DealVisit[]>([]);
  const [measurements, setMeasurements] = useState<DealMeasurement[]>([]);
  const [cpds, setCpds] = useState<Cpd[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [orders, setOrders] = useState<DealOrder[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [customerData, dealData, salesmenData, visitsData, measurementsData, cpdsData, quotationsData, ordersData, selectionsData] = await Promise.all([
        getCustomerById(customerId),
        getDealById(customerId, dealId),
        getSalesmen(),
        getVisitsForDeal(customerId, dealId),
        getMeasurementsForDeal(customerId, dealId),
        getCpdsForDeal(customerId, dealId),
        getQuotationsForDeal(customerId, dealId),
        getOrdersForDeal(customerId, dealId),
        getSelectionsForDeal(customerId, dealId)
      ]);
      
      if (!customerData) throw new Error("Customer not found");
      if (!dealData) throw new Error("Deal not found");

      setCustomer(customerData);
      setDeal(dealData);
      setSalesmen(salesmenData);
      setVisits(visitsData);
      setMeasurements(measurementsData);
      setCpds(cpdsData);
      setQuotations(quotationsData);
      setOrders(ordersData);
      setSelections(selectionsData);
      
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

  useEffect(() => {
    if (!customerId || !dealId) return;
    fetchData();
  }, [customerId, dealId, fetchData]);

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
            <p className="text-sm">{deal.description || "No description provided."}</p>
          </div>
        </div>
      </aside>

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
            <TabsTrigger value="cpd"><Contact2 className="mr-2 h-4 w-4" />CPD</TabsTrigger>
            <TabsTrigger value="products"><ShoppingCart className="mr-2 h-4 w-4"/>Products</TabsTrigger>
            <TabsTrigger value="reminder"><Calendar className="mr-2 h-4 w-4"/>Reminder/Notes</TabsTrigger>
            <TabsTrigger value="receipt"><Receipt className="mr-2 h-4 w-4"/>Receipt</TabsTrigger>
            <TabsTrigger value="vas"><Package className="mr-2 h-4 w-4"/>VAS</TabsTrigger>
            <TabsTrigger value="orders"><UserIcon className="mr-2 h-4 w-4"/>Orders</TabsTrigger>
            <TabsTrigger value="quotations"><MessageSquare className="mr-2 h-4 w-4"/>Quotations</TabsTrigger>
            <TabsTrigger value="invoice"><FileText className="mr-2 h-4 w-4"/>Invoice</TabsTrigger>
          </TabsList>
          
          <TabsContent value="visits">
            <VisitsTab customerId={customerId} dealId={dealId} salesmen={salesmen} visits={visits} onVisitAdded={fetchData} orders={orders} selections={selections} />
          </TabsContent>
          
          <TabsContent value="measurement">
            <MeasurementsTab customer={customer} dealId={dealId} measurements={measurements} />
          </TabsContent>

          <TabsContent value="cpd">
            <CpdTab customer={customer} salesmen={salesmen} deal={deal} onRefresh={fetchData} quotations={quotations} cpds={cpds} />
          </TabsContent>
          
          <TabsContent value="products">
            <ProductForm 
                initialProducts={deal.products || []}
                customerId={customerId}
                dealId={dealId}
                onRefresh={fetchData}
                deal={deal}
                customer={customer}
                cpds={cpds}
                quotations={quotations}
                orders={orders}
                initialSelections={selections}
            />
          </TabsContent>

          <TabsContent value="quotations">
             <QuotationsTab 
                customerId={customerId} 
                dealId={dealId} 
                deal={deal} 
                salesmen={salesmen} 
                cpds={cpds} 
                onOrderCreated={fetchData}
            />
          </TabsContent>

          <TabsContent value="orders">
             <OrdersTab customerId={customerId} dealId={dealId} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// CPD Tab Component
function CpdTab({ customer, salesmen, deal, onRefresh, quotations, cpds }: { customer: Customer, salesmen: User[], deal: Deal, onRefresh: () => void, quotations: Quotation[], cpds: Cpd[] }) {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedCpd, setSelectedCpd] = useState<Cpd | null>(null);
    const [customerCpd, setCustomerCpd] = useState<Cpd | null>(null);
    const [isQuotationDialogOpen, setIsQuotationDialogOpen] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        onRefresh();
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsRefreshing(false);
    };

    return (
        <div className="space-y-6">
            <CpdForm customer={customer} salesmen={salesmen} dealId={deal.id} onCpdAdded={onRefresh} />
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Saved CPDs</CardTitle>
                        <CardDescription>Previously saved Customer Product Details for this deal.</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                        {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>CPD ID</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Created By</TableHead>
                                <TableHead>Representative</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {cpds.length > 0 ? cpds.map(cpd => {
                                const isQuotationCreated = quotations.some(q => q.cpdId === cpd.id);
                                return (
                                    <TableRow key={cpd.id}>
                                        <TableCell>
                                            <Button variant="link" className="p-0" onClick={() => setSelectedCpd(cpd)}>
                                                {cpd.cpdId}
                                            </Button>
                                        </TableCell>
                                        <TableCell>{cpd.date ? format(new Date(cpd.date), 'PPP') : 'N/A'}</TableCell>
                                        <TableCell>{cpd.createdBy}</TableCell>
                                        <TableCell>{salesmen.find(s => s.id === cpd.representative)?.name || 'N/A'}</TableCell>
                                         <TableCell className="space-x-2">
                                            <Button size="sm" variant="outline" onClick={() => setCustomerCpd(cpd)}>Customer CPD</Button>
                                            {isQuotationCreated ? (
                                                <Badge variant="default" className="bg-green-500">Quotation Created</Badge>
                                            ) : (
                                                <Button size="sm" disabled>Convert to Quotation</Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )
                            }) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">No CPDs saved for this deal yet.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            <Dialog open={!!selectedCpd} onOpenChange={() => setSelectedCpd(null)}>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                     <DialogHeader>
                        <DialogTitle>CPD Details: {selectedCpd?.cpdId}</DialogTitle>
                        <DialogDescription>A printable view of the Customer Product Details.</DialogDescription>
                    </DialogHeader>
                    {selectedCpd && <PrintableCpd cpd={selectedCpd} customer={customer} deal={deal} salesmen={salesmen} />}
                </DialogContent>
            </Dialog>
            <Dialog open={!!customerCpd} onOpenChange={() => setCustomerCpd(null)}>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                     <DialogHeader>
                        <DialogTitle>Customer CPD: {customerCpd?.cpdId}</DialogTitle>
                        <DialogDescription>A simplified, printable view of the Customer Product Details.</DialogDescription>
                    </DialogHeader>
                    {customerCpd && <PrintableCustomerCpd cpd={customerCpd} customer={customer} />}
                </DialogContent>
            </Dialog>
        </div>
    )
}
