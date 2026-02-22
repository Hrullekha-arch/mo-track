"use client";

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from '@/context/AuthContext';
import { useToast } from "@/hooks/use-toast";
import { doc, getDoc, updateDoc, writeBatch, collection, query, where, getDocs, limit, } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Customer, Deal, DealVisit, Order, O2DStatus } from '@/lib/types';
import { getCustomerById } from '@/app/dashboard/customers/actions';
import { getDealById, uploadFileToStorageAction } from '@/app/dashboard/customers/[customerId]/[dealId]/actions';
import { applyOrderMilestoneChange, getNormalizedOrderMilestones } from '@/lib/order-workflow';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, Phone, MapPin, CheckCheck, ChevronRight } from "lucide-react";
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { deliveryInstallationItems, subDeliveryInstallationItems } from "@/lib/visit-options";
import { Input } from "@/components/ui/input"
import { file } from 'googleapis/build/src/apis/file';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { promise } from 'zod';
import { read } from 'xlsx';

type CheckListItem = {
    id: string;
    name: string;
    quantity: string;
    gathered: boolean;
};

// Slide to Complete Component
const SlideToComplete = ({ 
    onComplete, 
    disabled, 
    isSubmitting 
}: { 
    onComplete: () => void; 
    disabled: boolean;
    isSubmitting: boolean;
}) => {
    const [sliderPosition, setSliderPosition] = React.useState(0);
    const [isDragging, setIsDragging] = React.useState(false);
    const sliderRef = React.useRef<HTMLDivElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const handleStart = (clientX: number) => {
        if (disabled || isSubmitting) return;
        setIsDragging(true);
    };

    const handleMove = (clientX: number) => {
        if (!isDragging || disabled || isSubmitting) return;
        
        const container = containerRef.current;
        const slider = sliderRef.current;
        if (!container || !slider) return;

        const containerRect = container.getBoundingClientRect();
        const sliderWidth = slider.offsetWidth;
        const maxPosition = containerRect.width - sliderWidth;
        
        let newPosition = clientX - containerRect.left - sliderWidth / 2;
        newPosition = Math.max(0, Math.min(newPosition, maxPosition));
        
        setSliderPosition(newPosition);

        // Complete when slider reaches 90% of the track
        if (newPosition >= maxPosition * 0.9) {
            setIsDragging(false);
            onComplete();
        }
    };

    const handleEnd = () => {
        setIsDragging(false);
        // Reset position if not completed
        setSliderPosition(0);
    };

    React.useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX);
        const handleTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
        
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('touchmove', handleTouchMove);
            document.addEventListener('mouseup', handleEnd);
            document.addEventListener('touchend', handleEnd);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('mouseup', handleEnd);
            document.removeEventListener('touchend', handleEnd);
        };
    }, [isDragging]);

    return (
        <div 
            ref={containerRef}
            className={`relative w-full h-14 bg-gradient-to-r from-green-100 to-green-50 rounded-full overflow-hidden border-2 border-green-200 ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
        >
            <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-green-700 pointer-events-none">
                {isSubmitting ? (
                    <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Completing...
                    </span>
                ) : (
                    <span className="flex items-center gap-2">
                        Slide to Complete Delivery
                        <ChevronRight className="h-4 w-4" />
                    </span>
                )}
            </div>
            <div
                ref={sliderRef}
                className={`absolute top-1 left-1 h-12 w-12 bg-green-600 rounded-full flex items-center justify-center shadow-lg transition-transform ${
                    disabled ? '' : 'hover:scale-105'
                }`}
                style={{ transform: `translateX(${sliderPosition}px)` }}
                onMouseDown={(e) => handleStart(e.clientX)}
                onTouchStart={(e) => handleStart(e.touches[0].clientX)}
            >
                <CheckCheck className="h-6 w-6 text-white" />
            </div>
        </div>
    );
};

// Delivery Checklist Component
const DeliveryChecklist = ({ 
    items, 
    onCheckChange 
}: { 
    items: CheckListItem[], 
    onCheckChange: (index: number, checked: boolean) => void 
}) => {
    return (
        <div className="space-y-3">
            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No delivery items found</p>
            ) : (
                items.map((item, index) => (
                    <div key={item.id} className="flex items-center p-3 border rounded-lg bg-background hover:bg-accent/50 transition-colors">
                        <Checkbox
                            id={`item-${index}`}
                            checked={item.gathered}
                            onCheckedChange={(checked) => onCheckChange(index, !!checked)}
                            className="h-5 w-5 mr-4"
                        />
                        <Label htmlFor={`item-${index}`} className="flex-grow cursor-pointer">
                            <p className="font-semibold">{item.name}</p>
                            <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                        </Label>
                    </div>
                ))
            )}
        </div>
    );
};

export default function DeliveryVisitPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const { toast } = useToast();

    const visitId = params.visitId as string;
    const dealId = searchParams.get('dealId');
    const customerId = searchParams.get('customerId');
    const orderId = searchParams.get('orderId'); // Now optional

    const [loading, setLoading] = React.useState(true);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    
    const [customer, setCustomer] = React.useState<Customer | null>(null);
    const [deal, setDeal] = React.useState<Deal | null>(null);
    const [visit, setVisit] = React.useState<DealVisit | null>(null);
    const [order, setOrder] = React.useState<Order | null>(null);

    const [deliveryItems, setDeliveryItems] = React.useState<CheckListItem[]>([]);
    const [remarks, setRemarks] = React.useState('');
    const [images, setImages] = React.useState<File[]>([]);
    const [selectedimages, setSelectedtImages] = React.useState<File[]>([]);
    const [previewImages, setPreviewImages] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [imageUrl,setImageUrl] = React.useState<string[]>([]);
    
    const allItemsGathered = deliveryItems.length > 0 && deliveryItems.every(item => item.gathered);
    const isCompleted = visit?.status === 'completed';

    React.useEffect(() => {
        // Only customerId, dealId, and visitId are required now
        if (!customerId || !dealId || !visitId) {
            toast({ 
                variant: 'destructive', 
                title: 'Error', 
                description: 'Missing required parameters (customerId, dealId, visitId).' 
            });
            router.back();
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch customer, deal, and visit (required)
                const [customerData, dealData, visitData] = await Promise.all([
                    getCustomerById(customerId),
                    getDealById(customerId, dealId),
                    getDoc(doc(db, 'customers', customerId, 'deals', dealId, 'visits', visitId))
                ]);

                if (!customerData || !dealData || !visitData.exists()) {
                    throw new Error("Could not find required customer, deal, or visit data.");
                }

                const currentVisit = { id: visitData.id, ...visitData.data() } as DealVisit;

                setCustomer(customerData);
                setDeal(dealData);
                setVisit(currentVisit);

                // Optionally fetch order if orderId is provided
                if (orderId) {
                    const orderData = await getDoc(doc(db, "orders", orderId));
                    if (orderData.exists()) {
                        setOrder({ id: orderData.id, ...orderData.data() } as Order);
                    }
                }

                // Build the checklist from the visit document
                const items: CheckListItem[] = [];
                
                currentVisit.deliveryInstallations?.forEach(item => {
                    if (!item) return;
                    const deliveryItemConfig = deliveryInstallationItems.find(
                        (config) => config.id === item.id
                    );
                    if (deliveryItemConfig) {
                        items.push({ 
                            id: item.id, 
                            name: deliveryItemConfig.label, 
                            quantity: item.noOfPcs || '1', 
                            gathered: false 
                        });
                    }
                });
                
                currentVisit.subDeliveryInstallations?.forEach(item => {
                    if (!item) return;
                    const subDeliveryItemConfig = subDeliveryInstallationItems.find(
                        (config) => config.id === item.id
                    );
                    if (subDeliveryItemConfig) {
                        items.push({ 
                            id: item.id, 
                            name: subDeliveryItemConfig.label, 
                            quantity: item.noOfPcs || '1', 
                            gathered: false 
                        });
                    }
                });
                
                setDeliveryItems(items);
                
                // Load existing remarks if any
                if ((currentVisit as any).remarks) {
                    setRemarks((currentVisit as any).remarks);
                }
                
            } catch (error) {
                console.error("Failed to fetch data:", error);
                toast({ 
                    variant: "destructive", 
                    title: "Error", 
                    description: "Could not load delivery details." 
                });
            } finally {
                setLoading(false);
            }
        };
        
        fetchData();
    }, [customerId, dealId, orderId, visitId, toast, router]);
    
    const handleCheckChange = (index: number, checked: boolean) => {
        setDeliveryItems(prev => {
            const newItems = [...prev];
            newItems[index].gathered = checked;
            return newItems;
        });
    };

    const filetoBase64 = (file: File):Promise<string> =>
        new Promise ((resolve, reject)=>{
            const reader = new FileReader();
            reader.onload = () =>{
                const result = reader.result as string;
                resolve(result.split(",")[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

    const uploadImages = async () =>{
        if (images.length === 0 ) return;

        setUploading(true);
        try {
            const uploadedUrls : string[] =[];
            
            for(const file of images){
                const base64 = await filetoBase64(file);
                const url = await uploadFileToStorageAction(`Ins/Del-${customer?.name}-${deal?.dealId}`,file.type,base64,"Installation/Delivery");
                uploadedUrls.push(url);
            }
            setImageUrl(uploadedUrls);

        } catch (error) {
            console.error(error);
            alert("❌ Upload failed");
        }finally{
            setUploading(false)
        }
    }

    const handleCompleteDelivery = async () => {
        if (!user || !visit || !customer || !deal || !imageUrl) return toast({
            variant:"destructive",
            title:"Error",
            description:"Missing required data to complete delivery."
        })
        router.back();
        ;
        
        setIsSubmitting(true);
        try {
            const batch = writeBatch(db);
            const visitRef = doc(db, 'customers', customer.id, 'deals', deal.id, 'visits', visit.id);

            await uploadImages();
            
            // If no items are present, allow completion with remarks
            if (deliveryItems.length === 0 || allItemsGathered) {
                // Update visit with completion data
                batch.update(visitRef, { 
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    completedBy: user.name,
                    remarks: remarks || '',
                    deliveryChecklist: deliveryItems,
                    updatedAt: new Date().toISOString(),
                    imageUrls:imageUrl
                });

                // Optionally update order and O2D status as before
                if (order) {
                    const orderRef = doc(db, "orders", order.id);
                    const milestoneToUpdate = getNormalizedOrderMilestones(order).find((milestone) => milestone.id === 8);
                    if (milestoneToUpdate) {
                        const { milestones, workflow } = applyOrderMilestoneChange(
                          order,
                          8,
                          true,
                          { id: user.id, name: user.name }
                        );
                        batch.update(orderRef, { milestones, workflow });
                    }
                }
                
                const o2dDocRefQuery = query(
                    collection(db, 'o2d'), 
                    where('dealId', '==', deal.dealId), 
                    limit(1)
                );
                const o2dSnapshot = await getDocs(o2dDocRefQuery);
                
                if (!o2dSnapshot.empty) {
                    const o2dDocRef = o2dSnapshot.docs[0].ref;
                    const o2dDoneMilestone: O2DStatus = {
                        stepId: 13, // Installation Done
                        status: 'completed', 
                        completedAt: new Date().toISOString(), 
                        completedBy: user.name, 
                        selection: "Done", 
                        remarks: remarks || "Completed via mobile app"
                    };
                    const currentMilestones = Array.isArray(o2dSnapshot.docs[0].data()?.milestones)
                      ? o2dSnapshot.docs[0].data().milestones
                      : [];
                    const mergedMilestones = [
                      ...currentMilestones.filter((milestone: O2DStatus) => milestone.stepId !== o2dDoneMilestone.stepId),
                      o2dDoneMilestone,
                    ];
                    batch.update(o2dDocRef, { milestones: mergedMilestones });
                }

                await batch.commit();
                
                toast({ 
                    title: 'Delivery Completed! 🎉', 
                    description: 'Installation has been marked as done.'
                });
                
                router.push('/mobile');
            } else {
                // Notify user to check all items if they haven't done so
                toast({ 
                    variant: 'destructive', 
                    title: 'Error', 
                    description: 'Please check all items before completing delivery.' 
                });
            }
        } catch (error) {
            console.error("Error completing delivery:", error);
            toast({ 
                variant: 'destructive', 
                title: 'Error', 
                description: 'Failed to complete delivery. Please try again.' 
            });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 p-4 space-y-4">
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }

    if (!customer || !deal || !visit) {
        return (
            <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-center text-destructive">Error loading delivery data.</p>
                        <Button onClick={() => router.back()} className="w-full mt-4">
                            Go Back
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
                <div className="flex items-center gap-2 p-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-lg font-bold">Delivery & Installation</h1>
                        <p className="text-xs text-muted-foreground">
                            {isCompleted ? 'Completed' : 'In Progress'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {/* Customer Info Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">{customer.name}</CardTitle>
                        {order && (
                            <CardDescription className="text-xs">Order: {order.id}</CardDescription>
                        )}
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <a href={`tel:${customer.phone || customer.mobileNo || ""}`} className="text-blue-600 hover:underline">
                                {customer.phone || customer.mobileNo || "N/A"}
                            </a>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span>{customer.billingAddress?.line1 || customer.addressPinCode || "—"}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Item Checklist */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Item Checklist</CardTitle>
                        <CardDescription className="text-xs">
                            Verify all items before completing delivery
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DeliveryChecklist 
                            items={deliveryItems} 
                            onCheckChange={handleCheckChange} 
                        />
                        {deliveryItems.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-3 text-center">
                                {deliveryItems.filter(i => i.gathered).length} of {deliveryItems.length} items checked
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Remarks Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Remarks / Notes</CardTitle>
                        <CardDescription className="text-xs">
                            Add any observations or special notes
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Textarea
                            placeholder="Enter remarks about the delivery/installation..."
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            disabled={isCompleted}
                            className="min-h-[100px] resize-none"
                        />
                        <div>
                            <Label>Add Photo</Label>
                            <Input type="file" multiple onChange={(e) =>{
                                    if(!e.target.files) return;
                                    const newimages = Array.from(e.target.files);

                                    setImages((images) =>{
                                        const Allimages =[...images, ...newimages];
                                        return Allimages.slice(0,5);
                                    })
                            }}/>
                        </div>
                        <Card>
                            <div className='flex justify-start items-start gap-2 p-2'>
                                {images.map((file, index) => (
                                    <img onClick={()=>{
                                        setPreviewImages(true)
                                        setSelectedtImages([file])
                                    }}
                                         key={index} src={URL.createObjectURL(file)} alt={`preview- ${index}`}
                                        className='w-12 h-12 rounded' />
                                ))}
                            </div>
                        </Card>
                    </CardContent>
                </Card>

                {/* Slide to Complete */}
                {!isCompleted && (
                    <Card>
                        <CardContent className="pt-6">
                            <SlideToComplete
                                onComplete={handleCompleteDelivery}
                                disabled={deliveryItems.length > 0 && !allItemsGathered} // Allow slide if no items or all items are gathered
                                isSubmitting={isSubmitting}
                            />
                            {!allItemsGathered && deliveryItems.length > 0 && (
                                <p className="text-xs text-amber-600 text-center mt-3">
                                    ⚠️ Please check all items before completing
                                </p>
                            )}
                            {deliveryItems.length === 0 && (
                                <p className="text-xs text-amber-600 text-center mt-3">
                                    ⚠️ No items to check. You can complete the delivery by entering remarks.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
            <Dialog open={previewImages} onOpenChange={setPreviewImages}>
            <DialogContent>
                <DialogHeader>
                <DialogTitle>Preview Images</DialogTitle>
                </DialogHeader>
                <Card>
                    <div className='flex flex-wrap justify-center items-center gap-2 p-2'>
                        {selectedimages.map((file, index) => (
                            <img key={index} src={URL.createObjectURL(file)} alt={`preview- ${index}`} className='w-64 h-64 rounded' />
                        ))}
                    </div>
                </Card>
            </DialogContent>
            </Dialog>
        </div>
    );
}
