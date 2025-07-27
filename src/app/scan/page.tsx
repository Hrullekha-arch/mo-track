
"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Order, PmsStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Camera, CheckCircle, Loader2, ScanLine, Home } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { PMS_PROCESS_CONFIG } from '@/components/features/pms/pms-constants';
import { completePmsProcess } from '@/ai/flows/complete-pms-process';


function PmsScanner() {
    const router = useRouter();
    const { toast } = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);

    const [scannedId, setScannedId] = useState('');
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

    useEffect(() => {
        const getCameraPermission = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                setHasCameraPermission(true);
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (error) {
                console.error('Error accessing camera:', error);
                setHasCameraPermission(false);
                toast({
                    variant: 'destructive',
                    title: 'Camera Access Denied',
                    description: 'Please enable camera permissions in your browser settings to use the scanner.',
                    duration: 5000,
                });
            }
        };
        getCameraPermission();
         return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [toast]);

    const handleScan = async () => {
        if (!scannedId) {
            toast({ variant: 'destructive', title: 'No ID entered', description: 'Please enter a Deal ID to scan.' });
            return;
        }
        setLoading(true);
        setOrder(null);
        
        try {
            const result = await completePmsProcess({ orderId: scannedId });

            if (!result.success) {
                toast({ variant: 'destructive', title: 'Scan Failed', description: result.message });
            } else {
                 toast({ title: 'Success!', description: result.message });
            }

            // Fetch the latest order data to display details regardless of success/failure
            const ordersRef = collection(db, 'orders');
            const q = query(ordersRef, where('crmOrderNo', '==', scannedId));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const orderDoc = querySnapshot.docs[0];
                setOrder({ id: orderDoc.id, ...orderDoc.data() } as Order);
            } else {
                 setOrder(null);
            }

        } catch (error) {
             toast({
                variant: "destructive",
                title: "Scan Error",
                description: "An unexpected error occurred during the scan.",
            });
            console.error("Error during scan process:", error);
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                    <Button asChild variant="outline" size="icon">
                        <Link href="/"><Home /></Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">PMS Barcode Scanner</h1>
                        <p className="text-muted-foreground">Scan a barcode to complete the production process.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Scanner</CardTitle>
                        <CardDescription>Enter the Deal ID from the barcode sticker and scan.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="aspect-video bg-muted rounded-md overflow-hidden relative flex items-center justify-center mb-4">
                            <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                            {hasCameraPermission === false && (
                                 <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center p-4">
                                    <Camera className="h-12 w-12 text-muted-foreground mb-4"/>
                                    <p className="font-semibold">Camera Access Required</p>
                                    <p className="text-sm text-muted-foreground">Please allow camera access to use this feature.</p>
                                 </div>
                            )}
                             <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-4/5 h-2/5 border-4 border-red-500 rounded-lg bg-black/20" />
                             </div>
                        </div>
                         <div className="flex flex-col sm:flex-row gap-4">
                            <Input 
                                placeholder="Type Deal ID here..."
                                value={scannedId}
                                onChange={(e) => setScannedId(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                            />
                            <Button onClick={handleScan} disabled={loading || !scannedId}>
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />}
                                Simulate Scan
                            </Button>
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Scanned Order Details</CardTitle>
                         <CardDescription>
                           {order ? `Details for order ${order.id}` : 'Scan an order to see details here.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                       {loading && !order && <Skeleton className="h-40 w-full" />}
                       {!loading && order && (
                           <div className="space-y-3">
                               <div>
                                   <p className="text-sm text-muted-foreground">Customer</p>
                                   <p className="font-medium">{order.customerName}</p>
                               </div>
                               <div>
                                   <p className="text-sm text-muted-foreground">Status</p>
                                   <p className="font-medium">{order.milestones.find(m=>m.id === 4)?.completed ? 'Stitching Done' : 'Pending Completion'}</p>
                               </div>
                                {order.milestones.find(m=>m.id === 4)?.completed && (
                                     <Alert className="mt-4" variant="default">
                                        <CheckCircle className="h-4 w-4" />
                                        <AlertTitle>Success!</AlertTitle>
                                        <AlertDescription>
                                            This order's production is complete.
                                        </AlertDescription>
                                    </Alert>
                                )}
                           </div>
                       )}
                       {!loading && !order && (
                           <div className="text-center text-muted-foreground py-10">
                               <p>No order loaded.</p>
                           </div>
                       )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}


export default function PmsScanPage() {
    return (
        <Suspense fallback={<p>Loading...</p>}>
            <PmsScanner />
        </Suspense>
    )
}
