
"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Milestone, UserRole } from "@/lib/types";
import { CheckCircle2, Circle, Factory, Milestone as MilestoneIcon, Package, PackageCheck, Rocket, Scissors, Wrench } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/context/AuthContext";

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
    // Installers handled on mobile view, but this check prevents them here.
    if (userRole === 'installer' && milestoneId > 5) return true; 
    return false;
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
            
            // A milestone can be ticked if the user has permission AND:
            // 1. It's already completed (allowing it to be un-ticked ONLY by an admin).
            // 2. The previous one is completed (allowing it to be ticked forward).
            // Employees should not be able to revert.
            const canBeTicked = canEditMilestone(milestone.id) &&
                                 ((isCompleted && userRole === 'admin') || (!isCompleted && prevMilestoneCompleted));

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
                    {canEditMilestone(milestone.id) && (
                      <Checkbox
                        id={`milestone-${milestone.id}`}
                        checked={isCompleted}
                        onCheckedChange={(checked) => onMilestoneChange?.(milestone.id, !!checked)}
                        className="h-5 w-5"
                        disabled={!canBeTicked}
                      />
                    )}
                  </div>
                  {isCompleted && milestone.completedAt && (
                     <Tooltip>
                        <TooltipTrigger>
                           <p className="text-xs text-muted-foreground">
                            Completed on {new Date(milestone.completedAt).toLocaleDateString()}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent>
                           <p>
                             {new Date(milestone.completedAt).toLocaleString()} by {milestone.completedBy || 'System'}
                           </p>
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
