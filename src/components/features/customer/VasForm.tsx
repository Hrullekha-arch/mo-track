
"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Toast } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { roomOptions } from "@/lib/constants";
import { cn } from "@/lib/utils";


export function VasForm({ onSaveVas, form }) {
  const {control} = form;

  const StitchingOptions = [
    { id: 1, name: "French Pleat" },
    { id: 2, name: "Goblet" },
    { id: 3, name: "Eyelet" },
    { id: 4, name: "Roman Blind Pleat" },
    { id: 5, name: "Valance" },
    { id: 6, name: "Belt" },
    { id: 7, name: "Other Stitching" },
  ];

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("main"); // "main", "stitching"
  const [selectedItem, setSelectedItem] = useState(null);
  const [dialogTitle, setDialogTitle] = useState("");
  const [rate, setRate] = useState("");
  const [vasType, setVasType] = useState("");
  const [quantity, setQuantity] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [uploadImageAllowed, setUploadImageAllowed] = useState(false);
  const [vasItem, setVasItem] = useState("");

  const resetItemFields = () => {
    setRate("");
    setQuantity("");
    setSelectedItem(null);
    setVasItem("");
    setImage(null);
  };

  const handleCategoryClick = (category) => {
    if (category === "Stitching Details") {
      setDialogTitle("Stitching Details");
      setUploadImageAllowed(true);
      setStep("stitching");
      setOpen(true);
    }
  };

  const detailSteps = new Set(["stitchingitem"]);
  const stepStage = detailSteps.has(step) ? 3 : step === "stitchingsubitem" ? 2 : 1;
  const stepLabels = ["Category", "Type", "Details"];
  const stepTrail = [dialogTitle, selectedItem, vasItem].filter(Boolean);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFinalSave = () => {
    const payload = {
      productType: "VAS",
      productCategory: "Stitching",
      VasType:vasType,
      subCategory: vasItem,
      rate: rate || "",
      quantity: quantity || "",
      unit: "PCS",
      image,
      timestamp: Date.now(),
    };

    if (typeof onSaveVas !== "function") {
        console.error("❌ onSaveVas not passed to VasForm!");
        return;
    }

    onSaveVas(payload);
    resetItemFields();
    setOpen(false);
  };

  return (
    <>
      <div className="">
        <div className=" rounded-xl flex flex-col gap-3">
            <Button
              variant="outline"
              type="button"
              className=""
              onClick={() => handleCategoryClick("Stitching Details")}
            >
              Stitching Details
            </Button>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setStep("main");
            setSelectedItem(null);
            setDialogTitle("");
            setUploadImageAllowed(false);
            resetItemFields();
          }
        }}
      >
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          {dialogTitle ? (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Step {stepStage} of 3</span>
                <span>{dialogTitle}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {stepLabels.map((label, index) => {
                  const stageIndex = index + 1;
                  return (
                    <span
                      key={label}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        stepStage >= stageIndex
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {stageIndex}. {label}
                    </span>
                  );
                })}
              </div>
              {stepTrail.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Path: {stepTrail.join(" / ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "stitching" && (
            <div className="grid gap-3 py-4">
              {StitchingOptions.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                    setSelectedItem(opt.name);
                    setVasItem(opt.name);
                    setStep("stitchingsubitem");
                    setDialogTitle(`${opt.name} Details`);
                  }}
                >
                  {opt.name}
                </Button>
              ))}
            </div>
          )}

          {step === "stitchingsubitem" && (
            <div className="grid gap-3 py-4">
              {[{ id: 1, name: "Normal Pleat" },
                { id: 2, name: "Designs Pleat" },].map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  className="w-full py-4 rounded-xl"
                  onClick={() => {
                    setVasItem(prev => `${selectedItem} → ${opt.name}`);
                    setStep("stitchingitem");
                    setDialogTitle(`${opt.name} Details`);
                  }}
                >
                  {opt.name}
                </Button>
              ))}
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setStep("stitching");
                  setDialogTitle("Stitching Details");
                }}
              >
                ← Back
              </Button>
            </div>
          )}

          {step === "stitchingitem" && (
            <div className="grid gap-4 py-4">
              <div>
                <Label>Stitching Type / Design</Label>
                <Input
                onChange={(e) => setVasType(e.target.value)}
                 placeholder="Enter specific design if any" />
              </div>
              <div>
                <Label>MRP /pcs</Label>
                <div className="flex gap-2 justify-center item-center text-green-500">
                  <span>₹</span>
                  <Input
                    placeholder="Enter rate/panel"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Qty</Label>
                <Input
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              {uploadImageAllowed && (
                <div>
                  <Label>Upload Image</Label>
                  <Input 
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                  {image && (
                    <img
                      src={image}
                      className="mt-2 h-20 w-20 object-cover rounded-md border"
                    />
                  )}
                </div>
              )}
              <div className="flex justify-between mt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep("stitchingsubitem")}
                >
                  ← Back
                </Button>
                <Button onClick={handleFinalSave}>Save</Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
