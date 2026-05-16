"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EnrichedDealVisit } from "@/types/visits";
import { User } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { runTransaction, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// You'll need to import the actual component from your codebase
// This is a placeholder - replace with your actual AssignInstallerDialog
import { AssignInstallerDialog as OriginalAssignInstallerDialog } from "@/components/features/order-management/AssignInstallerDialog";

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

  return (
    <OriginalAssignInstallerDialog
      isOpen={isOpen}
      onClose={onClose}
      installers={installers}
      currentInstallerId={visit.assignedTo}
      currentVisitId={visit.id}
      currentSlotSelection={currentSlotSelection}
      onAssign={async (installerId, slots) => {
        // Handle assignment logic here
        // This should be the same logic from your original file
        console.log("Assigning", { installerId, slots });
        onClose();
      }}
    />
  );
}