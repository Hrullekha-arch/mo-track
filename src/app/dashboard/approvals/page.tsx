

"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState, useEffect } from 'react';
import { collection, collectionGroup, query, where, onSnapshot, doc, updateDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Quotation, Deal, Customer, User, Order, PurchaseRequest } from '@/lib/types';
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

interface EnrichedQuotation extends Quotation {
    dealId: string;
    customerId: string;
}

function ApproveQuotationTab() {
    const [quotations, setQuotations] = useState<EnrichedQuotation[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [selectedQuotation, setSelectedQuotation] = useState<EnrichedQuotation | null>(null);
    const [allDeals, setAllDeals] = useState<Record<string, Deal>>({});
    const [allUsers, setAllUsers] = useState<User[]>([]);

    const { toast } = useToast();
    const { user } = useAuth();

    useEffect(() => {
        const fetchRelatedData = async () => {
             const dealsQuery = collectionGroup(db, 'deals');
             const usersQuery = collection(db, 'users');

             const [dealsSnapshot, usersSnapshot] = await Promise.all([
                 getDocs(dealsQuery),
                 getDocs(usersQuery),
             ]);

             const dealsData = dealsSnapshot.docs.reduce((acc, doc) => {
                 acc[doc.id] = { id: doc.id, ...doc.data() } as Deal;
                 return acc;
             }, {} as Record<string, Deal>);
             setAllDeals(dealsData);
             
             const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
             setAllUsers(usersData);
        };
        
        fetchRelatedData();

        const q = query(
            collectionGroup(db, 'quotations'), 
            where('status', '==', 'Pending Approval')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const quotationsData: EnrichedQuotation[] = [];
            snapshot.forEach(doc => {
                const data = doc.data() as Quotation;
                const pathParts = doc.ref.path.split('/');
                const customerId = pathParts[1];
                const dealId = pathParts[3];
                quotationsData.push({ ...data, id: doc.id, customerId, dealId });
            });
            setQuotations(quotationsData);
            setLoading(false);
        }, (error) => {
            console.error("Firestore snapshot error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleApprove = async () => {
        if (!selectedQuotation || !user) return;
        setUpdatingId(selectedQuotation.id);
        try {
            const quotationRef = doc(db, 'customers', selectedQuotation.customerId, 'deals', selectedQuotation.dealId, 'quotations', selectedQuotation.id);
            await updateDoc(quotationRef, {
                status: 'Approved'
            });

            // Save a copy to the approvedQuotations collection
            const approvedQuotationRef = doc(db, 'approvedQuotations', selectedQuotation.id);
            await setDoc(approvedQuotationRef, { 
                ...selectedQuotation, 
                status: 'Approved',
                approvedAt: new Date().toISOString(),
                approvedBy: {
                    id: user.id,
                    name: user.name,
                }
            });
            
            toast({
                title: 'Quotation Approved',
                description: `Quotation #${selectedQuotation.quotationNo} has been approved.`
            });
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
                                    salesmanName={allUsers.find(s => s.id === allDeals[selectedQuotation.dealId]?.representativeId)?.name}
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

function ApprovePurchaseTab() {
    const [requests, setRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const { toast } = useToast();
    const { user, role } = useAuth();
    
    useEffect(() => {
        const q = query(
            collection(db, 'purchaseRequests'), 
            where('status', '==', 'Pending Approval')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
            setRequests(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleApprove = async (request: PurchaseRequest) => {
        if (role !== 'Accounts' && role !== 'admin') {
            toast({ variant: 'destructive', title: 'Permission Denied', description: 'Only Accounts can approve purchase requests.' });
            return;
        }
        setUpdatingId(request.id);
        try {
            const requestRef = doc(db, 'purchaseRequests', request.id);
            await updateDoc(requestRef, {
                status: 'Approved',
                approvedBy: { id: user?.id, name: user?.name },
                approvedAt: new Date().toISOString()
            });
            toast({ title: 'Request Approved', description: `Purchase request for Deal ID ${request.dealId} has been approved.` });
        } catch (error) {
            console.error('Error approving request:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to approve request.' });
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
                            <TableHead>Deal ID</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Items (BCN & Qty)</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {requests.length > 0 ? requests.map(req => {
                            const items = [...(req.fabricDetails || []), ...(req.furnitureDetails || [])];
                            return (
                                <TableRow key={req.id}>
                                    <TableCell className="font-medium">{req.dealId}</TableCell>
                                    <TableCell>{req.customerName}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            {items.map((item, index) => (
                                                <div key={index} className="text-xs">
                                                    <span className="font-semibold">{(item as any).fabricName || (item as any).furnitureName}:</span>
                                                    <span className="text-muted-foreground ml-2">{item.quantity} {(req.type === 'fabric' ? 'Mtr' : 'Pcs')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell className="capitalize">{req.type}</TableCell>
                                    <TableCell>{format(new Date(req.createdAt), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            size="sm"
                                            onClick={() => handleApprove(req)}
                                            disabled={updatingId === req.id || (role !== 'Accounts' && role !== 'admin')}
                                        >
                                            {updatingId === req.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Approve
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )
                        }) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">No purchase requests pending for approval.</TableCell>
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
                <p className="text-muted-foreground">Review and approve quotations and purchase requests.</p>
            </header>
            <Tabs defaultValue="quotations" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="quotations">Approve Quotations</TabsTrigger>
                    <TabsTrigger value="purchases">Approve Purchases</TabsTrigger>
                </TabsList>
                <TabsContent value="quotations" className="mt-0">
                    <ApproveQuotationTab />
                </TabsContent>
                <TabsContent value="purchases" className="mt-0">
                    <ApprovePurchaseTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
