"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type FlooringDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFlooring: (type: string) => void;
};

export default function FlooringDialog({
  open,
  onOpenChange,
  onSelectFlooring,
}: FlooringDialogProps) {
  const [step, setStep] = useState("main");

  const handleSelect = (type: string) => {
    onSelectFlooring(type);
    setStep("main"); // Reset for next time
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setStep("main");
      }}
    >
      <DialogContent className="max-w-[350px]">
        <DialogHeader>
          <DialogTitle>Flooring Options</DialogTitle>
        </DialogHeader>

        {step === "main" && (
          <div className="grid gap-3 py-4">
            <Button variant="outline" onClick={() => handleSelect("Wooden Flooring")}>
              Wooden Flooring
            </Button>

            <Button variant="outline" onClick={() => setStep("carpet")}>
              Carpet Flooring
            </Button>
          </div>
        )}

        {step === "carpet" && (
          <div className="grid gap-3 py-4">
            <Button variant="outline" onClick={() => handleSelect("Normal Carpet")}>
              Normal Carpet flooring
            </Button>

            <Button variant="outline" onClick={() => handleSelect("Carpet Tile")}>
              Carpet Tile flooring
            </Button>

            <Button variant="outline" className="mt-2" onClick={() => setStep("main")}>
              ← Back
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}