
"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PurchaseRequest, FabricDetail, FurnitureDetail, InboundMilestone } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, Camera, CheckCircle, Loader2, ScanLine } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

function InboundScan() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const dealId = searchParams.get('dealId');
    const { toast } = useToast();
    const { user } = useAuth();
    const videoRef = useRef<HTMLVideoElement>(null);

    const [request, setRequest] = useState<PurchaseRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

    useEffect(() => {
        if (!dealId) {
            toast({ variant: 'destructive', title: 'Error', description: 'No Deal ID provided.' });
            router.push('/dashboard/inbound');
            return;
        }

        const fetchRequest = async () => {
            const docRef = doc(db, 'purchaseRequests', dealId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = { id: docSnap.id, ...docSnap.data() } as PurchaseRequest;
                if (data.type === 'fabric' && data.fabricDetails) {
                    data.fabricDetails = data.fabricDetails.map(item => ({ ...item, inboundMilestones: item.inboundMilestones || [] }));
                } else if (data.type === 'furniture' && data.furnitureDetails) {
                    data.furnitureDetails = data.furnitureDetails.map(item => ({ ...item, inboundMilestones: item.inboundMilestones || [] }));
                }
                setRequest(data);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: 'Purchase request not found.' });
            }
            setLoading(false);
        };
        fetchRequest();
    }, [dealId, router, toast]);

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

    const handleScan = async () => {
        if (!request || !user) return;
        setScanning(true);

        const items = request.type === 'fabric' ? [...(request.fabricDetails || [])] : [...(request.furnitureDetails || [])];
        const itemToUpdateIndex = items.findIndex(item =>
            !item.inboundMilestones?.some(m => m.stepId === 3 && m.status === 'completed')
        );

        if (itemToUpdateIndex === -1) {
            toast({ title: 'All items already scanned.' });
            setScanning(false);
            return;
        }

        try {
            const itemToUpdate = items[itemToUpdateIndex];
            const newMilestone: InboundMilestone = {
                stepId: 3, // Barcode step
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: user.name,
            };

            const existingMilestoneIndex = itemToUpdate.inboundMilestones?.findIndex(m => m.stepId === 3) ?? -1;
            if (existingMilestoneIndex > -1) {
                itemToUpdate.inboundMilestones![existingMilestoneIndex] = newMilestone;
            } else {
                 itemToUpdate.inboundMilestones = [...(itemToUpdate.inboundMilestones || []), newMilestone];
            }
           
            items[itemToUpdateIndex] = itemToUpdate;

            const payloadKey = request.type === 'fabric' ? 'fabricDetails' : 'furnitureDetails';
            const requestRef = doc(db, "purchaseRequests", request.id);
            await updateDoc(requestRef, { [payloadKey]: items });

            const itemName = (itemToUpdate as any).fabricName || (itemToUpdate as any).furnitureName;
            toast({ title: 'Item Scanned!', description: `${itemName} has been marked as complete.` });
            
            // Manually update local state to reflect change immediately
            setRequest(prev => prev ? { ...prev, [payloadKey]: items } : null);

        } catch (error) {
            console.error('Error updating status on scan:', error);
            toast({ variant: 'destructive', title: 'Update Failed' });
        } finally {
            setScanning(false);
        }
    };

    if (loading) {
        return <Skeleton className="h-[400px] w-full max-w-2xl mx-auto" />;
    }

    if (!request) {
        return <p>Request not found.</p>;
    }
    
    const items = request.type === 'fabric' ? request.fabricDetails : request.furnitureDetails;
    const scannedCount = items?.filter(i => i.inboundMilestones?.some(m => m.stepId === 3 && m.status === 'completed')).length || 0;
    const totalCount = items?.length || 0;


    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl">
             <div className="flex items-center gap-4 mb-4">
                <Button asChild variant="outline" size="icon">
                    <Link href={`/dashboard/inbound/${dealId}`}><ArrowLeft /></Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Barcode Scanner</h1>
                    <p className="text-muted-foreground">For Deal ID: {request.dealId}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Camera Feed</CardTitle>
                        <CardDescription>Point the camera at the item's barcode.</CardDescription>
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
                        </div>
                        <Button 
                            className="w-full mt-4" 
                            onClick={handleScan} 
                            disabled={scanning || hasCameraPermission !== true || scannedCount === totalCount}
                        >
                            {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />}
                            Simulate Scan
                        </Button>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Items to Scan</CardTitle>
                        <CardDescription>
                            Progress: {scannedCount} of {totalCount} items scanned.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                            {(items || []).map((item, index) => {
                                 const detail = item as any;
                                const name = detail.fabricName || detail.furnitureName;
                                const isScanned = item.inboundMilestones?.some(m => m.stepId === 3);

                                return (
                                    <div key={index} className="flex items-center justify-between p-3 rounded-md border bg-card">
                                        <span className="font-medium text-sm">{name}</span>
                                        {isScanned ? (
                                            <CheckCircle className="h-5 w-5 text-green-500" />
                                        ) : (
                                            <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                                        )}
                                    </div>
                                )
                            })}
                             {totalCount === 0 && <p className="text-sm text-muted-foreground text-center py-4">No items in this request.</p>}
                        </div>
                        {scannedCount === totalCount && totalCount > 0 && (
                             <Alert className="mt-4">
                                <CheckCircle className="h-4 w-4" />
                                <AlertTitle>All items scanned!</AlertTitle>
                                <AlertDescription>
                                    You can now return to the inbound process screen.
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}


export default function InboundScanPage() {
    return (
        <Suspense fallback={<p>Loading...</p>}>
            <InboundScan />
        </Suspense>
    )
}
