
"use client";

import { PurchaseRequest, PurchaseStatus } from "@/lib/types";
import { format, isPast, formatDistanceToNow, addDays, addHours, addMinutes, subDays } from 'date-fns';
import { AlertDialog, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PO_PROCESS_CONFIG, PURCHASE_PROCESS_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Clock, Check, Undo2 } from "lucide-react";


export const calculateExpectedDatesForPO = (request: PurchaseRequest) => {
    return PO_PROCESS_CONFIG.reduce((acc, currentStep) => {
        let startDate: Date;
        if (currentStep.id === 1) {
             // PO process starts when the 'Place Order' step in the previous phase is completed.
            const placeOrderStep = request.milestones.find(m => m.stepId === 6 || m.stepId === 11);
            startDate = placeOrderStep ? new Date(placeOrderStep.completedAt) : new Date();
        } else {
            const previousStepConfig = PO_PROCESS_CONFIG.find(s => s.id === currentStep.id - 1)!;
            const previousStepStatus = (request.poMilestones || []).find(m => m.stepId === previousStepConfig.id);
            
            // Check for actual completed milestones to base the next step on
            const allPreviousMilestones = (request.poMilestones || []).filter(m => m.stepId < currentStep.id);
            const latestPreviousMilestone = allPreviousMilestones.sort((a,b) => new Date(b.completedAt).getTime() - new Date(a.createdAt).getTime())[0];

            if (latestPreviousMilestone) {
                startDate = new Date(latestPreviousMilestone.completedAt);
            } else if (previousStepStatus?.status === 'completed' || previousStepStatus?.status === 'skipped') {
                startDate = new Date(previousStepStatus.completedAt);
            } else {
                startDate = acc[previousStepConfig.id];
            }
        }
        
        // Dynamic date calculation based on vendor's promised date
        if (request.poDeliveryDate) {
            if (currentStep.id === 2) { // Material Delivery Follow up is 2 days before promised date
                acc[currentStep.id] = subDays(new Date(request.poDeliveryDate), 2);
                return acc;
            } else if (currentStep.id === 3) { // Receiving and Handover is on the promised date
                acc[currentStep.id] = new Date(request.poDeliveryDate);
                return acc;
            }
        }
        
        // Fallback to standard duration calculation
        const { days = 0, hours = 0, minutes = 0 } = currentStep.expectedDuration;
        let completionDate = addDays(startDate, days);
        completionDate = addHours(completionDate, hours);
        completionDate = addMinutes(completionDate, minutes);
        acc[currentStep.id] = completionDate;

        return acc;
    }, {} as Record<number, Date>);
}

const formatTimestamp = (date: Date) => {
    return format(date, 'dd/yyyy - HH:mm');
};


export function PoTrackingTimeline({ 
    request, 
    onStepUpdate, 
    onRevertStep, 
    userRole 
}: { 
    request: PurchaseRequest, 
    onStepUpdate: (requestId: string, stepId: number) => void; 
    onRevertStep: (requestId: string, milestone: PurchaseStatus) => void; 
    userRole: string | null; 
}) {
    const expectedDates = calculateExpectedDatesForPO(request);
    
    return (
        <div className="relative pl-6 pr-4 py-4">
            <div className="absolute left-9 top-0 h-full w-0.5 bg-border -translate-x-1/2" aria-hidden="true"></div>
            <div className="space-y-4">
                {PURCHASE_PROCESS_CONFIG.map((stepConfig) => {
                    const stepStatus = request.milestones?.find(s => s.stepId === stepConfig.id);
                    
                    const Icon = stepConfig.icon;

                    return (
                        <div key={stepConfig.id} className="relative flex items-start gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-border shadow-sm shrink-0 bg-card">
                                <Icon className={cn("h-6 w-6", 
                                   stepStatus?.status === 'completed' ? "text-green-500" : "text-muted-foreground"
                                )} />
                            </div>
                            <Card className={cn("w-full group hover:shadow-md", stepStatus?.status === 'completed' ? "bg-green-50" : "")}>
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-base">{stepConfig.step}</CardTitle>
                                            <CardDescription>{stepConfig.details}</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex justify-between items-center flex-wrap gap-4">
                                        <div className="text-xs text-muted-foreground space-y-2 flex-grow">
                                            {stepStatus?.status === 'completed' && (
                                                <div className="flex items-center gap-2 text-green-600 font-medium">
                                                    <Check className="h-4 w-4" />
                                                    <span>Completed at {formatTimestamp(new Date(stepStatus.completedAt))} by {stepStatus.completedBy}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {stepStatus && <Badge variant="default">Done</Badge>}
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
