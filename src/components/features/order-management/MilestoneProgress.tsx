"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Milestone, UserRole } from "@/lib/types";
import { CheckCircle2, Circle, Factory, Milestone as MilestoneIcon, Package, PackageCheck, Rocket, Scissors, Wrench } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MilestoneProgressProps {
  milestones: Milestone[];
  onMilestoneChange?: (milestoneId: number, completed: boolean) => void;
  role?: UserRole | null;
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

export function MilestoneProgress({ milestones, onMilestoneChange, role = null }: MilestoneProgressProps) {
  const isEditable = role === 'admin' || role === 'employee';
  
  const completedCount = milestones.filter(m => m.completed).length;
  const progressPercentage = (completedCount / milestones.length) * 100;

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
            const isCurrent = !isCompleted && (index === 0 || milestones[index - 1].completed);

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
                      <Checkbox
                        id={`milestone-${milestone.id}`}
                        checked={isCompleted}
                        onCheckedChange={(checked) => onMilestoneChange?.(milestone.id, !!checked)}
                        className="h-5 w-5"
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
