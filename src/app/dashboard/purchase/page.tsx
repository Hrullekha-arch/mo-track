

"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, CheckSquare, Banknote, PackageSearch, MessageSquare, Briefcase, PlusCircle, CheckCircle, AlertTriangle, MessageSquareWarning, SkipForward, Calendar, Eye, EyeOff, ChevronDown, UserCheck, Search, Users, FileText, BadgePercent, ThumbsUp, Timer, ShoppingCart, Undo2, Layers, MoreVertical, Trash2, Clock } from 'lucide-react';
import { collection, onSnapshot, query, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest, PurchaseStep, PurchaseStatus } from "@/lib/types";
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { addDays, addHours, addMinutes, isPast, format, formatDistanceToNow, differenceInHours } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


const PURCHASE_PROCESS_CONFIG: PurchaseStep[] = [
    { id: 1, step: "Verify Authorization", details: "Check if the request is authorized", time: "30 min", role: "Accounts", icon: UserCheck, expectedDuration: { minutes: 30 } },
    { id: 2, step: "Payment Verification", details: "Verify payment availability", time: "30 min", role: "Accounts", icon: Banknote, expectedDuration: { minutes: 30 } },
    { id: 3, step: "Stock Verification", details: "Check current stock levels", time: "30 min", role: "PC", icon: PackageSearch, expectedDuration: { minutes: 30 } },
    { id: 4, step: "Inform Requesting Person", details: "Update the person who made the request", time: "30 min", role: "PC", icon: MessageSquare, expectedDuration: { minutes: 30 } },
    { id: 5, step: "Select Vendor Type", details: "Is this an existing or new vendor?", time: "N/A", role: "PC", icon: Briefcase, expectedDuration: {} },
];

const EXISTING_VENDOR_BRANCH: PurchaseStep[] = [
    { id: 6, step: "Place Order", details: "Place the order with the existing vendor", time: "30 min", role: "PC", icon: ShoppingCart, expectedDuration: { minutes: 30 } }
];

const NEW_VENDOR_BRANCH: PurchaseStep[] = [
    { id: 7, step: "Get 3 Quotations", details: "Source three quotations from new vendors", time: "1 Day", role: "PC", icon: FileText, expectedDuration: { days: 1 } },
    { id: 8, step: "Check Rate", details: "Compare rates with old rates", time: "30 min", role: "PC", icon: BadgePercent, expectedDuration: { minutes: 30 } },
    { id: 9, step: "Get Approval", details: "Get management approval for the new vendor/rate", time: "30 min", role: "Admin", icon: ThumbsUp, expectedDuration: { minutes: 30 } },
    { id: 10, step: "TAT Check & Approval", details: "Turnaround time check and final approval", time: "1 hr", role: "Admin", icon: Timer, expectedDuration: { hours: 1 } },
    { id: 11, step: "Place Order", details: "Place the order with the new vendor", time: "30 min", role: "PC", icon: ShoppingCart, expectedDuration: { minutes: 30 } },
];

const ALL_STEPS_MAP = [...PURCHASE_PROCESS_CONFIG, ...EXISTING_VENDOR_BRANCH, ...NEW_VENDOR_BRANCH].reduce((acc, step) => {
    acc[step.id] = step;
    return acc;
}, {} as Record<number, PurchaseStep>);


function getExpectedCompletionDate(step: PurchaseStep, startDate: Date): Date {
    const { days = 0, hours = 0, minutes = 0 } = step.expectedDuration;
    let completionDate = addDays(startDate, days);
    completionDate = addHours(completionDate, hours);
    completionDate = addMinutes(completionDate, minutes);
    return completionDate;
}

const formatTimestamp = (date: Date) => {
    return format(date, 'dd/MM/yyyy - HH:mm');
};

