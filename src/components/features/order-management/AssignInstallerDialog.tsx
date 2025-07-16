
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { User } from "@/lib/types";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface AssignInstallerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (installerId: string) => void;
  installers: User[];
  currentInstallerId?: string;
}

export function AssignInstallerDialog({ isOpen, onClose, onAssign, installers, currentInstallerId }: AssignInstallerDialogProps) {
  const [selectedInstaller, setSelectedInstaller] = useState(currentInstallerId || "");

  const handleSubmit = () => {
    if (selectedInstaller) {
      onAssign(selectedInstaller);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Installer</DialogTitle>
          <DialogDescription>Select an installer to assign to this order.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={selectedInstaller} onValueChange={setSelectedInstaller} className="space-y-2 py-4">
          {installers.map((installer) => (
            <div key={installer.id} className="flex items-center space-x-2">
              <RadioGroupItem value={installer.id} id={installer.id} />
              <Label htmlFor={installer.id}>{installer.name}</Label>
            </div>
          ))}
        </RadioGroup>
        <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!selectedInstaller}>Assign</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
