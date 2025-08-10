
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
import { BrowserMultiFormatReader, NotFoundException, DecodeHintType, BarcodeFormat } from '@zxing/library';
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
                <div className={cn(
                    "flex flex-col items-center justify-center p-8 rounded-lg text-center space-y-4",
                )}>
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
    const videoRef = useRef<HTMLVideoElement>(null);
    const codeReader = useRef(new BrowserMultiFormatReader());

    const [task, setTask] = useState<CuttingTask | null>(null);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const isScanningRef = useRef(false);
    
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
        const startCamera = async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: { exact: 'environment' } } 
            }).catch(() => {
                return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            });
            
            setHasCameraPermission(true);

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play().catch(e => console.error("Play error:", e));
                
                // Allow all formats for testing
                codeReader.current = new BrowserMultiFormatReader(new Map([
                  [DecodeHintType.POSSIBLE_FORMATS, Object.values(BarcodeFormat)]
                ]));

                codeReader.current.decodeFromVideoDevice(
                    undefined,
                    videoRef.current,
                    (result, err) => {
                      if (result) {
                        console.log("DETECTED:", result.getText());
                        if (!isScanningRef.current) {
                          handleScan(result.getText());
                        }
                      }
                      if (err && !(err instanceof NotFoundException)) {
                        // console.error("Decode error:", err);
                      }
                    }
                );
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
    
        startCamera();
    
        return () => {
          if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
          }
          codeReader.current.reset();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    const handleScan = async (scannedValue: string) => {
        if (!task || scanning) return;
        
        isScanningRef.current = true;
        setScanning(true);
        
        const itemToUpdate = task.items.find(item => item.bcn === bcn && item.status !== 'cut');
        
        if (!itemToUpdate) {
            setScanResult({ status: 'warning', message: 'Item not found or already cut.' });
            setIsPopupOpen(true);
            setTimeout(() => {
                setIsPopupOpen(false);
                isScanningRef.current = false;
                setScanning(false);
            }, 1500);
            return;
        }
        
        const [scannedBcn, scannedLengthStr] = scannedValue.split('|');
        const scannedLength = parseFloat(scannedLengthStr);
        const expectedLength = parseFloat(itemToUpdate.quantityAllocated.toFixed(2));

        if (scannedBcn !== bcn) {
            setScanResult({ status: 'error', message: 'Wrong Barcode' });
            setIsPopupOpen(true);
            setTimeout(() => {
                setIsPopupOpen(false);
                isScanningRef.current = false;
                setScanning(false);
            }, 1500);
            return;
        }

        if (isNaN(scannedLength) || scannedLength < expectedLength) {
            setScanResult({ status: 'error', message: 'Insufficient Length' });
            setIsPopupOpen(true);
            setTimeout(() => {
                setIsPopupOpen(false);
                isScanningRef.current = false;
                setScanning(false);
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
                    setScanning(false);
                    isScanningRef.current = false;
                }, 1500);
                setTask(prev => prev ? { ...prev, items: updatedItems, status: newStatus } : null);
            }

        } catch (error) {
            console.error('Error updating status on scan:', error);
            setScanResult({ status: 'error', message: 'Update Failed' });
            setIsPopupOpen(true);
            setTimeout(() => {
                setIsPopupOpen(false);
                isScanningRef.current = false;
                setScanning(false);
            }, 1500);
        }
    };

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
                        <div className="aspect-video bg-muted rounded-md overflow-hidden relative flex items-center justify-center">
                            <video ref={videoRef} className="w-full h-full object-cover" />
                            {hasCameraPermission === false && (
                                 <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center p-4">
                                    <Camera className="h-12 w-12 text-muted-foreground mb-4"/>
                                    <p className="font-semibold">Camera Access Required</p>
                                    <p className="text-sm text-muted-foreground">Please allow camera access.</p>
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
    )
}
