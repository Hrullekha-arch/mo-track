

"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, Loader2, AlertTriangle, CameraOff, ScanLine, Info, Package, DollarSign, History, Pencil, Warehouse, Tag, Barcode, GitCommitHorizontal, GitBranchPlus, ChevronsUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { completePmsProcess } from "./actions";
import { useSearchParams, useRouter } from 'next/navigation';
import { Order, Stock, StockTransaction } from "@/lib/types";
import { getStockDetails, updateStockBatchAction } from "../dashboard/inventory/actions";
import { Separator } from "@/components/ui/separator";
import { doc, updateDoc, getDoc, collection, query, where, getDocs, writeBatch, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import Image from "next/image";

type ScanAction = 'pmsComplete' | 'stockDetail' | 'verifyCut' | 'verifyInbound';

interface StockDetailsData {
    stock: Stock;
    transactions: StockTransaction[];
    availableLengths: { length: number; transactionId: string }[];
}

type ScanResult = {
  status: 'success' | 'warning' | 'error';
  message: string;
  data?: {
      order?: Order | null;
      stockDetails?: StockDetailsData;
  };
};

const updateStockDetailsSchema = z.object({
    mrp: z.string().optional(),
    hsnCode: z.string().optional(),
});

type UpdateStockDetailsValues = z.infer<typeof updateStockDetailsSchema>;


const StockDetailDisplay = ({ stockDetails, onUpdate }: { stockDetails: StockDetailsData, onUpdate: (newStock: Stock) => void }) => {
    const { stock, transactions, availableLengths } = stockDetails;
    const { role } = useAuth();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAdvanceOpen, setIsAdvanceOpen] = useState(false);

    const form = useForm<UpdateStockDetailsValues>({
        resolver: zodResolver(updateStockDetailsSchema),
        defaultValues: {
            mrp: stock.mrp?.toString() || "",
            hsnCode: stock.hsnCode || ""
        }
    });

    const handleUpdate = async (values: UpdateStockDetailsValues) => {
        setIsSubmitting(true);
        try {
            const updatePayload = {
                id: stock.id,
                mrp: parseFloat(values.mrp || '0'),
                hsnCode: values.hsnCode
            };
            const result = await updateStockBatchAction([updatePayload]);
            if (result.success) {
                toast({ title: "Update Successful", description: "Stock details have been updated." });
                onUpdate({ ...stock, ...updatePayload });
            } else {
                toast({ variant: 'destructive', title: "Update Failed", description: result.message });
            }
        } catch (e) {
            toast({ variant: 'destructive', title: "Error", description: "An unexpected error occurred." });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-lg font-bold flex items-center gap-2"><Barcode className="h-5 w-5" /> {stock.bcn}</h3>
                <p className="text-sm text-muted-foreground">{stock.itemName}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm p-3 border rounded-lg bg-muted/50">
                <p className="flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" /><strong>Qty:</strong> {stock.quantity.toFixed(2)}</p>
                <p className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-muted-foreground" /><strong>MRP:</strong> ₹{stock.mrp}</p>
                <p className="flex items-center gap-2"><Warehouse className="h-4 w-4 text-muted-foreground" /><strong>Rack:</strong> {stock.rack || 'N/A'}</p>
                <p className="flex items-center gap-2"><Tag className="h-4 w-4 text-muted-foreground" /><strong>Category:</strong> {stock.category}</p>
            </div>

            <div>
                <h4 className="font-semibold mb-2 text-sm">Available Lengths/Rolls</h4>
                <div className="flex flex-wrap gap-2">
                    {availableLengths && availableLengths.length > 0 ? availableLengths.map((len, idx) => (
                        <Badge key={idx} variant="secondary">{len.length.toFixed(2)}</Badge>
                    )) : <p className="text-xs text-muted-foreground">No specific lengths available.</p>}
                </div>
            </div>

            {role === 'admin' && (
                <Collapsible open={isAdvanceOpen} onOpenChange={setIsAdvanceOpen}>
                    <Card>
                        <CollapsibleTrigger asChild>
                             <div className="p-3 cursor-pointer flex justify-between items-center">
                                <CardTitle className="text-base flex items-center gap-2"><Pencil className="h-4 w-4" /> Advance Options</CardTitle>
                                <Button variant="ghost" size="sm" className="w-9 p-0">
                                    <ChevronsUpDown className="h-4 w-4" />
                                    <span className="sr-only">Toggle</span>
                                </Button>
                            </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <CardContent className="p-3 pt-0">
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(handleUpdate)} className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <FormField control={form.control} name="mrp" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs">Update MRP</FormLabel>
                                                    <FormControl><Input type="number" {...field} /></FormControl>
                                                </FormItem>
                                            )}/>
                                            <FormField control={form.control} name="hsnCode" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs">Update HSN/Tax</FormLabel>
                                                    <FormControl><Input {...field} /></FormControl>
                                                </FormItem>
                                            )}/>
                                        </div>
                                        <Button type="submit" size="sm" className="w-full" disabled={isSubmitting}>
                                            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                            Save Changes
                                        </Button>
                                    </form>
                                </Form>
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>
            )}

            <div>
                <h4 className="font-semibold mb-2 text-sm flex items-center gap-2"><History className="h-4 w-4" /> Transaction History</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                    {transactions && transactions.length > 0 ? transactions.map(tx => (
                        <div key={tx.id} className="text-xs flex items-start gap-2 p-2 border rounded-md">
                             {tx.type === 'addition' ? <GitBranchPlus className="h-4 w-4 text-green-500 mt-0.5" /> : <GitCommitHorizontal className="h-4 w-4 text-red-500 mt-0.5" />}
                            <div>
                                <p className="font-medium">{tx.type === 'addition' ? 'Added' : 'Deducted'} <span className={tx.type === 'addition' ? 'text-green-600' : 'text-red-500'}>{tx.quantityChange.toFixed(2)}</span></p>
                                <p className="text-muted-foreground">{format(new Date(tx.createdAt), 'dd MMM yyyy, hh:mm a')} by {tx.createdBy}</p>
                                <p className="text-muted-foreground">Ref: {tx.poNumber || tx.orderId}</p>
                            </div>
                        </div>
                    )) : <p className="text-xs text-muted-foreground">No transaction history.</p>}
                </div>
            </div>
        </div>
    );
};