const calculateExpectedDatesForRequest = (request: PurchaseRequest) => {
    let allSteps = [...PURCHASE_PROCESS_CONFIG];
     if (request.vendorType === 'existing') {
        allSteps.push(...EXISTING_VENDOR_BRANCH);
    } else if (request.vendorType === 'new') {
        allSteps.push(...NEW_VENDOR_BRANCH);
    } else {
        // If vendorType is undecided, only calculate for the initial steps
        allSteps = PURCHASE_PROCESS_CONFIG;
    }
    
    return allSteps.reduce((acc, currentStep) => {
        if (currentStep.id === 5) { // Skip vendor selection step for date calculation
            acc[currentStep.id] = new Date(); // Placeholder
            return acc;
        }

        let startDate: Date;
        if (currentStep.id === 1) {
            startDate = new Date(request.createdAt);
        } else {
            // Find the logical previous step
            const currentIndex = allSteps.findIndex(s => s.id === currentStep.id);
            let prevStepConfig = allSteps[currentIndex - 1];

            // If the previous step was the vendor choice, the base is the step before THAT
            if (prevStepConfig.id === 5) {
                prevStepConfig = allSteps[currentIndex - 2];
            }
            
            const previousStepStatus = (request.milestones || []).find(m => m.stepId === prevStepConfig.id);
            if (previousStepStatus?.status === 'completed' || previousStepStatus?.status === 'skipped') {
                startDate = new Date(previousStepStatus.completedAt);
            } else {
                startDate = acc[prevStepConfig.id] || new Date();
            }
        }
        acc[currentStep.id] = getExpectedCompletionDate(currentStep, startDate);
        return acc;
    }, {} as Record<number, Date>);
}


