
"use client";

import { useState, useEffect } from 'react';
import { collectionGroup, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Quotation, Deal, Customer, User } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PrintableQuotationProfessional } from '@/components/features/order-management/PrintableQuotationProfessional';

interface EnrichedQuotation extends Quotation {
    dealId: string;
    customerId: string;
}

export default function ApproveQuotationPage() {
    const [quotations, setQuotations] = useState<EnrichedQuotation[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [selectedQuotation, setSelectedQuotation] = useState<EnrichedQuotation | null>(null);
    const [allDeals, setAllDeals] = useState<Record<string, Deal>>({});
    const [allUsers, setAllUsers] = useState<User[]>([]);

    const { toast } = useToast();

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
        if (!selectedQuotation) return;
        setUpdatingId(selectedQuotation.id);
        try {
            const quotationRef = doc(db, 'customers', selectedQuotation.customerId, 'deals', selectedQuotation.dealId, 'quotations', selectedQuotation.id);
            await updateDoc(quotationRef, {
                status: 'Approved'
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
        <div className="p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Approve Quotations</h1>
                <p className="text-muted-foreground">Review and approve pending quotations.</p>
            </header>
            <Card>
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
                </CardContent>
            </Card>

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
        </div>
    );
}