const ScanResultDialog = ({ result, onClose }: { result: ScanResult, onClose: () => void }) => {
    
    const handleStockUpdate = (newStock: Stock) => {
        result.data!.stockDetails!.stock = newStock;
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        {result.status === 'success' && <CheckCircle className="h-6 w-6 text-green-500" />}
                        {result.status === 'warning' && <AlertTriangle className="h-6 w-6 text-yellow-500" />}
                        {result.status === 'error' && <AlertTriangle className="h-6 w-6 text-red-500" />}
                        Scan Result
                    </CardTitle>
                </CardHeader>
                 <CardContent className="max-h-[70vh] overflow-y-auto">
                    <p className="mb-4">{result.message}</p>
                    {result.data?.stockDetails && <StockDetailDisplay stockDetails={result.data.stockDetails} onUpdate={handleStockUpdate} />}
                    {result.data?.order && (
                        <div className="text-xs mt-2 p-2 border rounded-md bg-muted">
                            <p><strong>Order:</strong> {result.data.order.id}</p>
                            <p><strong>Customer:</strong> {result.data.order.customerName}</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    <Button onClick={onClose} className="w-full">Close</Button>
                </CardFooter>
            </Card>
        </div>
    )
}

function UniversalScanner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const scannerContainerId = "scanner-container";
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const action = (searchParams.get('action') || 'pmsComplete') as ScanAction;
    const taskId = searchParams.get('taskId');
    const targetBcn = searchParams.get('bcn');
    const targetLength = searchParams.get('originalLength');
    const orderId = searchParams.get('orderId'); // For verifyCut

     const handleScanSuccess = useCallback(async (decodedText: string, decodedResult: any) => {
        if (isProcessing) return;
        setIsProcessing(true);
        
        try {
            let result: ScanResult;
            switch (action) {
                case 'pmsComplete':
                    const pmsResult = await completePmsProcess({ orderId: decodedText });
                    result = { status: pmsResult.success ? 'success' : 'error', message: pmsResult.message, data: { order: pmsResult.order } };
                    break;
                case 'stockDetail':
                    const bcn = decodedText.split('|')[0];
                    const stockId = bcn.replace(/\//g, '-');
                    const detailsResult = await getStockDetails(stockId);

                    if (detailsResult.success) {
                        result = { status: 'success', message: `Details for BCN: ${bcn}`, data: { stockDetails: detailsResult.data } };
                    } else {
                        result = { status: 'error', message: detailsResult.message };
                    }
                    break;
                case 'verifyCut':
                    const [scannedBcn, scannedLengthStr] = decodedText.split('|');
                    const scannedLength = parseFloat(scannedLengthStr);
                    const expectedLength = parseFloat(targetLength!);

                    if (scannedBcn === targetBcn && Math.abs(scannedLength - expectedLength) < 0.01) {
                         const batch = writeBatch(db);
                         const taskRef = doc(db, 'Cutting', taskId!);
                         const taskDoc = await getDoc(taskRef);
                         
                         if (taskDoc.exists()) {
                            const taskData = taskDoc.data();
                            const updatedItems = taskData.items.map((item: any) => 
                                item.bcn === targetBcn ? { ...item, status: 'cut' } : item
                            );
                             const allCut = updatedItems.every((item:any) => item.status === 'cut');
                             batch.update(taskRef, { items: updatedItems, status: allCut ? 'Completed' : 'In Progress' });
                         }

                         // Find the corresponding stock transaction and update its status
                         if (orderId) {
                            const stockId = targetBcn.replace(/\//g, '-');
                            const stockRef = doc(db, 'stocks', stockId);
                            // Query for the specific stockAdded document (the roll)
                            const stockAddedQuery = query(collection(stockRef, 'stockAdded'), where('lengths', 'array-contains', expectedLength), limit(1));
                            const stockAddedSnapshot = await getDocs(stockAddedQuery);
                            
                            if (!stockAddedSnapshot.empty) {
                                const stockAddedDoc = stockAddedSnapshot.docs[0];
                                // Now query the stockSold subcollection for the pending cut
                                const stockSoldQuery = query(collection(stockAddedDoc.ref, 'stockSold'), where('orderId', '==', orderId), where('status', '==', 'pending for cutting'), limit(1));
                                const stockSoldSnapshot = await getDocs(stockSoldQuery);

                                if (!stockSoldSnapshot.empty) {
                                    const stockSoldDoc = stockSoldSnapshot.docs[0];
                                    batch.update(stockSoldDoc.ref, { status: 'cut' });
                                }
                            }
                         }

                         await batch.commit();
                         result = { status: 'success', message: `Verified cut for ${targetBcn} from roll of length ${targetLength}.` };
                    } else {
                        result = { status: 'error', message: `Incorrect Barcode. Expected ${targetBcn}|${targetLength}, scanned ${decodedText}.` };
                    }
                    break;
                default:
                    result = { status: 'error', message: "Unknown scan action." };
            }
            setScanResult(result);
        } catch (e: any) {
            setScanResult({ status: 'error', message: `An error occurred: ${e.message}` });
        }
    }, [action, isProcessing, targetBcn, taskId, targetLength, orderId]);

    const startScanner = useCallback(() => {
        if (!html5QrCodeRef.current || html5QrCodeRef.current.isScanning) {
            return;
        }

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true,
        };

        html5QrCodeRef.current.start(
            { facingMode: "environment" },
            config,
            handleScanSuccess,
            (errorMessage) => { /* ignore errors */ }
        ).catch((err) => {
            console.error("Scanner start error:", err);
            setHasPermission(false);
            toast({ variant: 'destructive', title: "Scanner Error", description: "Could not start the camera. Please grant permissions." });
        });
    }, [handleScanSuccess, toast]);

    useEffect(() => {
        if (!html5QrCodeRef.current) {
            html5QrCodeRef.current = new Html5Qrcode(scannerContainerId, { experimentalFeatures: { useOffscreenCanvas: true }, verbose: false });
        }

        if (hasPermission === null) {
            Html5Qrcode.getCameras()
                .then(devices => {
                    setHasPermission(devices && devices.length > 0);
                })
                .catch(() => setHasPermission(false));
        }

        if (hasPermission && !isProcessing && !scanResult) {
            startScanner();
        }

        return () => {
            if (html5QrCodeRef.current?.isScanning) {
                html5QrCodeRef.current.stop().catch(err => {
                    console.error("Error stopping scanner on unmount:", err)
                });
            }
        };
    }, [hasPermission, isProcessing, scanResult, startScanner]);

    const closeResultDialog = () => {
        setScanResult(null);
        setIsProcessing(false);
        if (action === 'verifyCut' && scanResult?.status === 'success') {
            router.back();
        }
    };
    
    let pageTitle = "Universal Scanner";
    let pageDescription = "Point the camera at a barcode to process.";
    switch (action) {
        case 'pmsComplete':
            pageTitle = "PMS Completion Scanner";
            pageDescription = "Scan the order barcode to mark the entire PMS process as complete."
            break;
        case 'stockDetail':
            pageTitle = "Stock Detail Scanner";
            pageDescription = "Scan a stock item barcode to view its details.";
            break;
        case 'verifyCut':
            pageTitle = "Verify Cut Scanner";
            pageDescription = `Scan the barcode for item BCN: ${targetBcn} from roll of length ${targetLength} to verify it has been cut.`;
            break;
    }


    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            {scanResult && <ScanResultDialog result={scanResult} onClose={closeResultDialog} />}
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>{pageTitle}</CardTitle>
                    <CardDescription>{pageDescription}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div id={scannerContainerId} className="aspect-square bg-muted rounded-md overflow-hidden relative flex items-center justify-center text-sm">
                       {hasPermission === false && (
                         <Alert variant="destructive">
                            <CameraOff className="h-4 w-4" />
                            <AlertTitle>Camera Access Required</AlertTitle>
                            <AlertDescription>Please grant camera permissions to use the scanner.</AlertDescription>
                        </Alert>
                       )}
                       {hasPermission === null && (
                           <div className="flex flex-col items-center gap-2 text-muted-foreground">
                               <Loader2 className="h-6 w-6 animate-spin" />
                               <p>Initializing Camera...</p>
                           </div>
                       )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function UniversalScannerPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <UniversalScanner />
        </Suspense>
    )
}
