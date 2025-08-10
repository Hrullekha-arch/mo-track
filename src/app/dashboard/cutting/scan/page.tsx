
"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CuttingTask } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, Camera, CheckCircle, Loader2, ScanLine, XCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

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

function CuttingScanner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const taskId = searchParams.get('taskId');
    const bcn = searchParams.get('bcn');
    const { toast } = useToast();

    const [task, setTask] = useState<CuttingTask | null>(null);
    const [loading, setLoading] = useState(true);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const isScanningRef = useRef(false);

    const handleScan = async (scannedValue: string) => {
        if (!task || isScanningRef.current) return;

        isScanningRef.current = true;
        
        console.log("Scanned Value:", scannedValue);

        const itemToUpdate = task.items.find(item => item.bcn === bcn && item.status !== 'cut');

        if (!itemToUpdate) {
            setScanResult({ status: 'warning', message: 'Item not found or already cut.' });
            setIsPopupOpen(true);
            setTimeout(() => {
                setIsPopupOpen(false);
                isScanningRef.current = false;
            }, 1500);
            return;
        }

        const [scannedBcn, scannedLengthStr] = scannedValue.split('|');
        if (!scannedBcn || !scannedLengthStr) {
            setScanResult({ status: 'error', message: 'Invalid barcode format. Expected BCN|Length.' });
            setIsPopupOpen(true);
            setTimeout(() => {
                setIsPopupOpen(false);
                isScanningRef.current = false;
            }, 1500);
            return;
        }

        const scannedLength = parseFloat(scannedLengthStr);
        const expectedLength = parseFloat(itemToUpdate.quantityAllocated.toFixed(2));

        if (scannedBcn !== bcn) {
            setScanResult({ status: 'error', message: 'Wrong Barcode' });
            setIsPopupOpen(true);
            setTimeout(() => {
                setIsPopupOpen(false);
                isScanningRef.current = false;
            }, 1500);
            return;
        }

        if (isNaN(scannedLength) || scannedLength < expectedLength) {
            setScanResult({ status: 'error', message: `Insufficient Length. Expected at least ${expectedLength}, but roll has ${scannedLength}` });
            setIsPopupOpen(true);
            setTimeout(() => {
                setIsPopupOpen(false);
                isScanningRef.current = false;
            }, 1500);
            return;
        }

        try {
            const updatedItems = task.items.map(item =>
                item.bcn === bcn ? { ...item, status: 'cut' as const } : item
            );

            const allItemsCut = updatedItems.every(item => item.status === 'cut');
            const newStatus = allItemsCut ? 'Completed' : 'In Progress';

            const taskRef = doc(db, "Cutting", task.id);
            await updateDoc(taskRef, { items: updatedItems, status: newStatus });
            console.log("Task updated:", { items: updatedItems, status: newStatus }); // Debug log

            setScanResult({ status: 'success', message: 'Verified!' });
            setIsPopupOpen(true);

            if (newStatus === 'Completed') {
                setTimeout(() => {
                    setIsPopupOpen(false);
                    router.push('/dashboard/cutting');
                }, 1500);
            } else {
                setTimeout(() => {
                    setIsPopupOpen(false);
                    isScanningRef.current = false;
                }, 1500);
                setTask(prev => prev ? { ...prev, items: updatedItems, status: newStatus } : null);
            }
        } catch (error) {
            console.error('Error updating status on scan:', error);
            setScanResult({ status: 'error', message: 'Update Failed. Check console for details.' });
            setIsPopupOpen(true);
            setTimeout(() => {
                setIsPopupOpen(false);
                isScanningRef.current = false;
            }, 1500);
        }
    };

    useEffect(() => {
        if (!taskId) {
            toast({ variant: 'destructive', title: 'Error', description: 'No Task ID provided.' });
            router.push('/dashboard/cutting');
            return;
        }

        const fetchTask = async () => {
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

    useEffect(() => {
        const scanner = new Html5QrcodeScanner(
            'reader', 
            { 
                qrbox: { width: 250, height: 250 },
                fps: 10,
            }, 
            false
        );

        function onScanSuccess(decodedText: string, decodedResult: any) {
            scanner.clear();
            handleScan(decodedText);
        }

        function onScanFailure(error: any) {
            // handle scan failure, usually better to ignore and keep scanning.
        }

        scanner.render(onScanSuccess, onScanFailure);

        return () => {
            scanner.clear().catch(error => {
                console.error("Failed to clear html5-qrcode-scanner.", error);
            });
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [task]);


    if (loading) {
        return <Skeleton className="h-[400px] w-full max-w-2xl mx-auto" />;
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
                        <Link href={`/dashboard/cutting`}><ArrowLeft /></Link>
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
                             <div id="reader" className="w-full"></div>
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
        </>
    );
}

export default function CuttingScanPage() {
    return (
        <Suspense fallback={<p>Loading...</p>}>
            <CuttingScanner />
        </Suspense>
    );
}
