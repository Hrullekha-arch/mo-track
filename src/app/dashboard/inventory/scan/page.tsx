"use client";

import * as React from 'react';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Camera, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { BrowserMultiFormatReader } from '@zxing/library';
import { getAvailableStockLengths, searchStockByBcn, updateStockQuantityAction } from '../actions';
import { Stock, StockTransaction } from '@/lib/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';

const allocationSchema = z.object({
  orderId: z.string().optional(),
  selectedLengths: z.array(z.object({
      length: z.number(),
      transactionId: z.string(),
  })).min(1, "Please select at least one length to allocate."),
});

type AllocationFormValues = z.infer<typeof allocationSchema>;

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

            const failures = results.filter(r => !r.success);
            if (failures.length > 0) {
                 toast({ variant: 'destructive', title: 'Some updates failed', description: 'Not all stock updates were successful.' });
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
                        <FormField
                            control={form.control}
                            name="orderId"
                            render={({ field }) => (
                                <FormItem>
                                    <Label>Order ID (Optional)</Label>
                                    <FormControl><Input placeholder="e.g., MOTRACK-1234" {...field} /></FormControl>
                                </FormItem>
                            )}
                        />

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 border rounded-md p-2">
                             <Label>Available Rolls/Lengths</Label>
                             <FormField
                                control={form.control}
                                name="selectedLengths"
                                render={() => (
                                    <>
                                    {availableLengths.length > 0 ? availableLengths.map((l) => (
                                        <FormField
                                            key={l.transactionId}
                                            control={form.control}
                                            name="selectedLengths"
                                            render={({ field }) => (
                                                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value?.some(v => v.transactionId === l.transactionId)}
                                                            onCheckedChange={(checked) => {
                                                                return checked
                                                                    ? field.onChange([...field.value || [], { length: l.length, transactionId: l.transactionId }])
                                                                    : field.onChange(field.value?.filter(v => v.transactionId !== l.transactionId));
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">
                                                        Length: <span className="font-mono font-bold">{l.length.toFixed(2)}</span>
                                                    </FormLabel>
                                                </FormItem>
                                            )}
                                        />
                                    )) : (
                                       <p className="text-sm text-muted-foreground text-center">No available lengths found for this item.</p>
                                    )}
                                    </>
                                )}
                             />
                             <FormMessage />
                        </div>

                        <div className="font-semibold text-sm mt-4 text-right">
                            Selected Total: {selectedTotal.toFixed(2)}
                        </div>

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

function InventoryScanner() {
    const { toast } = useToast();
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const codeReaderRef = React.useRef(new BrowserMultiFormatReader());
    const [stream, setStream] = React.useState<MediaStream | null>(null);
    const [hasCameraPermission, setHasCameraPermission] = React.useState<boolean | null>(null);
    const isProcessingRef = React.useRef(false);

    const [scannedStock, setScannedStock] = React.useState<Stock | null>(null);
    const [availableLengths, setAvailableLengths] = React.useState<{ length: number; transactionId: string }[]>([]);
    const [isDialogOpen, setIsDialogOpen] = React.useState(false);

    const handleScanSuccess = React.useCallback(async (bcn: string) => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;

        toast({ title: "Barcode Scanned", description: `Searching for BCN: ${bcn}` });

        try {
            const stockItems = await searchStockByBcn(bcn);
            if (stockItems.length === 0) {
                toast({ variant: 'destructive', title: 'Not Found', description: `No stock item found for BCN ${bcn}.` });
                return;
            }
            const stockItem = stockItems[0];
            setScannedStock(stockItem);

            const lengthsResult = await getAvailableStockLengths(stockItem.id);
            if (lengthsResult.success && lengthsResult.lengths) {
                setAvailableLengths(lengthsResult.lengths);
                setIsDialogOpen(true);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: lengthsResult.message });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setTimeout(() => { isProcessingRef.current = false; }, 2000);
        }
    }, [toast]);

    React.useEffect(() => {
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
              description: 'Please enable camera permissions in your browser settings to use this app.',
            });
          }
        };
        getCameraPermission();
    }, [toast]);

    React.useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.error("Video play error:", e));

            const codeReader = codeReaderRef.current;
            codeReader.decodeFromVideoElementContinuously(videoRef.current, (result) => {
                if (result && !isProcessingRef.current) {
                    handleScanSuccess(result.getText());
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
    }, [stream, handleScanSuccess]);

    return (
        <>
            <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl">
                <div className="flex items-center gap-4 mb-4">
                    <Button asChild variant="outline" size="icon">
                        <Link href="/dashboard/inventory"><ArrowLeft /></Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Inventory Scanner</h1>
                        <p className="text-muted-foreground">Scan an item's BCN to allocate stock.</p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Camera Feed</CardTitle>
                        <CardDescription>Point the camera at the item's barcode.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="aspect-video bg-muted rounded-md overflow-hidden relative flex items-center justify-center">
                            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                            {hasCameraPermission === false && (
                                <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center p-4">
                                    <Camera className="h-12 w-12 text-muted-foreground mb-4" />
                                    <p className="font-semibold">Camera Access Required</p>
                                    <p className="text-sm text-muted-foreground">Please allow camera access to use this feature.</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
            <AllocationDialog
                stockItem={scannedStock}
                availableLengths={availableLengths}
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                onSuccess={() => {
                    setIsDialogOpen(false);
                    setScannedStock(null);
                    setAvailableLengths([]);
                }}
            />
        </>
    );
}

export default function Page() {
    return (
        <Suspense fallback={<Skeleton className="h-screen w-full" />}>
            <InventoryScanner />
        </Suspense>
    );
}
