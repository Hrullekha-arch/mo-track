
"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Milestone, UserRole } from "@/lib/types";
import { CheckCircle2, Circle, Factory, Milestone as MilestoneIcon, Package, PackageCheck, Rocket, Scissors, Wrench, MapPin } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface MilestoneProgressProps {
  milestones: Milestone[];
  onMilestoneChange?: (milestoneId: number, completed: boolean) => void;
  role?: UserRole | null; // Keep for prop-drilling, but useAuth is preferred
}

const milestoneIcons: { [key: number]: React.ElementType } = {
  1: MilestoneIcon,
  2: Factory,
  3: Scissors,
  4: CheckCircle2,
  5: PackageCheck,
  6: Wrench,
  7: Rocket,
  8: Package,
};

export function MilestoneProgress({ milestones, onMilestoneChange }: MilestoneProgressProps) {
  const { role: userRole } = useAuth();
  
  const completedCount = milestones.filter(m => m.completed).length;
  const progressPercentage = (completedCount / milestones.length) * 100;

  const canEditMilestone = (milestoneId: number) => {
    if (userRole === 'admin') return true;
    if (userRole === 'employee' && milestoneId <= 5) return true; // Employees handle up to Ready for Delivery
    if (userRole === 'installer' && milestoneId > 5) return true; 
    return false;
  }
  
  const handleConfirm = (milestoneId: number, currentCheckedState: boolean) => {
    onMilestoneChange?.(milestoneId, !currentCheckedState);
  }

  return (
    <TooltipProvider>
      <div className="space-y-1">
        <div className="w-full bg-muted rounded-full h-2.5 mb-4">
            <div className="bg-accent h-2.5 rounded-full" style={{ width: `${progressPercentage}%` }}></div>
        </div>
        <ul className="space-y-4">
          {milestones.map((milestone, index) => {
            const Icon = milestoneIcons[milestone.id] || Circle;
            const isCompleted = milestone.completed;
            const prevMilestoneCompleted = index === 0 || milestones[index - 1].completed;
            const isCurrent = !isCompleted && prevMilestoneCompleted;
            
            let canBeTicked;
            if (userRole === 'admin') {
                canBeTicked = true; // Admin can always tick/untick
            } else if (userRole === 'employee') {
                // Employee can only tick forward, not revert.
                canBeTicked = !isCompleted && prevMilestoneCompleted;
            } else {
                canBeTicked = !isCompleted && prevMilestoneCompleted;
            }
            
            const isEditable = canEditMilestone(milestone.id);

            return (
              <li key={milestone.id} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full",
                      isCompleted ? "bg-accent text-accent-foreground" : isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  {index < milestones.length - 1 && (
                    <div className={cn("w-px h-6", isCompleted ? "bg-accent" : "bg-border")}></div>
                  )}
                </div>
                <div className="pt-1 flex-grow">
                  <div className="flex items-center justify-between">
                    <p className={cn("font-medium", isCompleted ? "text-accent" : isCurrent ? "text-primary" : "text-muted-foreground")}>
                      {milestone.name}
                    </p>
                    {isEditable && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                           <Checkbox
                                id={`milestone-${milestone.id}`}
                                checked={isCompleted}
                                className="h-5 w-5"
                                disabled={!canBeTicked}
                                // We use onCheckedChange on the trigger so it doesn't fire the change, only opens the dialog
                                onCheckedChange={(e) => { e.preventDefault()}}
                            />
                        </AlertDialogTrigger>
                         <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                This will {isCompleted ? 'revert' : 'complete'} the milestone: <strong>{milestone.name}</strong>. This action will be logged.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleConfirm(milestone.id, isCompleted)}>
                                    Continue
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                  {isCompleted && milestone.completedAt && (
                     <Tooltip>
                        <TooltipTrigger asChild>
                           <div className="flex items-center gap-2">
                             <p className="text-xs text-muted-foreground">
                                Completed on {new Date(milestone.completedAt).toLocaleDateString()}
                              </p>
                              {milestone.location && (
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                              )}
                           </div>
                        </TooltipTrigger>
                        <TooltipContent>
                           <div className="space-y-1">
                                <p>{new Date(milestone.completedAt).toLocaleString()} by {milestone.completedBy || 'System'}</p>
                                {milestone.location && <p>Location: {milestone.location.latitude.toFixed(4)}, {milestone.location.longitude.toFixed(4)}</p>}
                           </div>
                        </TooltipContent>
                     </Tooltip>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </TooltipProvider>
  );
}
