
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, writeBatch, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CuttingTask, StockTransaction } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, CheckCircle, Loader2, ScanLine, XCircle, AlertTriangle, CameraOff } from 'lucide-react';
import Link from 'next/link';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
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

export function CuttingScannerComponent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    const videoRef = useRef<HTMLVideoElement>(null);
    const codeReaderRef = useRef(new BrowserMultiFormatReader());

    const taskId = searchParams.get('taskId');
    const targetBcn = searchParams.get('bcn');

    const [task, setTask] = useState<CuttingTask | null>(null);
    const [loading, setLoading] = useState(true);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const isProcessingRef = useRef(false);

    const handleScan = useCallback(async (scannedData: string) => {
        if (!task || !user || isProcessingRef.current) return;
        
        isProcessingRef.current = true;

        const itemToUpdate = task.items.find(item => item.bcn === targetBcn && item.status !== 'cut');

        if (!itemToUpdate) {
            setScanResult({ status: 'warning', message: 'Item not found or already cut.' });
            setIsPopupOpen(true);
            setTimeout(() => { setIsPopupOpen(false); isProcessingRef.current = false; }, 2000);
            return;
        }

        const parts = scannedData.split('|');
        if (parts.length !== 2) {
            setScanResult({ status: 'error', message: 'Invalid Barcode Format. Expected BCN|Length.' });
            setIsPopupOpen(true);
            setTimeout(() => { setIsPopupOpen(false); isProcessingRef.current = false; }, 2000);
            return;
        }

        const scannedBcn = parts[0];
        const scannedLength = parseFloat(parts[1]);
        const expectedOriginalLength = itemToUpdate.originalLength;
        
        if (scannedBcn !== targetBcn) {
            setScanResult({ status: 'error', message: `Wrong Barcode. Scanned ${scannedBcn}, expected ${targetBcn}.` });
            setIsPopupOpen(true);
            setTimeout(() => { setIsPopupOpen(false); isProcessingRef.current = false; }, 2000);
            return;
        }

        if (isNaN(scannedLength) || scannedLength.toFixed(2) !== expectedOriginalLength?.toFixed(2)) {
            setScanResult({ status: 'error', message: `Wrong Roll. Scanned length ${scannedLength.toFixed(2)}, expected ${expectedOriginalLength?.toFixed(2)}.` });
            setIsPopupOpen(true);
            setTimeout(() => { setIsPopupOpen(false); isProcessingRef.current = false; }, 2500);
            return;
        }

        try {
            const batch = writeBatch(db);
            const updatedItems = task.items.map(item =>
                item.bcn === targetBcn ? { ...item, status: 'cut' as const } : item
            );
            const allItemsCut = updatedItems.every(item => item.status === 'cut');
            const newStatus = allItemsCut ? 'Completed' : 'In Progress';
            const taskRef = doc(db, "Cutting", task.id);
            batch.update(taskRef, { items: updatedItems, status: newStatus });

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
                    batch.update(stockSoldSnapshot.docs[0].ref, { status: 'cut' });
                }
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
                isProcessingRef.current = false;
            }, 2000);
        }
    }, [task, user, targetBcn, toast, router]);

     useEffect(() => {
        const startScanner = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play(); // Ensure video is playing before decoding
                    
                    codeReaderRef.current.decodeFromVideoElement(videoRef.current, (result, err) => {
                         if (result) {
                            handleScan(result.getText());
                         }
                         if (err && !(err instanceof NotFoundException)) {
                             console.error("ZXing Decode Error:", err);
                             setPermissionError("An error occurred during scanning.")
                         }
                    });
                }
            } catch (err) {
                 console.error("Camera permission error:", err);
                 setPermissionError("Camera permission denied. Please enable camera access in your browser settings.");
            }
        };

        startScanner();

        return () => {
            codeReaderRef.current.reset();
            if (videoRef.current?.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [handleScan]);

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
                                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                                {permissionError && (
                                     <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center p-4">
                                        <CameraOff className="h-12 w-12 text-muted-foreground mb-4"/>
                                        <p className="font-semibold">Camera Error</p>
                                        <p className="text-sm text-muted-foreground">{permissionError}</p>
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

