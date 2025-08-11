
"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, writeBatch, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CuttingTask } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, CheckCircle, Loader2, XCircle, AlertTriangle, CameraOff } from 'lucide-react';
import Link from 'next/link';
import { BrowserMultiFormatReader, NotFoundException, BarcodeFormat } from '@zxing/library';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
        <DialogHeader className="p-4 pb-0">
            <DialogTitle>Scan Result</DialogTitle>
        </DialogHeader>
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
  
  const codeReaderRef = useRef(new BrowserMultiFormatReader(new Map([[BarcodeFormat.CODE_128, {}]])));
  
  const taskId = searchParams.get('taskId');
  const targetBcn = searchParams.get('bcn');

  const [task, setTask] = useState<CuttingTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const isProcessingRef = useRef(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const handleScan = useCallback(async (scannedData: string) => {
    if (!task || !user || isProcessingRef.current) return;
    
    const trimmedData = scannedData.trim();
    isProcessingRef.current = true;
    console.log("Barcode detected:", trimmedData);

    const itemToUpdate = task.items.find(item => item.bcn === targetBcn && item.status !== 'cut');

    if (!itemToUpdate) {
      setScanResult({ status: 'warning', message: 'Item not found or already cut.' });
      setIsPopupOpen(true);
      setTimeout(() => {
        setIsPopupOpen(false);
        isProcessingRef.current = false;
      }, 5000);
      return;
    }

    const parts = trimmedData.split('|');
    if (parts.length !== 2) {
      setScanResult({ status: 'error', message: 'Invalid Barcode Format. Expected BCN|Length.' });
      setIsPopupOpen(true);
      setTimeout(() => {
        setIsPopupOpen(false);
        isProcessingRef.current = false;
      }, 5000);
      return;
    }

    const scannedBcn = parts[0];
    const scannedLength = parseFloat(parts[1]);
    const expectedOriginalLength = itemToUpdate.originalLength;

    if (scannedBcn !== targetBcn) {
      setScanResult({ status: 'error', message: `Wrong Barcode. Scanned ${scannedBcn}, expected ${targetBcn}.` });
      setIsPopupOpen(true);
      setTimeout(() => {
        setIsPopupOpen(false);
        isProcessingRef.current = false;
      }, 5000);
      return;
    }

    if (isNaN(scannedLength) || !expectedOriginalLength || scannedLength.toFixed(2) !== expectedOriginalLength.toFixed(2)) {
      setScanResult({ status: 'error', message: `Wrong Roll. Scanned length ${scannedLength.toFixed(2)}, expected ${expectedOriginalLength?.toFixed(2)}.` });
      setIsPopupOpen(true);
      setTimeout(() => {
        setIsPopupOpen(false);
        isProcessingRef.current = false;
      }, 5000);
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
      const stockAddedSnapshot = await getDocs(query(collection(stockRef, 'stockAdded'), where('lengths', 'array-contains', expectedOriginalLength), limit(1)));

      if (!stockAddedSnapshot.empty) {
        const stockAddedDocRef = stockAddedSnapshot.docs[0].ref;
        
        const stockSoldQuery = query(
          collection(stockAddedDocRef, 'stockSold'),
          where('orderId', '==', task.orderId),
          where('status', '==', 'pending for cutting'),
          limit(1)
        );
        const stockSoldSnapshot = await getDocs(stockSoldQuery);

        if (!stockSoldSnapshot.empty) {
          batch.update(stockSoldSnapshot.docs[0].ref, { status: 'cut' });
        } else {
           console.warn(`Could not find a 'pending for cutting' stockSold transaction for order ${task.orderId} and item ${targetBcn} to update.`);
        }
      }

      await batch.commit();

      setScanResult({ status: 'success', message: 'Verified!' });
      setIsPopupOpen(true);

      if (newStatus === 'Completed') {
        toast({ title: "Task Complete!", description: `All items for order ${task.orderId} have been cut.` });
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
      }, 5000);
    }
  }, [task, user, targetBcn, router, toast]);

  useEffect(() => {
    const getCameraPermission = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        setHasCameraPermission(true);
        setStream(mediaStream);
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        toast({
          variant: 'destructive',
          title: 'Camera Access Denied',
          description: 'Please enable camera permissions in your browser settings to use the scanner.',
        });
      }
    };

    getCameraPermission();

    return () => {
        stream?.getTracks().forEach(track => track.stop());
        codeReaderRef.current.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stream && videoRef.current && hasCameraPermission) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        if (videoRef.current && videoRef.current.videoWidth > 0) {
          videoRef.current.play();
  
          const codeReader = codeReaderRef.current;
          codeReader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
            if (result) {
              console.log('Barcode detected:', result.getText());
              handleScan(result.getText());
            }
            if (err && !(err instanceof NotFoundException)) {
              console.error("ZXing Decode Error:", err);
            }
          });
        }
      };
    }
  
    return () => {
      codeReaderRef.current.reset();
    };
  }, [stream, hasCameraPermission, handleScan]);


  useEffect(() => {
    if (!taskId) {
      toast({ variant: 'destructive', title: 'Error', description: 'No Task ID provided.' });
      router.push('/dashboard/cutting');
      return;
    }

    const fetchTask = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'Cutting', taskId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setTask({ id: docSnap.id, ...docSnap.data() } as CuttingTask);
        } else {
          toast({ variant: 'destructive', title: 'Error', description: 'Cutting task not found.' });
        }
      } catch (error) {
        console.error('Error fetching task:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load task.' });
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
                <video ref={videoRef} className="w-full h-full object-cover" />
                {hasCameraPermission === false && (
                  <Alert variant="destructive" className="absolute m-4">
                    <CameraOff className="h-4 w-4" />
                    <AlertTitle>Camera Access Required</AlertTitle>
                    <AlertDescription>
                        Please allow camera access to use this feature.
                    </AlertDescription>
                  </Alert>
                )}
                 {hasCameraPermission === null && (
                     <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center p-4">
                        <Loader2 className="h-12 w-12 text-muted-foreground animate-spin mb-4" />
                        <p className="font-semibold">Initializing Camera...</p>
                    </div>
                )}
                {hasCameraPermission === true && (
                  <div className="absolute inset-0 border-4 border-red-500/50 m-4 pointer-events-none rounded-lg" />
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Item to Cut</CardTitle>
              <CardDescription>Verify the following item has been cut.</CardDescription>
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
                      <AlertDescription>This item has been successfully marked as cut.</AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <AlertTitle>Pending Verification</AlertTitle>
                      <AlertDescription>Please scan the barcode on the roll to verify the cut.</AlertDescription>
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
