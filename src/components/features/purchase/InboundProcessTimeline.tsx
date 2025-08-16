

"use client";

import { InboundRequest, InboundMilestone } from "@/lib/types";
import { format } from 'date-fns';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { INBOUND_PROCESS_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Check, Clock } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InboundProcessTimeline({ request }: { request: InboundRequest }) {
    return (
        <div className="space-y-4">
            {request.items.map((item, index) => (
                <Collapsible key={index} asChild defaultOpen>
                    <Card className="overflow-hidden">
                        <CollapsibleTrigger asChild>
                            <div className="bg-muted/50 p-4 flex justify-between items-center cursor-pointer">
                                <div>
                                    <p className="font-semibold">{item.itemName}</p>
                                    <p className="text-sm text-muted-foreground">Qty: {item.quantity} {item.unit}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <Badge variant="secondary">PO: {item.poNumber || 'N/A'}</Badge>
                                    <Button variant="ghost" size="sm" className="data-[state=open]:rotate-180">
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <div className="p-4">
                                <div className="grid grid-cols-5 gap-4 text-center text-xs text-muted-foreground">
                                    {INBOUND_PROCESS_CONFIG.map(step => {
                                        const milestone = item.inboundMilestones?.find(m => m.stepId === step.id);
                                        const isCompleted = milestone?.status === 'completed';
                                        const Icon = step.icon;
                                        return (
                                            <div key={step.id} className="flex flex-col items-center gap-1">
                                                <div className={cn(
                                                    "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                                                    isCompleted ? "bg-green-100 border-green-500" : "bg-card border-border"
                                                )}>
                                                    <Icon className={cn("h-5 w-5 transition-colors", isCompleted ? "text-green-600" : "text-muted-foreground")} />
                                                </div>
                                                <p className="font-medium mt-1">{step.name}</p>
                                                {isCompleted && milestone?.completedAt ? (
                                                    <p className="text-green-600">{format(new Date(milestone.completedAt), 'dd/MM HH:mm')}</p>
                                                ) : (
                                                    <p>{step.time}</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>
            ))}
        </div>
    );
}
