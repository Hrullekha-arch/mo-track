
"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, writeBatch, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Stock, StockTransaction } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, CheckCircle, Loader2, XCircle, AlertTriangle, CameraOff } from 'lucide-react';
import Link from 'next/link';
import { BrowserMultiFormatReader, NotFoundException, BarcodeFormat } from '@zxing/library';
import { cn } from '@/lib/utils';
import { getStockById, getStockTransactions } from '@/app/dashboard/inventory/actions';
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


export function DetailsScannerComponent() {
  const router = useRouter();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const codeReaderRef = useRef(new BrowserMultiFormatReader());
  
  const [scannedStock, setScannedStock] = useState<Stock | null>(null);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(true);
  const isProcessingRef = useRef(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const handleScan = useCallback(async (scannedData: string) => {
    if (isProcessingRef.current) return;
    
    let bcn = scannedData.trim();
    if (bcn.includes('|')) {
      bcn = bcn.split('|')[0];
    }

    isProcessingRef.current = true;
    setLoading(true);
    setScannedStock(null);
    setTransactions([]);
    
    console.log("Barcode detected, processed BCN:", bcn);

    try {
      const stockId = bcn.replace(/\//g, '-');
      const stock = await getStockById(stockId);

      if (stock) {
        setScannedStock(stock);
        const fetchedTransactions = await getStockTransactions(stockId);
        setTransactions(fetchedTransactions);
        toast({ title: 'Stock Found!', description: `Displaying details for ${stock.bcn}` });
        setIsScanning(false);
        codeReaderRef.current.reset();
        stream?.getTracks().forEach(track => track.stop());
      } else {
        toast({ variant: 'destructive', title: 'Not Found', description: `No stock item found for BCN: ${bcn}` });
      }

    } catch (error) {
      console.error('Error fetching stock details:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to fetch stock details.' });
    } finally {
      setLoading(false);
      setTimeout(() => { isProcessingRef.current = false; }, 2000); // Cooldown to prevent rapid re-scans
    }
  }, [stream, toast]);

  const startScan = useCallback(() => {
    if (stream && videoRef.current && hasCameraPermission) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        if (videoRef.current && videoRef.current.videoWidth > 0) {
          videoRef.current.play();
  
          const codeReader = codeReaderRef.current;
          codeReader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
            if (result && !isProcessingRef.current) {
              handleScan(result.getText());
            }
            if (err && !(err instanceof NotFoundException)) {
              console.error("ZXing Decode Error:", err);
            }
          });
        }
      };
    }
  }, [stream, hasCameraPermission, handleScan]);

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
          description: 'Please enable camera permissions to use the scanner.',
        });
      }
    };

    if (isScanning) {
        getCameraPermission();
    }

    return () => {
        stream?.getTracks().forEach(track => track.stop());
        codeReaderRef.current.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);
  
   useEffect(() => {
    if(isScanning) {
        startScan();
    }
  }, [isScanning, startScan]);


  return (
    <>
      <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
          <Button asChild variant="outline" size="icon">
            <Link href={`/dashboard/cutting`}><ArrowLeft /></Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Scan Stock Details</h1>
            <p className="text-muted-foreground">Scan any BCN to get its full history.</p>
          </div>
        </div>

        {isScanning ? (
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
        ) : (
            <div>
                 <Button onClick={() => setIsScanning(true)} className="mb-4">Scan Another Item</Button>
                 {loading &&  <Loader2 className="h-6 w-6 animate-spin mx-auto" />}
                 {scannedStock && (
                     <Card>
                        <CardHeader>
                            <CardTitle>Stock Details: {scannedStock.bcn}</CardTitle>
                            <CardDescription>{scannedStock.itemName}</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                                <p className="text-sm"><strong className="block text-muted-foreground">Sr No:</strong> {scannedStock.serialNo}</p>
                                <p className="text-sm"><strong className="block text-muted-foreground">Rack:</strong> {scannedStock.rack || 'N/A'}</p>
                                <p className="text-sm"><strong className="block text-muted-foreground">Current Stock Qty:</strong> {scannedStock.quantity}</p>
                                <p className="text-sm"><strong className="block text-muted-foreground">Vendor:</strong> {scannedStock.vendorName}</p>
                                <p className="text-sm"><strong className="block text-muted-foreground">Category:</strong> {scannedStock.category}</p>
                                <p className="text-sm"><strong className="block text-muted-foreground">MRP:</strong> ₹{scannedStock.mrp}</p>
                                <p className="text-sm"><strong className="block text-muted-foreground">Last Updated:</strong> {new Date(scannedStock.lastUpdatedAt).toLocaleDateString()}</p>
                            </div>
                            <Separator className="my-4" />
                            <h3 className="font-semibold mb-2">Transaction History</h3>
                            <div className="border rounded-md max-h-96 overflow-y-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background">
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Quantity</TableHead>
                                            <TableHead>Reference</TableHead>
                                            <TableHead>User</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {transactions.map(tx => (
                                            <TableRow key={tx.id}>
                                                <TableCell>{format(new Date(tx.createdAt), 'dd/MM/yy HH:mm')}</TableCell>
                                                <TableCell><Badge variant={tx.type === 'addition' ? 'default' : 'destructive'} className="capitalize">{tx.type}</Badge></TableCell>
                                                <TableCell className={cn(tx.type === 'addition' ? 'text-green-600' : 'text-red-600')}>{tx.quantityChange.toFixed(2)}</TableCell>
                                                <TableCell>{tx.poNumber || tx.orderId}</TableCell>
                                                <TableCell>{tx.createdBy}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                     </Card>
                 )}
            </div>
        )}
      </div>
    </>
  );
}
