
"use client";

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Milestone, Scissors, Package, Users, Wind, Check, Scan, Ruler, Box, Tag, Award, Waves, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const PMS_PROCESS_CONFIG = [
    { id: 1, step: "Roll & Fabric Allocation", time: "15 min", icon: Milestone },
    { id: 2, step: "Fabric Cutting", time: "2 hr", icon: Scissors },
    { id: 3, step: "Material Full Kitting", time: "15 min", icon: Package },
    { id: 4, step: "Allocate To Tailors", time: "3 min", icon: Users },
    { id: 5, step: "Stitch panels together", time: "15 min", icon: Layers },
    { id: 6, step: "Over lock & Ironing", time: "15 min", icon: Wind },
    { id: 7, step: "Stitching Head", time: "15 min", icon: Check },
    { id: 8, step: "Sizing", time: "10 min", icon: Ruler },
    { id: 9, step: "Bottom & Pleating", time: "15 min", icon: Scan },
    { id: 10, step: "Pleating/Rings/Eyelets", time: "15 min", icon: Box },
    { id: 11, step: "Ironing", time: "5 min", icon: Waves },
    { id: 12, step: "Q&Q", time: "15 min", icon: Award },
    { id: 13, step: "Packing & Labelling", time: "8 min", icon: Tag },
];

function PmsTimeline({ processConfig }: { processConfig: typeof PMS_PROCESS_CONFIG }) {
    const [completedSteps, setCompletedSteps] = useState<number[]>([]);

    const toggleStep = (stepId: number) => {
        setCompletedSteps(prev => 
            prev.includes(stepId) ? prev.filter(id => id !== stepId) : [...prev, stepId]
        );
    };

    return (
        <div className="relative pl-6 pr-4 py-4">
            <div className="absolute left-11 top-0 h-full w-0.5 bg-border -translate-x-1/2" aria-hidden="true"></div>
            <div className="space-y-4">
                {processConfig.map((stepConfig) => {
                    const isCompleted = completedSteps.includes(stepConfig.id);
                    const Icon = stepConfig.icon;

                    return (
                        <div key={stepConfig.id} className="relative flex items-start gap-4">
                            <div className="flex h-14 w-14 items-center justify-center shrink-0">
                                <div className={cn(
                                    "flex h-16 w-16 items-center justify-center rounded-full border-2 border-border shadow-sm text-lg font-bold",
                                    isCompleted ? "bg-accent text-accent-foreground" : "bg-card"
                                )}>
                                    {stepConfig.id}
                                </div>
                            </div>
                            <Card className={cn("w-full group hover:shadow-md transition-shadow", isCompleted ? "bg-accent/10 border-accent" : "")}>
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-base flex items-center gap-2">
                                                <Icon className="h-5 w-5 text-primary" />
                                                {stepConfig.step}
                                            </CardTitle>
                                        </div>
                                        <div className="text-right flex-shrink-0 ml-4">
                                            <p className="font-semibold text-sm text-muted-foreground">{stepConfig.time}</p>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Button size="sm" variant={isCompleted ? "destructive" : "default"} onClick={() => toggleStep(stepConfig.id)}>
                                        {isCompleted ? "Mark as Incomplete" : "Mark as Complete"}
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function PmsPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Project Management System (PMS)</h1>
                <p className="text-muted-foreground">
                    This is a visualization of the production and stitching workflow.
                </p>
            </header>
            <Card>
                <CardHeader>
                    <CardTitle>Production Timeline</CardTitle>
                    <CardDescription>
                        Each step of the fabric production process from allocation to final packing.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <PmsTimeline processConfig={PMS_PROCESS_CONFIG} />
                </CardContent>
            </Card>
        </div>
    );
}
