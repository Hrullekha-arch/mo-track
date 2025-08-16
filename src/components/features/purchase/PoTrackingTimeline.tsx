

"use client";

import { PurchaseRequest, PurchaseStatus } from "@/lib/types";
import { format, isPast, formatDistanceToNow, addDays, addHours, addMinutes, subDays } from 'date-fns';
import { AlertDialog, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PO_PROCESS_CONFIG, calculateExpectedDatesForPO } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Clock, Check, Undo2 } from "lucide-react";


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
                {PO_PROCESS_CONFIG.map((stepConfig) => {
                    const stepStatus = request.poMilestones?.find(s => s.stepId === stepConfig.id);
                    const isCompleted = !!stepStatus;
                    const isPending = !stepStatus;
                    const expectedDate = expectedDates[stepConfig.id];
                    const isOverdue = expectedDate && isPast(expectedDate) && isPending;
                    const Icon = stepConfig.icon;

                    return (
                        <div key={stepConfig.id} className="relative flex items-start gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-border shadow-sm shrink-0 bg-card">
                                <Icon className={cn("h-6 w-6", 
                                   isCompleted ? "text-green-500" : (isOverdue ? "text-red-500" : "text-muted-foreground")
                                )} />
                            </div>
                            <Card className={cn("w-full group hover:shadow-md", isCompleted ? "bg-green-50" : (isOverdue ? "border-red-500 bg-red-50" : ""))}>
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
                                            {expectedDate && (
                                                <div className="flex items-center gap-2">
                                                    <Clock className="h-4 w-4" />
                                                    <span>Expected by: {formatTimestamp(expectedDate)}</span>
                                                    {isOverdue && <Badge variant="destructive">Overdue</Badge>}
                                                </div>
                                            )}
                                            {stepStatus?.status === 'completed' && (
                                                <div className="flex items-center gap-2 text-green-600 font-medium">
                                                    <Check className="h-4 w-4" />
                                                    <span>Completed at {formatTimestamp(new Date(stepStatus.completedAt))} by {stepStatus.completedBy}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isCompleted && userRole === 'admin' && (
                                                 <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onRevertStep(request.id, stepStatus)}>
                                                        <Undo2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                            )}
                                            {!isCompleted && (
                                                <Button size="sm" onClick={() => onStepUpdate(request.id, stepConfig.id)}>Mark as Done</Button>
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
