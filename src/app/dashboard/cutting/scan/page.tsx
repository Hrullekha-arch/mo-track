
"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, writeBatch, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CuttingTask, StockTransaction } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, CheckCircle, Loader2, ScanLine, XCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

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
    const targetBcn = searchParams.get('bcn');

    const [task, setTask] = useState<CuttingTask | null>(null);
    const [loading, setLoading] = useState(true);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const isScanningRef = useRef(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const readerContainerId = "scanner-reader";

    const handleScan = async (scannedData: string) => {
        if (!task || !user || isScanningRef.current) return;
        
        isScanningRef.current = true;

        const itemToUpdate = task.items.find(item => item.bcn === targetBcn && item.status !== 'cut');

        if (!itemToUpdate) {
            setScanResult({ status: 'warning', message: 'Item not found or already cut.' });
            setIsPopupOpen(true);
            setTimeout(() => { setIsPopupOpen(false); isScanningRef.current = false; }, 2000);
            return;
        }

        const parts = scannedData.split('|');
        if (parts.length !== 2) {
            setScanResult({ status: 'error', message: 'Invalid Barcode Format. Expected BCN|Length.' });
            setIsPopupOpen(true);
            setTimeout(() => { setIsPopupOpen(false); isScanningRef.current = false; }, 2000);
            return;
        }

        const scannedBcn = parts[0];
        const scannedLength = parseFloat(parts[1]);
        const expectedOriginalLength = itemToUpdate.originalLength;
        
        if (scannedBcn !== targetBcn) {
            setScanResult({ status: 'error', message: `Wrong Barcode. Scanned ${scannedBcn}, expected ${targetBcn}.` });
            setIsPopupOpen(true);
            setTimeout(() => { setIsPopupOpen(false); isScanningRef.current = false; }, 2000);
            return;
        }

        if (isNaN(scannedLength) || scannedLength.toFixed(2) !== expectedOriginalLength?.toFixed(2)) {
            setScanResult({ status: 'error', message: `Wrong Roll. Scanned length ${scannedLength.toFixed(2)}, expected ${expectedOriginalLength?.toFixed(2)}.` });
            setIsPopupOpen(true);
            setTimeout(() => { setIsPopupOpen(false); isScanningRef.current = false; }, 2500);
            return;
        }

        // Barcode and Length are confirmed, proceed with update
        try {
            const batch = writeBatch(db);

            // 1. Update the Cutting Task
            const updatedItems = task.items.map(item =>
                item.bcn === targetBcn ? { ...item, status: 'cut' as const } : item
            );
            const allItemsCut = updatedItems.every(item => item.status === 'cut');
            const newStatus = allItemsCut ? 'Completed' : 'In Progress';
            const taskRef = doc(db, "Cutting", task.id);
            batch.update(taskRef, { items: updatedItems, status: newStatus });

            // 2. Find and update the corresponding stockSold transaction
            const stockId = targetBcn.replace(/\//g, '-');
            const stockRef = doc(db, 'stocks', stockId);
            const stockAddedSnapshot = await getDocs(query(collection(stockRef, 'stockAdded'), where('lengths', 'array-contains', expectedOriginalLength)));
            
            if (!stockAddedSnapshot.empty) {
                const stockAddedDocRef = stockAddedSnapshot.docs[0].ref;
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
                console.warn(`Could not find parent stock roll for BCN ${targetBcn} with original length ${expectedOriginalLength}.`);
            }
            
            await batch.commit();

            setScanResult({ status: 'success', message: 'Verified!' });
            setIsPopupOpen(true);
    
            if (newStatus === 'Completed') {
                toast({ title: "Task Complete!", description: `All items for order ${task.orderId} have been cut.`});
            }
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
            }, 2000);
        }
    };
    
    useEffect(() => {
        // This effect runs only once after the component mounts
        // It initializes the scanner and sets up the success/error callbacks
        const html5QrCode = new Html5Qrcode(readerContainerId);
        scannerRef.current = html5QrCode;

        function onScanSuccess(decodedText: string) {
            html5QrCode.pause(true); // Pause scanning to process
            if (!isScanningRef.current) {
                handleScan(decodedText).finally(() => {
                    if (html5QrCode.isScanning) {
                        html5QrCode.resume();
                    }
                });
            }
        }

        function onScanError(errorMessage: string) {
            // handle scan error (called every frame where no code is detected)
        }

        const config = {
            fps: 10,
            qrbox: { width: 300, height: 100 }, // Adjusted for barcodes (wider and shorter box)
            aspectRatio: 1.777778, // 16:9 aspect ratio for video
            formatsToSupport: [
                Html5QrcodeSupportedFormats.CODE_128, // Assuming Code 128; add others if needed e.g., CODE_39, EAN_13
            ],
            disableFlip: false,
        };

        html5QrCode.start(
            { facingMode: "environment" }, // Rear camera
            config,
            onScanSuccess,
            onScanError
        ).catch((err) => {
            console.error("Failed to start scanner:", err);
            toast({ variant: 'destructive', title: 'Scanner Error', description: 'Unable to access camera. Please check permissions.' });
        });

        return () => {
            if (html5QrCode.isScanning) {
                html5QrCode.stop().catch(error => {
                    console.error("Failed to stop html5-qrcode.", error);
                });
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const itemToScan = task.items.find(item => item.bcn === targetBcn);
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
                            <CardTitle>Scanner</CardTitle>
                            <CardDescription>Scan the barcode of the fabric roll.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="aspect-video bg-muted rounded-md overflow-hidden relative flex items-center justify-center">
                                <div id={readerContainerId} className="w-full h-full"></div>
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
                            {!itemToScan && <p className="text-destructive">Item with BCN {targetBcn} not found in this task.</p>}
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
