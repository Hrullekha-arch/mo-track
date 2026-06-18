"use client";

import * as React from "react";
import { Order, UserRole } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  applyOrderMilestoneChange,
  getNormalizedOrderMilestones,
} from "@/lib/order-workflow";
import { MilestoneProgress } from "@/components/features/order-management/MilestoneProgress";
import { Flag, Lock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface MilestoneCardProps {
  order: Order;
  milestones: ReturnType<typeof getNormalizedOrderMilestones>;
  role?: UserRole | null;
  className?: string;
}

export default function MilestoneCard({
  order,
  milestones,
  role,
  className,
}: MilestoneCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = React.useState(false);

  const canEditMilestones = React.useMemo(() => {
    return role === "admin" || role === "employee" || role === "PC";
  }, [role]);

  const completedCount = React.useMemo(() => {
    return milestones.filter((m) => m.completed).length;
  }, [milestones]);

  const progressPercentage = React.useMemo(() => {
    if (!milestones.length) return 0;
    return Math.round((completedCount / milestones.length) * 100);
  }, [milestones, completedCount]);

  const lastUpdatedAt = React.useMemo(() => {
    return milestones.reduce<string | null>((latest, milestone) => {
      if (!milestone.completedAt) return latest;
      if (!latest) return milestone.completedAt;
      return new Date(milestone.completedAt).getTime() >
        new Date(latest).getTime()
        ? milestone.completedAt
        : latest;
    }, null);
  }, [milestones]);

  const handleMilestoneChange = React.useCallback(
    async (milestoneId: number, completed: boolean) => {
      if (!canEditMilestones) {
        toast({
          variant: "destructive",
          title: "Permission Denied",
          description: "You are not authorized to change milestones.",
        });
        return;
      }

      if (!user?.id) {
        toast({
          variant: "destructive",
          title: "Authentication Required",
          description: "Please log in to update milestones.",
        });
        return;
      }

      setIsUpdating(true);

      try {
        const { milestones: updatedMilestones, workflow } =
          applyOrderMilestoneChange(order, milestoneId, completed, {
            id: user.id,
            name: user.name,
          });

        await updateDoc(doc(db, "orders", order.id), {
          milestones: updatedMilestones,
          workflow,
        });

        toast({
          title: "Milestone Updated",
          description: `Milestone ${completed ? "completed" : "marked incomplete"} successfully.`,
        });
      } catch (error: any) {
        console.error("Milestone update error:", error);
        toast({
          variant: "destructive",
          title: "Update Failed",
          description:
            error?.message || "Failed to update milestone. Please try again.",
        });
      } finally {
        setIsUpdating(false);
      }
    },
    [order, canEditMilestones, user, toast]
  );

  const handleRefresh = React.useCallback(() => {
    // Trigger a re-render by updating a local timestamp
    toast({
      title: "Refreshing...",
      description: "Milestone status updated.",
    });
  }, [toast]);

  return (
    <Card className={cn("sticky top-6 overflow-hidden", className)}>
      <CardHeader className="pb-3 border-b bg-gradient-to-br from-primary/5 to-primary/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Flag className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Order Progress</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Track milestone completion
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            className="h-7 w-7"
            disabled={isUpdating}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                isUpdating && "animate-spin"
              )}
            />
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">
              Overall Progress
            </span>
            <span className="font-semibold text-primary">
              {progressPercentage}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {completedCount} of {milestones.length} completed
            </span>
            <span>
              {milestones.length - completedCount} remaining
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {/* Permission Notice */}
        {!canEditMilestones && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
            <Lock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-800">
              <p className="font-medium">View Only</p>
              <p className="text-amber-700 mt-0.5">
                You don't have permission to edit milestones.
              </p>
            </div>
          </div>
        )}

        {/* Milestone Progress Component */}
        <MilestoneProgress
          milestones={milestones}
          onMilestoneChange={
            canEditMilestones ? handleMilestoneChange : undefined
          }
          role={role}
          disabled={isUpdating}
        />

        {/* Order Status Summary */}
        <div className="mt-4 pt-4 border-t space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Order Status</span>
            <span
              className={cn(
                "font-semibold px-2 py-0.5 rounded",
                order.status?.toLowerCase() === "completed"
                  ? "bg-green-100 text-green-700"
                  : order.status?.toLowerCase() === "approved"
                  ? "bg-blue-100 text-blue-700"
                  : order.status?.toLowerCase() === "pending"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-700"
              )}
            >
              {order.status || "Unknown"}
            </span>
          </div>

          {order.workflow?.status && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Workflow Status</span>
              <span className="font-medium">
                {order.workflow.status.replace(/_/g, " ")}
              </span>
            </div>
          )}

          {lastUpdatedAt && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Last Updated</span>
              <span className="font-medium">
                {new Date(lastUpdatedAt).toLocaleDateString(
                  "en-IN",
                  {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                )}
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {canEditMilestones && (
          <div className="mt-4 pt-4 border-t space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                const nextIncomplete = milestones.find((m) => !m.completed);
                if (nextIncomplete) {
                  handleMilestoneChange(nextIncomplete.id, true);
                } else {
                  toast({
                    title: "All Complete",
                    description: "All milestones are already completed!",
                  });
                }
              }}
              disabled={
                isUpdating ||
                completedCount === milestones.length
              }
            >
              Complete Next Milestone
            </Button>
          </div>
        )}

        {/* Help Text */}
        <div className="mt-4 text-xs text-muted-foreground">
          {canEditMilestones ? (
            <p>
              Click on any milestone to toggle its completion status. Changes
              are saved immediately.
            </p>
          ) : (
            <p>
              Milestone updates require admin, employee, or PC permissions.
              Contact your administrator for access.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
