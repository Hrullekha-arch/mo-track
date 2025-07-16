
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { User } from "@/lib/types";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface AssignCrmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (crmUserId: string) => void;
  crmUsers: User[];
  currentCrmUserId?: string;
}

export function AssignCrmDialog({ isOpen, onClose, onAssign, crmUsers, currentCrmUserId }: AssignCrmDialogProps) {
  const [selectedCrmUser, setSelectedCrmUser] = useState(currentCrmUserId || "");

  const handleSubmit = () => {
    if (selectedCrmUser) {
      onAssign(selectedCrmUser);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign CRM Handler</DialogTitle>
          <DialogDescription>Select a CRM team member to handle this order.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={selectedCrmUser} onValueChange={setSelectedCrmUser} className="space-y-2 py-4">
          {crmUsers.map((user) => (
            <div key={user.id} className="flex items-center space-x-2">
              <RadioGroupItem value={user.id} id={`crm-${user.id}`} />
              <Label htmlFor={`crm-${user.id}`}>{user.name}</Label>
            </div>
          ))}
        </RadioGroup>
        <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!selectedCrmUser}>Assign</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
