

"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState, useEffect } from 'react';
import { collection, collectionGroup, query, where, onSnapshot, doc, updateDoc, getDoc, getDocs, setDoc, writeBatch, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Quotation, Deal, Customer, User, Order, PurchaseRequest, Stock, FabricDetail, O2DStatus } from '@/lib/types';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PrintableQuotationProfessional } from '@/components/features/order-management/PrintableQuotationProfessional';
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getStockById } from "../inventory/actions";
import { approveOrderAndCreatePurchaseRequest, confirmPaymentReceived, approveQuotationAction } from "./actions";

interface EnrichedQuotation extends Quotation {
    dealId: string; // Corrected from dealDocId
    customerId: string;
    dealName: string;
    customerName: string;
}

interface EnrichedOrder extends Order {
    totalAmount?: number;
}


function ApproveQuotationTab() {
    const [quotations, setQuotations] = useState<EnrichedQuotation[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [selectedQuotation, setSelectedQuotation] = useState<EnrichedQuotation | null>(null);
    const [allUsers, setAllUsers] = useState<User[]>([]);

    const { toast } = useToast();
    const { user } = useAuth();

    useEffect(() => {
        setLoading(true);
        // Fetch all users first for enrichment later
        const fetchUsers = async () => {
            try {
                const usersQuery = collection(db, 'users');
                const usersSnapshot = await getDocs(usersQuery);
                const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
                setAllUsers(usersData);
            } catch (error) {
                 console.error("Error fetching users for approvals:", error);
                 toast({
                    variant: 'destructive',
                    title: "Error loading user data",
                    description: "Could not fetch user information."
                });
            }
        }
        
        fetchUsers();
        
        const q = query(
            collectionGroup(db, 'quotations'),
            where('status', '==', 'Pending Approval')
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const pendingQuotations: EnrichedQuotation[] = [];
            
            for (const docSnap of snapshot.docs) {
                const quotationData = docSnap.data() as Quotation;
                const pathParts = docSnap.ref.path.split('/');
                const customerId = pathParts[1];
                const dealId = pathParts[3]; // This is the deal's document ID

                try {
                    const customerSnap = await getDoc(doc(db, 'customers', customerId));
                    const dealSnap = await getDoc(doc(db, 'customers', customerId, 'deals', dealId));

                    pendingQuotations.push({
                        ...quotationData,
                        id: docSnap.id,
                        customerId,
                        dealId, // Correctly assign dealId
                        customerName: customerSnap.exists() ? customerSnap.data().name : 'Unknown Customer',
                        dealName: dealSnap.exists() ? (dealSnap.data().title || dealSnap.data().dealName) : 'Unknown Deal',
                    });
                } catch (error) {
                     console.error(`Failed to enrich quotation ${docSnap.id}:`, error);
                }
            }
            
            setQuotations(pendingQuotations);
            setLoading(false);
        }, (error) => {
             console.error("Error fetching pending quotations:", error);
             toast({
                variant: 'destructive',
                title: "Error loading data",
                description: "Could not fetch quotations for approval. Please check Firestore permissions and indexes."
            });
            setLoading(false);
        });
        
        return () => unsubscribe();

    }, [toast]);


    const handleApprove = async () => {
        if (!selectedQuotation || !user) return;
        setUpdatingId(selectedQuotation.id);
        try {
            // Serialize the quotation object before passing it to the server action
            const plainQuotationObject = JSON.parse(JSON.stringify(selectedQuotation));

            const result = await approveQuotationAction(plainQuotationObject, { id: user.id, name: user.name });
            if (result.success) {
                toast({
                    title: 'Quotation Approved',
                    description: result.message
                });
                // The onSnapshot listener will automatically remove the quotation from the list
            } else {
                 toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: result.message
                });
            }
        } catch (error) {
            console.error('Error approving quotation:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to approve quotation.'
            });
        } finally {
            setUpdatingId(null);
            setSelectedQuotation(null);
        }
    };

    if (loading) {
        return (
            <div className="p-8">
                <Skeleton className="h-8 w-1/2 mb-4" />
                <Skeleton className="h-4 w-3/4 mb-8" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <Card className="mt-4">
            <CardContent className="pt-6">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Quotation No</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Deal Name</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {quotations.length > 0 ? quotations.map(q => (
                            <TableRow key={q.id}>
                                <TableCell className="font-medium">{q.quotationNo}</TableCell>
                                <TableCell>{q.customerName}</TableCell>
                                <TableCell>{q.dealName}</TableCell>
                                <TableCell>{format(new Date(q.createdAt), 'dd/MM/yyyy')}</TableCell>
                                <TableCell className="text-right">{q.totalAmount.toFixed(2)}</TableCell>
                                <TableCell><Badge variant="outline">{q.status}</Badge></TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        size="sm"
                                        onClick={() => setSelectedQuotation(q)}
                                        disabled={updatingId === q.id}
                                    >
                                        {updatingId === q.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Approve
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">No quotations pending for approval.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                 {selectedQuotation && (
                    <Dialog open={!!selectedQuotation} onOpenChange={() => setSelectedQuotation(null)}>
                        <DialogContent className="max-w-[80vw] w-auto">
                            <DialogHeader>
                                <DialogTitle>Confirm Quotation Approval</DialogTitle>
                                <DialogDescription>
                                    Please review the quotation details below before approving. This action cannot be undone.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="max-h-[70vh] overflow-y-auto my-4 border rounded-md">
                               <PrintableQuotationProfessional
                                    values={selectedQuotation}
                                    creatorName={allUsers.find(u => u.id === selectedQuotation.createdBy)?.name}
                                    salesmanName={allUsers.find(s => s.id === selectedQuotation.representativeId)?.name}
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => setSelectedQuotation(null)}>Cancel</Button>
                                <Button onClick={handleApprove} disabled={updatingId === selectedQuotation.id}>
                                    {updatingId === selectedQuotation.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Confirm & Approve
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </CardContent>
        </Card>
    );
}

function ApproveOrdersTab() {
    const [orders, setOrders] = useState<EnrichedOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const { toast } = useToast();
    const { user, role } = useAuth();
    
    useEffect(() => {
        const q = query(
            collection(db, 'orders'), 
            where('status', '==', 'Pending Approval')
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleApprove = async (order: Order) => {
        if (!user || (role !== 'Accounts' && role !== 'admin')) {
            toast({ variant: 'destructive', title: 'Permission Denied', description: 'Only Accounts can approve orders.' });
            return;
        }
        setUpdatingId(order.id);
        try {
            const result = await approveOrderAndCreatePurchaseRequest(order.id, { id: user.id, name: user.name });
            if (result.success) {
                toast({ title: 'Order Approved', description: result.message });
            } else {
                 toast({ variant: 'destructive', title: 'Approval Failed', description: result.message });
            }
        } catch (error) {
            console.error('Error approving order:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to approve order.' });
        } finally {
            setUpdatingId(null);
        }
    };
    
    if (loading) {
        return (
            <div className="p-8">
                <Skeleton className="h-8 w-1/2 mb-4" />
                <Skeleton className="h-4 w-3/4 mb-8" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    
    return (
        <Card className="mt-4">
            <CardContent className="pt-6">
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Items (BCN & Qty)</TableHead>
                            <TableHead>Sales Person</TableHead>
                             <TableHead className="text-right">Total Amount</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.length > 0 ? orders.map(order => {
                            const items = (order.fabricDetails && order.fabricDetails.length > 0)
                                ? order.fabricDetails
                                : (order.sections?.NORMAL?.items || []).map(item => ({
                                    fabricName: item.bcn || item.description || "N/A",
                                    quantity: String(item.qty ?? 0),
                                }));
                            return (
                                <TableRow key={order.id}>
                                    <TableCell className="font-medium">{order.crmOrderNo}</TableCell>
                                    <TableCell>{order.customerName}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            {items.map((item, index) => (
                                                <div key={index} className="text-xs">
                                                    <span className="font-semibold">{item.fabricName}:</span>
                                                    <span className="text-muted-foreground ml-2">{item.quantity} Mtr</span>
                                                </div>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell>{order.salesPerson}</TableCell>
                                    <TableCell className="text-right">₹{order.totalAmount?.toFixed(2)}</TableCell>
                                    <TableCell>{format(new Date(order.createdAt), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            size="sm"
                                            onClick={() => handleApprove(order)}
                                            disabled={updatingId === order.id || (role !== 'Accounts' && role !== 'admin')}
                                        >
                                            {updatingId === order.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Approve
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )
                        }) : (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">No orders pending for approval.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

function PaymentConfirmationTab() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const { toast } = useToast();
    const { user, role } = useAuth();
    
    useEffect(() => {
        const q = query(
            collection(db, 'orders'), 
            where('balanceFollowUp', '==', true),
            where('paymentConfirmed', '!=', true)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(data);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching payment confirmation orders:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleConfirm = async (orderId: string) => {
        if (!user || (role !== 'Accounts' && role !== 'admin')) {
            toast({ variant: 'destructive', title: 'Permission Denied', description: 'Only Accounts can confirm payments.' });
            return;
        }
        setUpdatingId(orderId);
        try {
            const result = await confirmPaymentReceived(orderId, { id: user.id, name: user.name });
            if (result.success) {
                toast({ title: 'Payment Confirmed', description: result.message });
            } else {
                toast({ variant: 'destructive', title: 'Confirmation Failed', description: result.message });
            }
        } catch (error) {
            console.error('Error confirming payment:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to confirm payment.' });
        } finally {
            setUpdatingId(null);
        }
    };
    
    if (loading) {
        return (
            <div className="p-8">
                <Skeleton className="h-8 w-1/2 mb-4" />
                <Skeleton className="h-4 w-3/4 mb-8" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    
    return (
        <Card className="mt-4">
            <CardContent className="pt-6">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Sales Person</TableHead>
                            <TableHead className="text-right">Total Amount</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.length > 0 ? orders.map(order => (
                            <TableRow key={order.id}>
                                <TableCell className="font-medium">{order.crmOrderNo}</TableCell>
                                <TableCell>{order.customerName}</TableCell>
                                <TableCell>{order.salesPerson}</TableCell>
                                <TableCell className="text-right">₹{order.totalAmount?.toFixed(2)}</TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        size="sm"
                                        onClick={() => handleConfirm(order.id)}
                                        disabled={updatingId === order.id || (role !== 'Accounts' && role !== 'admin')}
                                    >
                                        {updatingId === order.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Confirm Payment
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">No orders awaiting payment confirmation.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

export default function ApprovalsPage() {
    return (
        <div className="p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
                <p className="text-muted-foreground">Review and approve quotations, orders, and payments.</p>
            </header>
            <Tabs defaultValue="orders" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="orders">Approve Orders</TabsTrigger>
                    <TabsTrigger value="payment-confirmation">Payment Confirmation</TabsTrigger>
                </TabsList>
                <TabsContent value="quotations" className="mt-0">
                    <ApproveQuotationTab />
                </TabsContent>
                <TabsContent value="orders" className="mt-0">
                    <ApproveOrdersTab />
                </TabsContent>
                <TabsContent value="payment-confirmation" className="mt-0">
                    <PaymentConfirmationTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
