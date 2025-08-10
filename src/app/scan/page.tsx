
"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Camera, CheckCircle, Loader2, ScanLine, Home, User, ShoppingBag, XCircle, AlertTriangle, CameraOff } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { completePmsProcess } from '@/ai/flows/complete-pms-process';
import { Order, PurchaseRequest, Stock, StockTransaction } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { getAvailableStockLengths, searchStockByBcn, updateStockQuantityAction } from '@/app/dashboard/inventory/actions';
import { useAuth } from '@/context/AuthContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';


type ScanStatus = 'success' | 'warning' | 'error';
type ScanMode = 'pms' | 'inventory';

interface ScanResult {
    status: ScanStatus;
    message: string;
    mode: ScanMode;
}

const allocationSchema = z.object({
  orderId: z.string().optional(),
  selectedLengths: z.array(z.object({
      length: z.number(),
      transactionId: z.string(),
  })).min(1, "Please select at least one length to allocate."),
});
type AllocationFormValues = z.infer<typeof allocationSchema>;

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

function AllocationDialog({ 
    stockItem, 
    availableLengths,
    isOpen,
    onClose,
    onSuccess,
}: { 
    stockItem: Stock | null, 
    availableLengths: { length: number, transactionId: string }[],
    isOpen: boolean,
    onClose: () => void,
    onSuccess: () => void,
}) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    
    const form = useForm<AllocationFormValues>({
        resolver: zodResolver(allocationSchema),
        defaultValues: {
            orderId: '',
            selectedLengths: [],
        }
    });
    
    React.useEffect(() => {
        form.reset({ orderId: '', selectedLengths: [] });
    }, [isOpen, form]);

    const selectedTotal = form.watch('selectedLengths').reduce((acc, curr) => acc + curr.length, 0);

    const onSubmit = async (data: AllocationFormValues) => {
        if (!user || !stockItem) {
            toast({ variant: 'destructive', title: 'Error', description: 'User or stock item is missing.' });
            return;
        }
        setIsSubmitting(true);
        try {
            const batchPromises = data.selectedLengths.map(sl => {
                const transaction: Omit<StockTransaction, 'id'> = {
                    stockId: stockItem.id,
                    bcn: stockItem.bcn || '',
                    type: 'deduction',
                    quantityChange: -sl.length,
                    orderId: data.orderId || 'Manual Allocation',
                    lengths: [sl.length],
                    createdAt: new Date().toISOString(),
                    createdBy: user.name,
                    status: 'cut',
                };
                return updateStockQuantityAction(stockItem.id, transaction);
            });

            const results = await Promise.all(batchPromises);

            if (results.some(r => !r.success)) {
                 toast({ variant: 'destructive', title: 'Some updates failed' });
            } else {
                 toast({ title: 'Success!', description: `${data.selectedLengths.length} roll(s) have been allocated.` });
            }
            onSuccess();
        } catch (error: any) {
             toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSubmitting(false);
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Allocate Stock: {stockItem?.bcn}</DialogTitle>
                    <DialogDescription>
                        Select the rolls you are taking from stock. Total available: {availableLengths.length} rolls.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="orderId" render={({ field }) => (
                            <FormItem>
                                <Label>Order ID (Optional)</Label>
                                <FormControl><Input placeholder="e.g., MOTRACK-1234" {...field} /></FormControl>
                            </FormItem>
                        )} />
                        
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 border rounded-md p-2">
                             <Label>Available Rolls/Lengths</Label>
                             <FormField
                                control={form.control}
                                name="selectedLengths"
                                render={() => (
                                    availableLengths.length > 0 ? availableLengths.map((l, i) => (
                                        <FormField
                                            key={l.transactionId}
                                            control={form.control}
                                            name="selectedLengths"
                                            render={({ field }) => (
                                                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                                                    <FormControl>
                                                        <Checkbox checked={field.value?.some(v => v.transactionId === l.transactionId)} onCheckedChange={(checked) => {
                                                            return checked ? field.onChange([...field.value || [], { length: l.length, transactionId: l.transactionId }]) : field.onChange(field.value?.filter(v => v.transactionId !== l.transactionId));
                                                        }}/>
                                                    </FormControl>
                                                    <FormLabel className="font-normal">Length: <span className="font-mono font-bold">{l.length.toFixed(2)}</span></FormLabel>
                                                </FormItem>
                                            )}
                                        />
                                    )) : (
                                       <p className="text-sm text-muted-foreground text-center">No available lengths found for this item.</p>
                                    )
                                )}
                             />
                              <FormMessage />
                        </div>
                         <div className="font-semibold text-sm mt-4 text-right">Selected Total: {selectedTotal.toFixed(2)}</div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Allocate
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

function UniversalScanner() {
    const { toast } = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);
    const codeReaderRef = useRef(new BrowserMultiFormatReader());
    const isProcessingRef = useRef(false);

    const [hasCameraPermission, setHasCameraPermission] = React.useState<boolean | null>(null);
    const [manualId, setManualId] = useState('');
    const [loading, setLoading] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);
    
    // States for results
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [pmsOrderResult, setPmsOrderResult] = useState<Order | null>(null);

    // States for inventory scan
    const [scannedStock, setScannedStock] = useState<Stock | null>(null);
    const [availableLengths, setAvailableLengths] = useState<{ length: number; transactionId: string }[]>([]);
    const [isAllocationDialogOpen, setIsAllocationDialogOpen] = useState(false);

    useEffect(() => {
        const getCameraPermission = async () => {
          try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            setHasCameraPermission(true);
            setStream(mediaStream);
          } catch (error) {
            console.error('Error accessing camera:', error);
            setHasCameraPermission(false);
          }
        };
        getCameraPermission();
    }, []);
    
    const handleScan = async (scannedData: string) => {
        if (!scannedData || isProcessingRef.current) return;
        isProcessingRef.current = true;
        setLoading(true);
        
        // Reset previous results
        setPmsOrderResult(null);
        setScannedStock(null);
        setAvailableLengths([]);

        const isOrderNumber = /^\d+$/.test(scannedData) || scannedData.toUpperCase().startsWith('MOTRACK-');
        const crmOrderNo = scannedData.replace('MOTRACK-', '');

        if (isOrderNumber) {
            // Handle PMS Completion
            try {
                const result = await completePmsProcess({ orderId: crmOrderNo });
                let status: ScanStatus = result.success ? (result.message.includes('already complete') ? 'warning' : 'success') : 'error';
                
                setScanResult({ status, message: result.message, mode: 'pms' });
                setIsPopupOpen(true);
                setTimeout(() => setIsPopupOpen(false), 2000);

                if (result.order) {
                    setPmsOrderResult(result.order as Order);
                }
            } catch (error) {
                 setScanResult({ status: 'error', message: 'An unexpected error occurred.', mode: 'pms' });
                 setIsPopupOpen(true);
                 setTimeout(() => setIsPopupOpen(false), 2000);
            }

        } else {
            // Handle Inventory BCN Scan
             try {
                const stockItems = await searchStockByBcn(scannedData);
                if (stockItems.length === 0) {
                    toast({ variant: 'destructive', title: 'Not Found', description: `No stock item found for BCN ${scannedData}.` });
                } else {
                    const stockItem = stockItems[0];
                    setScannedStock(stockItem);

                    const lengthsResult = await getAvailableStockLengths(stockItem.id);
                    if (lengthsResult.success && lengthsResult.lengths) {
                        setAvailableLengths(lengthsResult.lengths);
                        setIsAllocationDialogOpen(true);
                    } else {
                        toast({ variant: 'destructive', title: 'Error', description: lengthsResult.message });
                    }
                }
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Error', description: error.message });
            }
        }
        
        setLoading(false);
        setTimeout(() => { isProcessingRef.current = false; }, 2500); // Cooldown
    };

    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();

            const codeReader = codeReaderRef.current;
            codeReader.decodeFromVideoElement(videoRef.current, (result, err) => {
                if (result) {
                    handleScan(result.getText());
                }
            }).catch(err => console.error("Scanner decode error:", err));
        }

        return () => {
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
          }
          if (codeReaderRef.current) {
            codeReaderRef.current.reset();
          }
        };
    }, [stream, handleScan]);
    
    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleScan(manualId);
    };

    return (
        <>
        <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                    <Button asChild variant="outline" size="icon"><Link href="/"><Home /></Link></Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Universal Scanner</h1>
                        <p className="text-muted-foreground">Scan an order or item barcode.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Scanner</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="aspect-video bg-muted rounded-md overflow-hidden relative flex items-center justify-center">
                            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                            {hasCameraPermission === false && (
                                <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center p-4">
                                <CameraOff className="h-12 w-12 text-muted-foreground mb-4"/>
                                <p className="font-semibold">Camera Access Required</p>
                                <p className="text-sm text-muted-foreground">Please allow camera access.</p>
                                </div>
                            )}
                        </div>
                         <form onSubmit={handleManualSubmit} className="space-y-2 mt-4">
                             <p className="text-sm text-muted-foreground">Or enter ID manually:</p>
                             <div className="flex gap-2">
                                <Input placeholder="Enter CRM Order No or BCN..." value={manualId} onChange={(e) => setManualId(e.target.value)} />
                                <Button type="submit" disabled={loading || !manualId}>
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                                </Button>
                             </div>
                        </form>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader><CardTitle>Last Scan Result</CardTitle></CardHeader>
                    <CardContent>
                       {loading && <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>}
                       {!loading && pmsOrderResult && (
                           <div className="space-y-4">
                               <div className="space-y-2 text-sm">
                                   <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground"/>Customer: <span className="font-medium">{pmsOrderResult.customerName}</span></div>
                                   <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground"/>Salesman: <span className="font-medium">{pmsOrderResult.salesPerson}</span></div>
                               </div>
                                <Separator />
                                {pmsOrderResult.milestones.find(m=>m.id === 4)?.completed && (
                                     <Alert variant="default"><CheckCircle className="h-4 w-4" /><AlertTitle>Production Complete!</AlertTitle></Alert>
                                )}
                           </div>
                       )}
                       {!loading && !pmsOrderResult && !scannedStock && (
                           <div className="text-center text-muted-foreground py-10"><p>Scan something to see details.</p></div>
                       )}
                    </CardContent>
                </Card>
            </div>
        </div>
        <ScanResultPopup result={scanResult} isOpen={isPopupOpen} onOpenChange={setIsPopupOpen} />
        <AllocationDialog 
            stockItem={scannedStock}
            availableLengths={availableLengths}
            isOpen={isAllocationDialogOpen}
            onClose={() => setIsAllocationDialogOpen(false)}
            onSuccess={() => {
                setIsAllocationDialogOpen(false);
                setScannedStock(null);
                setAvailableLengths([]);
            }}
        />
        </>
    );
}


export default function UniversalScanPage() {
    return (
        <Suspense fallback={<Skeleton className="h-screen w-full" />}>
            <UniversalScanner />
        </Suspense>
    )
}
