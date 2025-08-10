
"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, writeBatch, limit, Query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CuttingTask, StockTransaction } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, CheckCircle, Loader2, ScanLine, XCircle, AlertTriangle, Camera } from 'lucide-react';
import Link from 'next/link';
import { Html5Qrcode } from 'html5-qrcode';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ScanStatus = 'success' | 'warning' | 'error';

interface ScanResult {
    status: ScanStatus;
    message: string;
}

const ScanResultPopup = ({ result, isOpen, onOpenChange }: { result: ScanResult | null, isOpen: boolean, onOpenChange: (open: boolean) => void }) => {
    if (!result) return null;

    const { status, message } = result;
    const Icon = status === 'success' ? CheckCircle : status === 'warning' ? AlertTriangle : XCircle;
    const iconColor = status === 'success' ? 'text-green-500' : status === 'warning' ? 'text-orange-400' : 'text-red-500';

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md p-0" hideCloseButton>
                <div className={cn("flex flex-col items-center justify-center p-8 rounded-lg text-center space-y-4")}>
                    <Icon className={cn("h-20 w-20", iconColor)} />
                    <p className="text-xl font-bold">{message}</p>
                </div>
            </DialogContent>
        </Dialog>
    );
};

function CuttingScannerComponent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();

    const taskId = searchParams.get('taskId');
    const bcn = searchParams.get('bcn');

    const [task, setTask] = useState<CuttingTask | null>(null);
    const [loading, setLoading] = useState(true);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const isScanningRef = useRef(false);
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const [isConfirmationDialogOpen, setIsConfirmationDialogOpen] = useState(false);
    const [manualLength, setManualLength] = useState('');
    const videoRef = useRef<HTMLVideoElement>(null);


    const handleScan = async (scannedBcn: string) => {
        if (!task || !user || isScanningRef.current) return;
        
        isScanningRef.current = true; // Prevent multiple scans at once

        const itemToUpdate = task.items.find(item => item.bcn === bcn && item.status !== 'cut');

        if (!itemToUpdate) {
            setScanResult({ status: 'warning', message: 'Item not found or already cut.' });
            setIsPopupOpen(true);
            setTimeout(() => { setIsPopupOpen(false); isScanningRef.current = false; }, 1500);
            return;
        }

        if (scannedBcn !== bcn) {
            setScanResult({ status: 'error', message: 'Wrong Barcode Scanned' });
            setIsPopupOpen(true);
            setTimeout(() => { setIsPopupOpen(false); isScanningRef.current = false; }, 1500);
            return;
        }
        
        // If BCN is correct, open confirmation dialog
        setIsConfirmationDialogOpen(true);
    };

    const handleLengthConfirmation = async () => {
        if (!task || !user) return;

        const itemToUpdate = task.items.find(item => item.bcn === bcn && item.status !== 'cut');
        if (!itemToUpdate) return; // Should not happen if dialog is open

        const enteredLength = parseFloat(manualLength);
        const expectedOriginalLength = itemToUpdate.originalLength;
        
        if (isNaN(enteredLength) || enteredLength.toFixed(2) !== expectedOriginalLength?.toFixed(2)) {
            setScanResult({ status: 'error', message: `Wrong Roll. Expected length ${expectedOriginalLength?.toFixed(2)}, but you entered ${manualLength}.` });
            setIsPopupOpen(true);
            setIsConfirmationDialogOpen(false);
            setManualLength('');
            setTimeout(() => { setIsPopupOpen(false); isScanningRef.current = false; }, 2500);
            return;
        }

        // BCN and Length are confirmed, proceed with update
        setIsConfirmationDialogOpen(false);

        try {
            const batch = writeBatch(db);

            // 1. Update the Cutting Task
            const updatedItems = task.items.map(item =>
                item.bcn === bcn ? { ...item, status: 'cut' as const } : item
            );
            const allItemsCut = updatedItems.every(item => item.status === 'cut');
            const newStatus = allItemsCut ? 'Completed' : 'In Progress';
            const taskRef = doc(db, "Cutting", task.id);
            batch.update(taskRef, { items: updatedItems, status: newStatus });

            // 2. Find and update the corresponding stockSold transaction
            const stockId = bcn.replace(/\//g, '-');
            const stockRef = doc(db, 'stocks', stockId);
            const stockAddedSnapshot = await getDocs(query(collection(stockRef, 'stockAdded'), where('lengths', 'array-contains', expectedOriginalLength)));
            
            if (!stockAddedSnapshot.empty) {
                const stockAddedDocRef = stockAddedSnapshot.docs[0].ref;
                // Find the specific deduction that is pending
                const stockSoldQuery = query(
                    collection(stockAddedDocRef, 'stockSold'),
                    where('orderId', '==', task.orderId),
                    where('quantityChange', '==', -itemToUpdate.quantityAllocated),
                    where('status', '==', 'pending for cutting'),
                    limit(1)
                );
                const stockSoldSnapshot = await getDocs(stockSoldQuery);

                if (!stockSoldSnapshot.empty) {
                    const stockSoldDocRef = stockSoldSnapshot.docs[0].ref;
                    batch.update(stockSoldDocRef, { status: 'cut' });
                } else {
                    console.warn("Could not find matching 'pending for cutting' transaction to update.");
                }
            } else {
                console.warn(`Could not find parent stock roll for BCN ${bcn} with original length ${expectedOriginalLength}.`);
            }
            
            await batch.commit();

            setScanResult({ status: 'success', message: 'Verified!' });
            setIsPopupOpen(true);
    
            if (newStatus === 'Completed') {
                toast({ title: "Task Complete!", description: `All items for order ${task.orderId} have been cut.`});
            }
            // Redirect back to the details page after a short delay
            setTimeout(() => {
                setIsPopupOpen(false);
                router.push(`/dashboard/cutting?taskId=${task.id}`);
            }, 1500);
    
        } catch (error) {
            console.error('Error updating status on scan:', error);
            setScanResult({ status: 'error', message: 'Update Failed. Check console for details.' });
            setIsPopupOpen(true);
            setTimeout(() => {
                setIsPopupOpen(false);
                isScanningRef.current = false;
            }, 1500);
        } finally {
             setManualLength('');
        }
    };
    
    useEffect(() => {
        const getCameraPermission = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play();
                }
                setHasCameraPermission(true);
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
    }, [toast]);


    useEffect(() => {
        if (hasCameraPermission && videoRef.current && !html5QrCodeRef.current) {
            const qrCodeScanner = new Html5Qrcode(videoRef.current);
            html5QrCodeRef.current = qrCodeScanner;

            qrCodeScanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 150 } },
                (decodedText, decodedResult) => {
                    if (!isScanningRef.current) {
                        handleScan(decodedText);
                    }
                },
                (errorMessage) => { /* ignore */ }
            ).catch(err => {
                console.error("Unable to start scanning.", err);
            });
        }
        
        return () => {
            if (html5QrCodeRef.current?.isScanning) {
                html5QrCodeRef.current.stop().catch(err => console.error("Error stopping scanner:", err));
                html5QrCodeRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasCameraPermission]);


    useEffect(() => {
        if (!taskId) {
            toast({ variant: 'destructive', title: 'Error', description: 'No Task ID provided.' });
            router.push('/dashboard/cutting');
            return;
        }

        const fetchTask = async () => {
            setLoading(true);
            const docRef = doc(db, 'Cutting', taskId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setTask({ id: docSnap.id, ...docSnap.data() } as CuttingTask);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: 'Cutting task not found.' });
            }
            setLoading(false);
        };
        fetchTask();
    }, [taskId, router, toast]);

    if (loading) {
        return (
             <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl space-y-4">
                <Skeleton className="h-12 w-96" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Skeleton className="h-96 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </div>
        );
    }

    if (!task) {
        return <p>Task not found.</p>;
    }

    const itemToScan = task.items.find(item => item.bcn === bcn);
    const isItemCut = itemToScan?.status === 'cut';

    return (
        <>
            <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl">
                <div className="flex items-center gap-4 mb-4">
                    <Button asChild variant="outline" size="icon">
                        <Link href={`/dashboard/cutting?taskId=${task.id}`}><ArrowLeft /></Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Verify Cut</h1>
                        <p className="text-muted-foreground">For Task ID: {task.id}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Camera Feed</CardTitle>
                            <CardDescription>Scan the barcode of the fabric roll.</CardDescription>
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
                                {hasCameraPermission === true && (
                                     <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-4/5 h-2/5 border-4 border-red-500 rounded-lg bg-black/20" />
                                     </div>
                                )}
                             </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Item to Cut</CardTitle>
                            <CardDescription>
                                Verify the following item has been cut.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!itemToScan && <p className="text-destructive">Item with BCN {bcn} not found in this task.</p>}
                            {itemToScan && (
                                <div className="p-4 border rounded-lg space-y-2">
                                    <p className="font-bold text-lg">{itemToScan.bcn}</p>
                                    <p>Length from which this is Allocated: <span className="font-semibold">{itemToScan.originalLength?.toFixed(2) || 'N/A'}</span></p>
                                    <p>Quantity to Cut: <span className="font-semibold">{itemToScan.quantityAllocated.toFixed(2)}</span></p>
                                    {isItemCut ? (
                                        <Alert variant="default" className="border-green-500 text-green-700">
                                            <CheckCircle className="h-4 w-4 !text-green-700" />
                                            <AlertTitle>Verified!</AlertTitle>
                                            <AlertDescription>
                                                This item has been successfully marked as cut.
                                            </AlertDescription>
                                        </Alert>
                                    ) : (
                                        <Alert variant="destructive">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <AlertTitle>Pending Verification</AlertTitle>
                                            <AlertDescription>
                                                Please scan the barcode on the roll to verify the cut.
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
            <ScanResultPopup result={scanResult} isOpen={isPopupOpen} onOpenChange={setIsPopupOpen} />
            <Dialog open={isConfirmationDialogOpen} onOpenChange={setIsConfirmationDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Roll Length</DialogTitle>
                        <DialogDescription>
                            BCN {bcn} matched. Please look at the sticker and manually enter the total length of the roll you are about to cut from.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        <Label htmlFor="manual-length">Roll Length</Label>
                        <Input
                            id="manual-length"
                            type="number"
                            value={manualLength}
                            onChange={(e) => setManualLength(e.target.value)}
                            placeholder="e.g., 45.00"
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => { setIsConfirmationDialogOpen(false); isScanningRef.current = false; }}>Cancel</Button>
                        <Button onClick={handleLengthConfirmation} disabled={!manualLength}>Confirm Length & Cut</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}


export default function Page() {
    return (
        <Suspense fallback={<Skeleton className="h-screen w-full" />}>
            <CuttingScannerComponent />
        </Suspense>
    )
}
