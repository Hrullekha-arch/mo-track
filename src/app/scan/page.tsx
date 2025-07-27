
"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Order } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, Camera, CheckCircle, Loader2, ScanLine, Search, Home } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';

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
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
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

    const handleSearch = async (dealId: string) => {
        if (!dealId) return;
        setLoading(true);
        setOrder(null);
        try {
            const orderRef = doc(db, 'orders', dealId);
            const docSnap = await getDoc(orderRef);
            if (docSnap.exists()) {
                setOrder({ id: docSnap.id, ...docSnap.data() } as Order);
            } else {
                toast({ variant: 'destructive', title: 'Not Found', description: `Order with ID ${dealId} could not be found.` });
            }
        } catch (error) {
             toast({ variant: 'destructive', title: 'Error', description: 'Failed to search for order.' });
        } finally {
            setLoading(false);
        }
    };
    
    const handleScan = async () => {
        if (!order) return;
        
        const sentToStitching = order.milestones.find(m => m.id === 3);
        const stitchingDone = order.milestones.find(m => m.id === 4);

        if (!sentToStitching?.completed) {
            toast({ variant: "destructive", title: "Not in Production", description: "This order has not been sent to stitching yet." });
            return;
        }
        if (stitchingDone?.completed) {
            toast({ title: "Already Complete", description: "This order's production is already marked as complete." });
            return;
        }

        setLoading(true);
        try {
            const orderRef = doc(db, "orders", order.id);
            const updatedMilestones = order.milestones.map(m => 
                m.id === 4 // "Stitching Done" milestone
                ? { ...m, completed: true, completedAt: new Date().toISOString(), completedBy: "PMS Scanner" }
                : m
            );

            await updateDoc(orderRef, { milestones: updatedMilestones });

            toast({
                title: "Production Complete!",
                description: `Order ${order.id} has been marked as 'Stitching Done'.`,
            });
            setOrder(prev => prev ? {...prev, milestones: updatedMilestones} : null);

        } catch (error) {
             toast({
                variant: "destructive",
                title: "Update Failed",
                description: "Could not update the order's milestone.",
            });
            console.error("Error updating milestone on scan:", error);
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
            
             <Card className="mb-6">
                <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
                    <Input 
                        placeholder="Or type Deal ID here..."
                        value={scannedId}
                        onChange={(e) => setScannedId(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch(scannedId)}
                    />
                    <Button onClick={() => handleSearch(scannedId)} disabled={loading || !scannedId}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                        Search Order
                    </Button>
                </CardContent>
            </Card>


            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Camera Feed</CardTitle>
                        <CardDescription>Camera is active for scanning.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="aspect-video bg-muted rounded-md overflow-hidden relative flex items-center justify-center">
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
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Scanned Order</CardTitle>
                         <CardDescription>
                           {order ? `Details for order ${order.id}` : 'Search for an order to see details here.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                       {loading && <Skeleton className="h-40 w-full" />}
                       {!loading && order && (
                           <div className="space-y-3">
                               <div>
                                   <p className="text-sm text-muted-foreground">Customer</p>
                                   <p className="font-medium">{order.customerName}</p>
                               </div>
                               <div>
                                   <p className="text-sm text-muted-foreground">Status</p>
                                   <p className="font-medium">{order.milestones.find(m=>m.id === 4)?.completed ? 'Stitching Already Done' : 'Pending Completion'}</p>
                               </div>
                                <Button 
                                    className="w-full mt-4" 
                                    onClick={handleScan} 
                                    disabled={loading || order.milestones.find(m=>m.id===4)?.completed}
                                >
                                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                    Mark Production as Complete
                                </Button>
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
