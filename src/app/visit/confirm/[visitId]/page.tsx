

'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Customer, Deal, DealVisit } from '@/lib/types';
import { getCustomerById } from '@/app/dashboard/customers/actions';
import { getDealById } from '@/app/dashboard/customers/[customerId]/[dealId]/actions';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Calendar, Clock, Home, User, CheckCircle, StepBack } from 'lucide-react';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import Image from 'next/image';

const VisitConfirmationPreview = ({
    customerName,
    date,
    time,
    address,
    landmark,
    onBack,
    onSubmit,
    loading
}: {
    customerName: string;
    date: Date;
    time: string;
    address: string;
    landmark: string;
    onBack: () => void;
    onSubmit: () => void;
    loading: boolean;
}) => {
    const combinedDateTime = new Date(date);
    const [hours, minutes] = time.split(':').map(Number);
    combinedDateTime.setHours(hours, minutes);

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle>Review Your Details</CardTitle>
                <CardDescription>Please confirm the information below is correct before submitting.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <div className="space-y-1">
                    <p className="font-semibold">Date & Time</p>
                    <p className="text-muted-foreground">{format(combinedDateTime, "eeee, MMMM do, yyyy 'at' h:mm a")}</p>
                </div>
                <div className="space-y-1">
                    <p className="font-semibold">Address</p>
                    <p className="text-muted-foreground">{address}</p>
                </div>
                 {landmark && (
                    <div className="space-y-1">
                        <p className="font-semibold">Landmark</p>
                        <p className="text-muted-foreground">{landmark}</p>
                    </div>
                )}
            </CardContent>
            <CardFooter className="flex justify-between">
                <Button variant="ghost" onClick={onBack} disabled={loading}>
                    <StepBack className="mr-2 h-4 w-4" /> Edit
                </Button>
                <Button onClick={onSubmit} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm & Submit
                </Button>
            </CardFooter>
        </Card>
    );
};


export default function ConfirmVisitPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();

    const visitId = params.visitId as string;
    const dealId = searchParams.get('dealId');
    const customerId = searchParams.get('customerId');

    const [loading, setLoading] = React.useState(true);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    
    const [customer, setCustomer] = React.useState<Customer | null>(null);
    const [visit, setVisit] = React.useState<DealVisit | null>(null);
    
    const [view, setView] = React.useState<'form' | 'preview' | 'confirmed'>('form');

    const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(new Date());
    const [selectedTime, setSelectedTime] = React.useState<string>('10:00');
    const [address, setAddress] = React.useState('');
    const [landmark, setLandmark] = React.useState('');

    React.useEffect(() => {
        if (!customerId || !dealId || !visitId) {
            toast({ variant: 'destructive', title: 'Error', description: 'Invalid confirmation link.' });
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                const [customerData, visitData] = await Promise.all([
                    getCustomerById(customerId),
                    getDoc(doc(db, 'customers', customerId, 'deals', dealId, 'visits', visitId))
                ]);

                if (!customerData || !visitData.exists()) {
                    throw new Error("Could not find visit details.");
                }

                setCustomer(customerData);
                setAddress(customerData.addressPinCode || '');
                setLandmark(customerData.landmark || '');

                const visitDoc = { id: visitData.id, ...visitData.data() } as DealVisit;
                setVisit(visitDoc);
                if (visitDoc.status === 'approved' && visitDoc.dueDate) {
                    setView('confirmed');
                }

            } catch (error) {
                console.error("Failed to fetch data:", error);
                toast({ variant: "destructive", title: "Error", description: "Could not load visit details." });
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [customerId, dealId, visitId, toast]);

     const handlePreview = () => {
        if (!selectedDate || !selectedTime || !address) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please select a date, time, and provide your address.' });
            return;
        }
        setView('preview');
    };

    const handleSubmit = async () => {
        if (!selectedDate || !selectedTime || !address || !customerId || !dealId || !visitId) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please select a date, time, and provide your address.' });
            return;
        }
        setIsSubmitting(true);
        try {
            const visitRef = doc(db, 'customers', customerId, 'deals', dealId, 'visits', visitId);
            const customerRef = doc(db, 'customers', customerId);

            const [hours, minutes] = selectedTime.split(':').map(Number);
            const combinedDateTime = new Date(selectedDate);
            combinedDateTime.setHours(hours, minutes, 0, 0);
            
            const batch = writeBatch(db);

            batch.update(visitRef, {
                status: 'approved',
                dueDate: combinedDateTime.toISOString(),
                customerAddress: address,
                customerLandmark: landmark
            });
            
            batch.update(customerRef, {
                addressPinCode: address,
                landmark: landmark
            });
            
            await batch.commit();
            
            setView('confirmed');
            toast({ title: 'Visit Confirmed!', description: 'Thank you! Our team will contact you shortly.' });

            // Close the window after a short delay
            setTimeout(() => {
                window.close();
            }, 2000);

        } catch (error) {
            console.error('Error confirming visit:', error);
            toast({ variant: 'destructive', title: 'Submission Failed' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
             <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
                <Skeleton className="h-80 w-full max-w-md" />
            </div>
        )
    }

    if (view === 'confirmed') {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 text-center">
                 <Card className="w-full max-w-md">
                     <CardHeader>
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
                            <CheckCircle className="h-10 w-10 text-green-600" />
                        </div>
                        <CardTitle className="text-2xl">Thank You!</CardTitle>
                        <CardDescription>
                            Your visit has been confirmed. This window will close automatically.
                        </CardDescription>
                    </CardHeader>
                    {visit?.dueDate && (
                        <CardContent>
                            <p className="font-semibold text-lg">{format(new Date(visit!.dueDate), "eeee, MMMM do, yyyy 'at' h:mm a")}</p>
                        </CardContent>
                    )}
                 </Card>
            </div>
        )
    }
    
    if (view === 'preview') {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
                <VisitConfirmationPreview
                    customerName={customer?.name || ''}
                    date={selectedDate!}
                    time={selectedTime}
                    address={address}
                    landmark={landmark}
                    onBack={() => setView('form')}
                    onSubmit={handleSubmit}
                    loading={isSubmitting}
                />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <Image src="/logo.png" alt="MoTrack Logo" width={150} height={75} className="mx-auto mb-4" data-ai-hint="logo" />
                    <CardTitle className="text-2xl">Confirm Your Visit</CardTitle>
                    <CardDescription>Hello, {customer?.name}. Please select your preferred date, time and confirm your address for the visit.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 space-y-2">
                             <Label>Select Date</Label>
                            <CalendarPicker
                                mode="single"
                                selected={selectedDate}
                                onSelect={setSelectedDate}
                                className="rounded-md border p-0"
                                disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1))}
                            />
                        </div>
                        <div className="flex-1 space-y-2">
                             <Label htmlFor="time">Select Time</Label>
                            <Input id="time" type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} />
                        </div>
                    </div>
                     <div className="space-y-4">
                        <div className="space-y-2">
                             <Label htmlFor="address">Confirm Address</Label>
                             <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full Address"/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="landmark">Landmark</Label>
                            <Input id="landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Nearby Landmark"/>
                        </div>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button className="w-full" onClick={handlePreview} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Preview & Confirm
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}

