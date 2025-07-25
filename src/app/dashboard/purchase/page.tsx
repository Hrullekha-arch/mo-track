
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, CheckSquare, Banknote, PackageSearch, MessageSquare, Briefcase, PlusCircle, CheckCircle, AlertTriangle, MessageSquareWarning, SkipForward, Calendar, Eye, EyeOff, ChevronDown, UserCheck, Search, Users, FileText, BadgePercent, ThumbsUp, Timer, ShoppingCart, Undo2, Layers, MoreVertical, Trash2, Clock, Ban, Loader2 } from 'lucide-react';
import { collection, onSnapshot, query, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PurchaseRequest, PurchaseStep, PurchaseStatus } from "@/lib/types";
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { addDays, addHours, addMinutes, isPast, format, formatDistanceToNow, differenceInHours, subHours } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PurchaseRequestTable } from '@/components/features/purchase/PurchaseRequestTable';


const PURCHASE_PROCESS_CONFIG: PurchaseStep[] = [
    { id: 1, step: "Verify Authorization", details: "Check if the request is authorized", time: "30 min", role: "Accounts", icon: UserCheck, expectedDuration: { minutes: 30 } },
    { id: 2, step: "Payment Verification", details: "Verify payment availability", time: "30 min", role: "Accounts", icon: Banknote, expectedDuration: { minutes: 30 } },
    { id: 3, step: "Stock Verification", details: "Check current stock levels", time: "30 min", role: "PC", icon: PackageSearch, expectedDuration: { minutes: 30 } },
    { id: 4, step: "Inform Requesting Person", details: "Update the person who made the request", time: "30 min", role: "PC", icon: MessageSquare, expectedDuration: { minutes: 30 } },
    { id: 5, step: "Select Vendor Type", details: "Yes for Existing, No for New", time: "N/A", role: "PC", icon: Briefcase, expectedDuration: {} },
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
            if (prevStepConfig && prevStepConfig.id === 5) {
                prevStepConfig = allSteps[currentIndex - 2];
            }
            
            if (!prevStepConfig) {
                 startDate = new Date(); // Fallback
            } else {
                const previousStepStatus = (request.milestones || []).find(m => m.stepId === prevStepConfig.id);
                if (previousStepStatus?.status === 'completed' || previousStepStatus?.status === 'skipped') {
                    startDate = new Date(previousStepStatus.completedAt);
                } else {
                    startDate = acc[prevStepConfig.id] || new Date();
                }
            }
        }
        acc[currentStep.id] = getExpectedCompletionDate(currentStep, startDate);
        return acc;
    }, {} as Record<number, Date>);
}


