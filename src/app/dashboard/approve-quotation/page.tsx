
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

interface EnrichedQuotation extends Quotation {
    dealId: string;
    customerId: string;
}

export default function ApproveQuotationPage() {
    const [quotations, setQuotations] = useState<EnrichedQuotation[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const q = query(
            collectionGroup(db, 'quotations'), 
            where('status', '==', 'Pending Approval')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const quotationsData: EnrichedQuotation[] = [];
            snapshot.forEach(doc => {
                const data = doc.data() as Quotation;
                const pathParts = doc.ref.path.split('/');
                // path is customers/{customerId}/deals/{dealId}/quotations/{quotationId}
                const customerId = pathParts[1];
                const dealId = pathParts[3];
                quotationsData.push({ ...data, id: doc.id, customerId, dealId });
            });
            setQuotations(quotationsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleApprove = async (quotation: EnrichedQuotation) => {
        setUpdatingId(quotation.id);
        try {
            const quotationRef = doc(db, 'customers', quotation.customerId, 'deals', quotation.dealId, 'quotations', quotation.id);
            await updateDoc(quotationRef, {
                status: 'Approved'
            });
            toast({
                title: 'Quotation Approved',
                description: `Quotation #${quotation.quotationNo} has been approved.`
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
                                            onClick={() => handleApprove(q)}
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
        </div>
    );
}
