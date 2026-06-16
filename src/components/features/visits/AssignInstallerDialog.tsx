"use client";

import * as React from "react";
import { EnrichedDealVisit } from "@/types/visits";
import { User } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { assignVisitAction } from "@/app/dashboard/visits/actions";
import { useAuth } from "@/context/AuthContext";
import { canAssignInstallerSlots } from "@/lib/visit-assignment-access";

import {
  AssignInstallerDialog as OriginalAssignInstallerDialog,
  type SlotSelection,
} from "@/components/features/order-management/AssignInstallerDialog";

interface AssignInstallerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  visit: EnrichedDealVisit | null;
  installers: User[];
}

// This is a wrapper that adapts the original component
export default function AssignInstallerDialog({
  isOpen,
  onClose,
  visit,
  installers,
}: AssignInstallerDialogProps) {
  const { toast } = useToast();
  const { user, firebaseUser } = useAuth();
  const isSavingRef = React.useRef(false);

  if (!visit) return null;

  const currentSlotSelection = visit
    ? {
        slotDate: visit.slotDate,
        slotId: visit.slotId || undefined,
        slotIds: visit.slotIds?.length
          ? visit.slotIds
          : visit.slotId
            ? [visit.slotId]
            : undefined,
        slotLabel: visit.slotLabel,
        slotStart: visit.slotStart,
        slotEnd: visit.slotEnd,
      }
    : undefined;

  const currentInstallerId = String((visit as any).assignedTo || "").trim();
  const normalizedCurrentInstallerId =
    currentInstallerId.toLowerCase() === "unassigned" ? "" : currentInstallerId;

  const handleAssign = async (installerId: string, slots?: SlotSelection[]) => {
    if (isSavingRef.current) return;
    if (!canAssignInstallerSlots(user)) {
      toast({
        variant: "destructive",
        title: "Access denied",
        description: "Your role cannot assign installers and slots.",
      });
      return;
    }
    if (!firebaseUser) {
      toast({
        variant: "destructive",
        title: "Session expired",
        description: "Please sign in again.",
      });
      return;
    }
    if (!installerId) {
      toast({ variant: "destructive", title: "Installer required", description: "Please select an installer." });
      return;
    }
    if (!slots || slots.length === 0) {
      toast({ variant: "destructive", title: "Slot required", description: "Please select at least one slot." });
      return;
    }

    isSavingRef.current = true;
    try {
      const idToken = await firebaseUser.getIdToken();
      const result = await assignVisitAction({
        idToken,
        visitId: visit.id,
        customerId: visit.customerId,
        dealDocId: visit.dealDocId,
        installerId,
        slots: slots.map((slot) => ({
          slotDate: slot.slotDate,
          slotId: slot.slotId,
          slotLabel: slot.slotLabel,
          slotStart: slot.slotStart,
          slotEnd: slot.slotEnd,
        })),
      });

      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Assignment failed",
          description: result.message || "Could not assign installer.",
        });
        return;
      }

      toast({ title: "Visit assigned", description: result.message || "Assigned to installer successfully." });
      onClose();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Assignment failed",
        description: error?.message || "Could not assign installer.",
      });
    } finally {
      isSavingRef.current = false;
    }
  };

  return (
    <OriginalAssignInstallerDialog
      isOpen={isOpen}
      onClose={onClose}
      installers={installers}
      currentInstallerId={normalizedCurrentInstallerId || undefined}
      currentVisitId={visit.id}
      currentSlotSelection={currentSlotSelection}
      onAssign={handleAssign}
    />
  );
}