function PurchaseProcessTimeline({ 
    request, 
    onQuickStepUpdate,
    onVendorTypeSelect,
    onRevertStep,
    userRole,
    userDesignation,
    showAllSteps = false,
}: { 
    request: PurchaseRequest; 
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
    
    const isBlocked = useMemo(() => {
        return request.milestones.some(m => m.stepId <= 3 && m.status === 'skipped');
    }, [request.milestones]);


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
    
    const renderActionButtons = (stepConfig: PurchaseStep) => {
        const hasPermission = checkPermission(stepConfig.role);

        const handleAction = (action: 'yes' | 'no') => {
            if (stepConfig.id === 5) {
                const vendorType = action === 'yes' ? 'existing' : 'new';
                onVendorTypeSelect(request.id, vendorType);
            } else {
                const status = action === 'yes' ? 'completed' : 'skipped';
                onQuickStepUpdate(request.id, stepConfig.id, status);
            }
        };

        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button size="sm" disabled={!hasPermission || isBlocked}>
                        Action
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleAction('yes')}>Yes</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction('no')}>No</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        );
    };

    return (
        <div className="relative pl-6 pr-4 py-4">
            <div className="absolute left-9 top-0 h-full w-0.5 bg-border -translate-x-1/2" aria-hidden="true"></div>
            {isBlocked && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                    <Ban className="h-5 w-5 shrink-0" />
                    <p>This request is blocked because a verification step was failed. No further actions can be taken.</p>
                </div>
            )}
            <div className="space-y-4">
                {(showAllSteps ? processSteps : stepsToShow).map((stepConfig) => {
                    const stepStatus = request.milestones?.find(s => s.stepId === stepConfig.id);
                    const isPending = !stepStatus;
                    const expectedDate = expectedDates[stepConfig.id];
                    const isOverdue = isPast(expectedDate) && isPending;
                    const Icon = stepConfig.icon;
                    const prevStep = getPrevStep(stepConfig.id);

                    const canAct = (() => {
                        if (isPending) {
                            if (!prevStep) { // This is the first step
                                return true;
                            }
                            const prevStatus = request.milestones.find(m => m.stepId === prevStep.id);
                            // Can act if prev step is completed (not skipped)
                            if (prevStatus?.status === 'completed') {
                                return true;
                            }
                        }
                        return false;
                    })();
                    
                    return (
                        <div key={stepConfig.id} className="relative flex items-start gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-border shadow-sm shrink-0 bg-card">
                                <Icon className={cn("h-6 w-6", 
                                   stepStatus?.status === 'completed' ? "text-green-500" :
                                   stepStatus?.status === 'skipped' ? "text-destructive" :
                                   isOverdue ? "text-red-500" : "text-muted-foreground"
                                )} />
                            </div>
                            <Card className={cn("w-full group hover:shadow-md", isPending && isOverdue ? "border-red-500 bg-red-50" : stepStatus?.status === 'skipped' ? 'border-destructive/50 bg-destructive/5' : '')}>
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
                                             {stepStatus?.status === 'skipped' && (
                                                <div className="flex items-center gap-2 text-destructive font-medium">
                                                    <Ban className="h-4 w-4" />
                                                    <span>Skipped by {stepStatus.completedBy} at {formatTimestamp(new Date(stepStatus.completedAt))}</span>
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
                                            {canAct ? (
                                                renderActionButtons(stepConfig)
                                            ) : (
                                                stepStatus?.status && <Badge variant={stepStatus.status === 'skipped' ? 'destructive' : 'default'} className="capitalize">{stepConfig.id === 5 && request.vendorType !== 'undecided' ? request.vendorType : stepStatus.status}</Badge>
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

const PurchaseRequestCard = ({ 
    request, 
    onRevertStep,
    onDeleteRequest,
}: { 
    request: PurchaseRequest;
    onRevertStep: (requestId: string, stepId: number, milestone: PurchaseStatus) => void;
    onDeleteRequest: (request: PurchaseRequest) => void;
}) => {
    const [showAllSteps, setShowAllSteps] = useState(false);
    const { user, role, designation } = useAuth();
    const { toast } = useToast();
   
    const hasFabric = request.fabricDetails && request.fabricDetails.length > 0 && request.fabricDetails.some(f => f.fabricName);
    const hasFurniture = request.furnitureDetails && request.furnitureDetails.length > 0 && request.furnitureDetails.some(f => f.furnitureName);
    const defaultTab = hasFabric ? "fabric" : "furniture";

    const expectedDates = calculateExpectedDatesForRequest(request);
    let processSteps = [...PURCHASE_PROCESS_CONFIG];
    if (request.vendorType === 'existing') processSteps.push(...EXISTING_VENDOR_BRANCH);
    else if (request.vendorType === 'new') processSteps.push(...NEW_VENDOR_BRANCH);

    const completedSteps = (request.milestones || []);
    const nextStepIndex = processSteps.findIndex(s => !completedSteps.some(cs => cs.stepId === s.id));
    const currentStep = nextStepIndex !== -1 ? processSteps[nextStepIndex] : null;
    
    const lastStepInExisting = EXISTING_VENDOR_BRANCH[EXISTING_VENDOR_BRANCH.length - 1];
    const lastStepInNew = NEW_VENDOR_BRANCH[NEW_VENDOR_BRANCH.length - 1];
    const isCompleted = completedSteps.some(cs => (cs.stepId === lastStepInExisting.id || cs.stepId === lastStepInNew.id) && cs.status === 'completed');

    const isBlocked = useMemo(() => {
        return request.milestones.some(m => m.stepId <= 3 && m.status === 'skipped');
    }, [request.milestones]);

    let statusTextColor = "text-primary";
    let statusText = "In Progress";
    let pendingWith = "";
    if (isBlocked) {
        statusText = "Blocked";
        statusTextColor = "text-destructive";
        pendingWith = "Action Required";
    } else if (isCompleted) {
        statusText = "Order Placed";
        statusTextColor = "text-green-600";
    } else if (currentStep) {
        statusText = currentStep.step;
        pendingWith = currentStep.role;
        if (currentStep.id !== 5 && expectedDates[currentStep.id]) {
             const expectedDate = expectedDates[currentStep.id];
            if (isPast(expectedDate)) {
                statusTextColor = "text-red-500";
            } else if (differenceInHours(expectedDate, new Date()) <= 24) {
                statusTextColor = "text-orange-500";
            }
        }
    }
    
    const handleQuickStepUpdate = async (requestId: string, stepId: number, status: 'completed' | 'skipped') => {
        if (!user) return toast({ variant: "destructive", title: "You must be logged in." });

        const newStatus: PurchaseStatus = { stepId, status, completedAt: new Date().toISOString(), completedBy: user.name };
        try {
            const requestRef = doc(db, "purchaseRequests", requestId);
            const updatePayload: any = { milestones: arrayUnion(newStatus) };
            if (stepId === 6 || stepId === 11) {
                updatePayload.poMilestones = [];
                updatePayload.poDeliveryDate = null;
            }
            await updateDoc(requestRef, updatePayload);
            toast({ title: "Step Updated!", description: "Progress has been saved." });
        } catch (error) {
            console.error("Error updating purchase step:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        }
    };
    
    const handleVendorTypeSelect = async (requestId: string, vendorType: 'existing' | 'new') => {
        if (!user) return;
        const newStatus: PurchaseStatus = { stepId: 5, status: 'completed', completedAt: new Date().toISOString(), completedBy: user.name, remarks: `Selected ${vendorType} vendor`};
        try {
            const requestRef = doc(db, "purchaseRequests", requestId);
            await updateDoc(requestRef, { vendorType, milestones: arrayUnion(newStatus) });
            toast({ title: "Vendor Type Selected", description: `Switched to ${vendorType} vendor workflow.` });
        } catch (error) {
            console.error("Error setting vendor type:", error);
            toast({ variant: "destructive", title: "Update Failed" });
        }
    };
    
    return (
            <Collapsible key={request.id} className={cn("border-2 rounded-lg bg-card overflow-hidden", isBlocked && 'border-destructive')}>
                <div className="p-4 space-y-4">
                    <div className="flex gap-4">
                        <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1 text-sm">
                                    <h3 className="font-semibold text-lg">{request.customerName}</h3>
                                    <p className="text-sm text-muted-foreground">ID: {request.dealId}</p>
                                    <p className='flex items-center gap-2 pt-1'><User className='h-4 w-4 text-muted-foreground' /> Salesman: {request.salesman}</p>
                                    <p className='flex items-center gap-2'><Briefcase className='h-4 w-4 text-muted-foreground' /> Work Type: {request.workType}</p>
                                     <p className={cn('flex items-center gap-2 font-medium', statusTextColor)}>
                                        <Clock className='h-4 w-4'/>
                                        Status: {statusText} {pendingWith && `(Pending with: ${pendingWith})`}
                                    </p>
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
                                                    <AlertDialogTrigger asChild>
                                                        <DropdownMenuItem 
                                                            className="text-destructive focus:text-destructive"
                                                            onClick={() => onDeleteRequest(request)}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                        </DropdownMenuItem>
                                                    </AlertDialogTrigger>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}
                                        {request.vendorType !== 'undecided' && (
                                            <Badge className='mt-2 capitalize' variant="outline">{request.vendorType} vendor</Badge>
                                        )}
                                    </div>
                                    {request.createdAt && (
                                        <p className='flex items-center gap-2 text-sm mt-2'><Calendar className='h-4 w-4 text-muted-foreground' /> {format(new Date(request.createdAt), 'dd/MM/yyyy')}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <Separator orientation="vertical" className="h-auto" />

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
                        onQuickStepUpdate={handleQuickStepUpdate}
                        onVendorTypeSelect={handleVendorTypeSelect}
                        onRevertStep={onRevertStep}
                        userRole={role}
                        userDesignation={designation}
                        showAllSteps={showAllSteps}
                    />
                </CollapsibleContent>
            </Collapsible>
    )
}


export default function PurchasePage() {
    const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [deletingRequest, setDeletingRequest] = useState<PurchaseRequest | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [revertingStepInfo, setRevertingStepInfo] = useState<{requestId: string, stepId: number, milestone: PurchaseStatus} | null>(null);
    const [isReverting, setIsReverting] = useState(false);


    useEffect(() => {
        const q = query(collection(db, "purchaseRequests"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
            
            const twentyFourHoursAgo = subHours(new Date(), 24);
            const requestsToDelete: string[] = [];

            requestsData.forEach(req => {
                const blockedStep = req.milestones.find(m => m.stepId <= 3 && m.status === 'skipped');
                if (blockedStep) {
                    const blockedAt = new Date(blockedStep.completedAt);
                    if (blockedAt < twentyFourHoursAgo) {
                        requestsToDelete.push(req.id);
                    }
                }
            });

            if (requestsToDelete.length > 0) {
                Promise.all(requestsToDelete.map(id => deleteDoc(doc(db, "purchaseRequests", id))))
                    .then(() => {
                        toast({
                            title: "Auto-Clean Up",
                            description: `${requestsToDelete.length} blocked purchase request(s) older than 24 hours have been deleted.`
                        });
                    })
                    .catch(err => {
                        console.error("Error auto-deleting requests:", err);
                        toast({ variant: "destructive", title: "Auto-delete failed." });
                    });
            }

            // Filter out the deleted requests from the state immediately
            const activeRequests = requestsData.filter(req => !requestsToDelete.includes(req.id));
            setPurchaseRequests(activeRequests.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setLoading(false);
        });
        return () => unsubscribe();
    }, [toast]);
    
    const isCompleted = (request: PurchaseRequest) => {
        const lastStepInExisting = 6;
        const lastStepInNew = 11;
        return request.milestones.some(cs => (cs.stepId === lastStepInExisting || cs.stepId === lastStepInNew) && cs.status === 'completed');
    };

    const activeFabricRequests = useMemo(() => purchaseRequests.filter(req => req.type === 'fabric' && !isCompleted(req)), [purchaseRequests]);
    const activeFurnitureRequests = useMemo(() => purchaseRequests.filter(req => req.type === 'furniture' && !isCompleted(req)), [purchaseRequests]);

    const handleOpenRevertDialog = (requestId: string, stepId: number, milestone: PurchaseStatus) => {
        setRevertingStepInfo({ requestId, stepId, milestone });
    };

    const handleRevertStep = async () => {
        if (!revertingStepInfo) return;
        setIsReverting(true);
        const { requestId, stepId, milestone } = revertingStepInfo;
    
        try {
            const requestRef = doc(db, "purchaseRequests", requestId);
            let updatePayload: any = { milestones: arrayRemove(milestone) };
    
            if (stepId === 5) {
                updatePayload.vendorType = 'undecided';
                const docSnap = await getDoc(requestRef);
                if (docSnap.exists()) {
                    const currentRequest = docSnap.data() as PurchaseRequest;
                    const branchToRemove = currentRequest.vendorType === 'existing' ? EXISTING_VENDOR_BRANCH : NEW_VENDOR_BRANCH;
                    const branchStepIds = branchToRemove.map(s => s.id);
                    const milestonesToRevert = currentRequest.milestones.filter(m => branchStepIds.includes(m.stepId));
                    if (milestonesToRevert.length > 0) {
                       await updateDoc(requestRef, { milestones: arrayRemove(...milestonesToRevert) });
                    }
                }
            }
             
            await updateDoc(requestRef, updatePayload);
            toast({ title: "Step Reverted!", description: "The step has been successfully reverted." });
        } catch (error) {
            console.error("Error reverting step:", error);
            toast({ variant: "destructive", title: "Revert Failed" });
        } finally {
            setIsReverting(false);
            setRevertingStepInfo(null);
        }
    };
    
     const handleDelete = async () => {
        if (!deletingRequest) return;
        setIsDeleting(true);
        try {
            await deleteDoc(doc(db, "purchaseRequests", deletingRequest.id));
            toast({ title: "Purchase Request Deleted" });
            setDeletingRequest(null);
        } catch (error) {
            console.error("Error deleting purchase request:", error);
            toast({ variant: "destructive", title: "Deletion Failed" });
        } finally {
            setIsDeleting(false);
        }
    };

    const renderRequests = (requests: PurchaseRequest[]) => {
         if (loading) {
            return Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-40 w-full" />);
        }
        if (requests.length === 0) {
            return (
                <Card className="text-center p-12">
                    <CardTitle>No Active Requests Found</CardTitle>
                    <CardDescription>
                        Create a new purchase request or check the "All" tab for completed ones.
                    </CardDescription>
                </Card>
            );
        }
        return requests.map(request => (
            <PurchaseRequestCard 
                key={request.id} 
                request={request}
                onRevertStep={handleOpenRevertDialog}
                onDeleteRequest={setDeletingRequest}
            />
        ));
    };

    return (
        <AlertDialog>
            <div className="space-y-4">
                <header className="flex items-center justify-between">
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
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="fabric">Active Fabric</TabsTrigger>
                        <TabsTrigger value="furniture">Active Furniture</TabsTrigger>
                        <TabsTrigger value="all">All Purchases</TabsTrigger>
                    </TabsList>
                    <TabsContent value="fabric">
                        <div className="space-y-4 pt-4">
                            {renderRequests(activeFabricRequests)}
                        </div>
                    </TabsContent>
                    <TabsContent value="furniture">
                        <div className="space-y-4 pt-4">
                           {renderRequests(activeFurnitureRequests)}
                        </div>
                    </TabsContent>
                    <TabsContent value="all" className="pt-4">
                        <PurchaseRequestTable />
                    </TabsContent>
                </Tabs>
            </div>

            {!!deletingRequest && (
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the purchase request for <span className="font-bold">{deletingRequest?.customerName}</span> (ID: {deletingRequest?.dealId}). This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeletingRequest(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                             {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            )}
            {!!revertingStepInfo && (
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will revert the step: <strong>{ALL_STEPS_MAP[revertingStepInfo.stepId]?.step}</strong>. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setRevertingStepInfo(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRevertStep} disabled={isReverting}>
                             {isReverting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Continue
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            )}
        </AlertDialog>
    );
}