function PurchaseProcessTimeline({ 
    request, 
    onStepUpdate, 
    onQuickStepUpdate,
    onVendorTypeSelect,
    onRevertStep,
    userRole,
    userDesignation,
    showAllSteps = false
}: { 
    request: PurchaseRequest; 
    onStepUpdate: (requestId: string, stepId: number, isOverdue: boolean, action: 'completed' | 'skipped') => void; 
    onQuickStepUpdate: (requestId: string, stepId: number, status: 'completed' | 'skipped') => void;
    onVendorTypeSelect: (requestId: string, vendorType: 'existing' | 'new') => void;
    onRevertStep: (requestId: string, stepId: number, milestone: PurchaseStatus) => void;
    userRole: string | null;
    userDesignation: string | null;
    showAllSteps: boolean;
}) {
    
    const expectedDates = calculateExpectedDatesForRequest(request);

    let processSteps = [...PURCHASE_PROCESS_CONFIG];
    if (request.vendorType === 'existing') {
        processSteps.push(...EXISTING_VENDOR_BRANCH);
    } else if (request.vendorType === 'new') {
        processSteps.push(...NEW_VENDOR_BRANCH);
    }

    const stepsToShow = useMemo(() => {
        if (showAllSteps) {
            return processSteps;
        }
        const lastCompletedIndex = processSteps.findLastIndex(step => 
            (request.milestones || []).some(m => m.stepId === step.id)
        );
        return processSteps.slice(lastCompletedIndex + 1);
    }, [request.milestones, showAllSteps, processSteps]);

    const checkPermission = (stepRole: string) => {
        if (userRole === 'admin') return true;
        const requiredRoles = stepRole.split(' / ').map(r => r.trim().toLowerCase());
        if (userRole && requiredRoles.includes(userRole.toLowerCase())) return true;
        if (userDesignation && requiredRoles.includes(userDesignation.toLowerCase())) return true;
        return false;
    }

    const getPrevStep = (currentStepId: number) => {
        const currentIndex = processSteps.findIndex(s => s.id === currentStepId);
        if (currentIndex <= 0) return null;
        let prevStep = processSteps[currentIndex - 1];
        // If the previous step was the vendor choice, go back one more
        if (prevStep && prevStep.id === 5) {
             return processSteps[currentIndex - 2];
        }
        return prevStep;
    }

    return (
        <div className="relative pl-6 pr-4 py-4">
            <div className="absolute left-9 top-0 h-full w-0.5 bg-border -translate-x-1/2" aria-hidden="true"></div>
            <div className="space-y-4">
                {(showAllSteps ? processSteps : stepsToShow).map((stepConfig) => {
                    const stepStatus = request.milestones?.find(s => s.stepId === stepConfig.id);
                    
                    const isPending = !stepStatus;
                    const expectedDate = expectedDates[stepConfig.id];
                    const isOverdue = isPast(expectedDate) && isPending;

                    const Icon = stepConfig.icon;

                    const prevStep = getPrevStep(stepConfig.id);
                    const prevStepStatus = prevStep ? request.milestones.find(m => m.stepId === prevStep.id) : null;
                    
                    const canAct = !stepStatus && (stepConfig.id === 1 || (prevStepStatus && prevStepStatus.status === 'completed'));
                    
                    return (
                        <div key={stepConfig.id} className="relative flex items-start gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-border shadow-sm shrink-0 bg-card">
                                <Icon className={cn("h-6 w-6", 
                                   stepStatus?.status === 'completed' ? "text-green-500" : isOverdue ? "text-red-500" : "text-muted-foreground"
                                )} />
                            </div>
                            <Card className={cn("w-full group hover:shadow-md", isPending && isOverdue ? "border-red-500 bg-red-50" : "")}>
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-base">{stepConfig.step}</CardTitle>
                                            <CardDescription>{stepConfig.details}</CardDescription>
                                        </div>
                                        <div className="text-right flex-shrink-0 ml-4">
                                            <p className="font-semibold text-sm">{stepConfig.role}</p>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex justify-between items-center flex-wrap gap-4">
                                        <div className="text-xs text-muted-foreground space-y-2 flex-grow">
                                            {stepConfig.id !== 5 && <p>Expected by: {formatTimestamp(expectedDate)}</p>}
                                            
                                            {stepStatus?.status === 'completed' && (
                                                <div className="flex items-center gap-2 text-green-600 font-medium">
                                                    <CheckCircle className="h-4 w-4" />
                                                    <span>Completed by {stepStatus.completedBy} at {formatTimestamp(new Date(stepStatus.completedAt))}</span>
                                                </div>
                                            )}

                                            {isPending && isOverdue && stepConfig.id !== 5 && (
                                                <div className="flex items-center gap-2 text-red-600 font-medium">
                                                    <AlertTriangle className="h-4 w-4" />
                                                    <span>Delayed by: {formatDistanceToNow(expectedDate, { addSuffix: false })}</span>
                                                </div>
                                            )}
                                        </div>
                                         <div className="flex items-center gap-2 flex-shrink-0">
                                            {stepStatus && userRole === 'admin' && (
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onRevertStep(request.id, stepConfig.id, stepStatus)}>
                                                        <Undo2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                            )}
                                            {canAct && stepConfig.id === 5 ? (
                                                <div className="flex gap-2">
                                                    <Button size="sm" onClick={() => onVendorTypeSelect(request.id, 'existing')} disabled={!checkPermission(stepConfig.role)}>Existing Vendor</Button>
                                                    <Button size="sm" onClick={() => onVendorTypeSelect(request.id, 'new')} disabled={!checkPermission(stepConfig.role)}>New Vendor</Button>
                                                </div>
                                            ) : canAct ? (
                                                <Button size="sm" onClick={() => onQuickStepUpdate(request.id, stepConfig.id, 'completed')} disabled={!checkPermission(stepConfig.role)}>Mark as Done</Button>
                                            ) : (
                                                 stepStatus?.status === 'completed' ? <Badge>Completed</Badge> : null
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}


export default function PurchasePage() {
    const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const { user, role, designation } = useAuth();
    const { toast } = useToast();
    const [deletingRequest, setDeletingRequest] = useState<PurchaseRequest | null>(null);

    useEffect(() => {
        const q = query(collection(db, "purchaseRequests"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
            setPurchaseRequests(requestsData.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const updateStepInFirestore = async (requestId: string, stepId: number, status: 'completed' | 'skipped') => {
        if (!user) {
            toast({ variant: "destructive", title: "You must be logged in." });
            return;
        }

        const newStatus: PurchaseStatus = {
            stepId,
            status,
            completedAt: new Date().toISOString(),
            completedBy: user.name,
        };
        
        try {
            const requestRef = doc(db, "purchaseRequests", requestId);
            await updateDoc(requestRef, { milestones: arrayUnion(newStatus) });
            toast({ title: "Step Updated!", description: "Progress has been saved." });
        } catch (error) {
            console.error("Error updating purchase step:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        }
    }
    
    const handleVendorTypeSelect = async (requestId: string, vendorType: 'existing' | 'new') => {
        if (!user) return;
        const newStatus: PurchaseStatus = {
            stepId: 5, // Vendor selection step
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: user.name,
            remarks: `Selected ${vendorType} vendor`,
        };
        try {
            const requestRef = doc(db, "purchaseRequests", requestId);
            await updateDoc(requestRef, { 
                vendorType,
                milestones: arrayUnion(newStatus) 
            });
            toast({ title: "Vendor Type Selected", description: `Switched to ${vendorType} vendor workflow.` });
        } catch (error) {
            console.error("Error setting vendor type:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        }
    };

    const handleDelete = async () => {
        if (!deletingRequest) return;
        try {
            await deleteDoc(doc(db, "purchaseRequests", deletingRequest.id));
            toast({ title: "Purchase Request Deleted" });
            setDeletingRequest(null);
        } catch (error) {
            console.error("Error deleting purchase request:", error);
            toast({ variant: "destructive", title: "Deletion Failed" });
        }
    };
    
    const handleRevertStep = async () => {
        // Placeholder for revert logic
    };

    const PurchaseRequestCard = ({ request }: { request: PurchaseRequest }) => {
        const [showAllSteps, setShowAllSteps] = useState(false);
        const hasFabric = request.fabricDetails && request.fabricDetails.length > 0 && request.fabricDetails.some(f => f.fabricName);
        const hasFurniture = request.furnitureDetails && request.furnitureDetails.length > 0 && request.furnitureDetails.some(f => f.furnitureName);
        const defaultTab = hasFabric ? "fabric" : "furniture";

        // Status Calculation
        const expectedDates = calculateExpectedDatesForRequest(request);
        let processSteps = [...PURCHASE_PROCESS_CONFIG];
        if (request.vendorType === 'existing') processSteps.push(...EXISTING_VENDOR_BRANCH);
        else if (request.vendorType === 'new') processSteps.push(...NEW_VENDOR_BRANCH);

        const completedSteps = (request.milestones || []);
        const nextStepIndex = processSteps.findIndex(s => !completedSteps.some(cs => cs.stepId === s.id));
        const currentStep = nextStepIndex !== -1 ? processSteps[nextStepIndex] : null;
        const lastStep = processSteps[processSteps.length -1];
        const isCompleted = completedSteps.some(cs => cs.stepId === lastStep.id);

        let statusTextColor = "text-primary";
        if (!isCompleted && currentStep) {
            const expectedDate = expectedDates[currentStep.id];
            if (isPast(expectedDate)) {
                statusTextColor = "text-red-500";
            } else if (differenceInHours(expectedDate, new Date()) <= 24) {
                statusTextColor = "text-orange-500";
            }
        }


        return (
             <Collapsible key={request.id} className="border-2 rounded-lg bg-card overflow-hidden">
                <div className="p-4 space-y-4">
                    <div className="flex gap-4">
                        {/* Column 1: Request Details */}
                        <div className="flex-1 space-y-2">
                             <div className="flex justify-between items-start">
                                <div className="space-y-1 text-sm">
                                    <h3 className="font-semibold text-lg">{request.customerName}</h3>
                                    <p className="text-sm text-muted-foreground">ID: {request.dealId}</p>
                                    <p className='flex items-center gap-2 pt-1'><User className='h-4 w-4 text-muted-foreground' /> Salesman: {request.salesman}</p>
                                    <p className='flex items-center gap-2'><Briefcase className='h-4 w-4 text-muted-foreground' /> Work Type: {request.workType}</p>
                                    {isCompleted ? (
                                        <p className='flex items-center gap-2 font-medium text-green-600'><CheckCircle className='h-4 w-4'/> Status: Completed</p>
                                    ) : currentStep && (
                                        <p className={cn('flex items-center gap-2 font-medium', statusTextColor)}>
                                            <Clock className='h-4 w-4'/>
                                            Status: {currentStep.step} - Due by {formatTimestamp(expectedDates[currentStep.id])}
                                        </p>
                                    )}
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <div className="flex items-center gap-2">
                                         {role === 'admin' && (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem 
                                                        className="text-destructive focus:text-destructive"
                                                        onClick={() => setDeletingRequest(request)}
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}
                                        {request.vendorType !== 'undecided' && (
                                            <Badge className='mt-2' variant="outline">{request.vendorType} vendor</Badge>
                                        )}
                                    </div>
                                    {request.createdAt && (
                                        <p className='flex items-center gap-2 text-sm mt-2'><Calendar className='h-4 w-4 text-muted-foreground' /> {format(new Date(request.createdAt), 'dd/MM/yyyy')}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <Separator orientation="vertical" className="h-auto" />

                        {/* Column 2: Item Details with Tabs */}
                        <div className="flex-1">
                             <Tabs defaultValue={defaultTab} className="w-full">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="fabric" disabled={!hasFabric}>Fabric</TabsTrigger>
                                    <TabsTrigger value="furniture" disabled={!hasFurniture}>Furniture</TabsTrigger>
                                </TabsList>
                                <TabsContent value="fabric">
                                    <div className="space-y-1 text-sm text-muted-foreground pt-2">
                                        {request.fabricDetails?.map((item, index) => item.fabricName && (
                                            <div key={index} className="flex justify-between p-1 rounded-md hover:bg-muted/50">
                                                <span>{item.fabricName}</span>
                                                <span className="font-mono">{item.quantity} Mtr</span>
                                            </div>
                                        ))}
                                    </div>
                                </TabsContent>
                                <TabsContent value="furniture">
                                    <div className="space-y-1 text-sm text-muted-foreground pt-2">
                                        {request.furnitureDetails?.map((item, index) => item.furnitureName && (
                                            <div key={index} className="flex justify-between p-1 rounded-md hover:bg-muted/50">
                                                <span>{item.furnitureName}</span>
                                                <span className="font-mono">{item.quantity}</span>
                                            </div>
                                        ))}
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                    </div>


                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full !mt-4">
                            <span className='mr-2'>View Process</span>
                            <ChevronDown className="h-4 w-4" />
                        </Button>
                    </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                    <div className="px-4 pb-2 border-t">
                        <Button variant="link" onClick={() => setShowAllSteps(prev => !prev)} className="text-xs">
                           {showAllSteps ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                           {showAllSteps ? 'Show Pending Steps' : 'Show All Steps'}
                        </Button>
                    </div>
                    <PurchaseProcessTimeline
                        request={request}
                        onStepUpdate={() => {}}
                        onQuickStepUpdate={updateStepInFirestore}
                        onVendorTypeSelect={handleVendorTypeSelect}
                        onRevertStep={() => {}}
                        userRole={role}
                        userDesignation={designation}
                        showAllSteps={showAllSteps}
                    />
                </CollapsibleContent>
            </Collapsible>
        )
    }

    const isFabricRequest = (req: PurchaseRequest) => req.fabricDetails && req.fabricDetails.length > 0 && req.fabricDetails.some(f => f.fabricName);
    const isFurnitureRequest = (req: PurchaseRequest) => req.furnitureDetails && req.furnitureDetails.length > 0 && req.furnitureDetails.some(f => f.furnitureName);

    const fabricRequests = purchaseRequests.filter(isFabricRequest);
    const furnitureRequests = purchaseRequests.filter(isFurnitureRequest);


    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Purchase Process</h1>
                    <p className="text-muted-foreground">Manage and track all purchase requests from authorization to placing the order.</p>
                </div>
                <Button asChild>
                    <Link href="/dashboard/purchase/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        New Purchase Request
                    </Link>
                </Button>
            </header>
            
             <Tabs defaultValue="fabric" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="fabric">Fabric Requests</TabsTrigger>
                    <TabsTrigger value="furniture">Furniture Requests</TabsTrigger>
                </TabsList>
                <TabsContent value="fabric">
                    <div className="space-y-4 pt-4">
                        {loading ? (
                            Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)
                        ) : fabricRequests.length > 0 ? (
                             fabricRequests.map(request => <PurchaseRequestCard key={request.id} request={request} />)
                        ) : (
                            <Card className="text-center p-12">
                                <CardTitle>No Fabric Requests</CardTitle>
                                <CardDescription>
                                    Create a new fabric purchase request to see it here.
                                </CardDescription>
                            </Card>
                        )}
                    </div>
                </TabsContent>
                <TabsContent value="furniture">
                    <div className="space-y-4 pt-4">
                        {loading ? (
                            Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)
                        ) : furnitureRequests.length > 0 ? (
                            furnitureRequests.map(request => <PurchaseRequestCard key={request.id} request={request} />)
                        ) : (
                            <Card className="text-center p-12">
                                <CardTitle>No Furniture Requests</CardTitle>
                                <CardDescription>
                                    Create a new furniture purchase request to see it here.
                                </CardDescription>
                            </Card>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

             <AlertDialog open={!!deletingRequest} onOpenChange={() => setDeletingRequest(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the purchase request for <span className="font-bold">{deletingRequest?.customerName}</span> (ID: {deletingRequest?.dealId}). This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
