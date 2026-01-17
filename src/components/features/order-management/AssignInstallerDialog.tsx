"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";
import { Calendar, Loader2 } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const SLOT_OPTIONS = [
  { id: "S1", label: "S1 (10:00 - 12:00)", start: "10:00", end: "12:00" },
  { id: "S2", label: "S2 (12:00 - 14:00)", start: "12:00", end: "14:00" },
  { id: "S3", label: "S3 (14:00 - 16:00)", start: "14:00", end: "16:00" },
  { id: "S4", label: "S4 (16:00 - 18:00)", start: "16:00", end: "18:00" },
  { id: "S5", label: "S5 (18:00 - 20:00)", start: "18:00", end: "20:00" },
] as const;

export type SlotId = (typeof SLOT_OPTIONS)[number]["id"];

export type SlotSelection = {
  slotDate: string;
  slotId: SlotId;
  slotLabel: string;
  slotStart: string;
  slotEnd: string;
};

type InstallerSlotBooking = SlotSelection & {
  status?: "free" | "booked";
  visitId?: string;
  customerName?: string;
  dealId?: string;
  dealDocId?: string;
  dealName?: string;
  customerId?: string;
  assignedAt?: string;
};


interface AssignInstallerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (installerId: string, slot?: SlotSelection) => void;
  installers: User[];
  currentInstallerId?: string;
  currentVisitId?: string;
  currentSlotSelection?: Partial<SlotSelection>;
  enableSlotBooking?: boolean;
}

export function AssignInstallerDialog({
  isOpen,
  onClose,
  onAssign,
  installers,
  currentInstallerId,
  currentVisitId,
  currentSlotSelection,
  enableSlotBooking = true,
}: AssignInstallerDialogProps) {
  const [slotDate, setSlotDate] = React.useState(currentSlotSelection?.slotDate || "");
  const [slotId, setSlotId] = React.useState<SlotId | "">(
    (currentSlotSelection?.slotId as SlotId | undefined) || ""
  );
  const [installerId, setInstallerId] = React.useState(currentInstallerId || "");
  const [slotBookings, setSlotBookings] = React.useState<InstallerSlotBooking[]>([]);
  const [slotsLoading, setSlotsLoading] = React.useState(false);
  const [slotsError, setSlotsError] = React.useState<string | null>(null);
  const slotsEnabled = enableSlotBooking !== false;

  React.useEffect(() => {
    if (!isOpen) return;
    setInstallerId(currentInstallerId || "");
    setSlotDate(currentSlotSelection?.slotDate || "");
    setSlotId((currentSlotSelection?.slotId as SlotId | undefined) || "");
  }, [currentInstallerId, currentSlotSelection?.slotDate, currentSlotSelection?.slotId, isOpen]);

  React.useEffect(() => {
  if (!slotsEnabled) {
    setSlotBookings([]);
    setSlotsError(null);
    setSlotsLoading(false);
    return;
  }

  // ✅ IMPORTANT: do nothing when dialog closed
  if (!isOpen) return;

  if (!installerId || !slotDate) {
    setSlotBookings([]);
    setSlotsError(null);
    setSlotsLoading(false);
    return;
  }

  let active = true;

  const fetchSlots = async () => {
    setSlotsLoading(true);
    setSlotsError(null);

    try {
      const dateRef = doc(db, "installers", installerId, "dates", slotDate);
      const dateSnap = await getDoc(dateRef);
      if (!active) return;

      if (!dateSnap.exists()) {
        setSlotBookings([]);
        return;
      }

      const rawSlots = Array.isArray((dateSnap.data() as any)?.slots)
        ? (dateSnap.data() as any).slots
        : [];

      const normalized: InstallerSlotBooking[] = rawSlots
        .filter(Boolean)
        .map((slot: any) => {
          const sid = (slot.slotId || slot.id) as SlotId;
          const opt = SLOT_OPTIONS.find((s) => s.id === sid);

          return {
            slotId: sid,
            slotLabel: slot.slotLabel || opt?.label || sid,
            slotStart: slot.slotStart || opt?.start || "",
            slotEnd: slot.slotEnd || opt?.end || "",
            slotDate: slot.slotDate || slotDate,
            status: slot.status || (slot.visitId ? "booked" : "free"),
            visitId: slot.visitId,
            customerName: slot.customerName,
            dealId: slot.dealId,
            dealDocId: slot.dealDocId,
            dealName: slot.dealName,
            customerId: slot.customerId,
            assignedAt: slot.assignedAt,
          };
        })
        .filter((s) => !!s.slotId);

      setSlotBookings(normalized);
    } catch (err) {
      console.error("Failed to load installer slots", err);
      if (active) {
        setSlotsError("Could not fetch slots for this installer and date.");
        setSlotBookings([]);
      }
    } finally {
      if (active) setSlotsLoading(false);
    }
  };

  fetchSlots();

  return () => {
    active = false;
  };
}, [isOpen, installerId, slotDate, slotsEnabled]); // ✅ add isOpen here


    React.useEffect(() => {
      if (!isOpen) {
        setSlotBookings([]);
        setSlotsError(null);
        setSlotsLoading(false);
      }
    }, [isOpen]);


    const selectedSlotBooking = React.useMemo(
    () => (slotsEnabled ? slotBookings.find((s) => s.slotId === slotId) : undefined),
    [slotBookings, slotId, slotsEnabled]
  );

  const slotStatus = selectedSlotBooking?.status || (selectedSlotBooking?.visitId ? "booked" : "free");
  const slotBookedByAnotherVisit =
    slotsEnabled &&
    slotStatus === "booked" &&
    !!selectedSlotBooking?.visitId &&
    selectedSlotBooking.visitId !== currentVisitId;

  const canSubmit = slotsEnabled
    ? !!installerId && !!slotDate && !!slotId && !slotBookedByAnotherVisit
    : !!installerId;

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-2xl lg:max-w-4xl h-[95vh] sm:h-full overflow-auto rounded-lg mt-5 mb-5">
        <DialogHeader>
          <DialogTitle>{slotsEnabled ? "Assign Installer + Slot" : "Assign Installer"}</DialogTitle>
        </DialogHeader>
        {slotsEnabled && (
          <>
            <div className="space-y-2 sm:w-[20%] w-[45%]">
              <div className="text-sm font-medium ">Select Date</div>
              <Input
                type="date"
                value={slotDate}
                onChange={(e) => {
                  setSlotDate(e.target.value);
                  setSlotId("");
                }}
              />
            </div>

            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Select Slot</div>
                {slotsLoading && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking availability...
                  </div>
                )}
              </div>
              {!slotDate || !installerId ? (
                <div className="text-xs text-muted-foreground border rounded-md px-3 py-2">
                  Pick a date and installer to load slot availability.
                </div>
              ) : (
                <div className="grid sm:grid-cols-4 gap-2">
                  {SLOT_OPTIONS.map((slot) => {
                    const booking = slotBookings.find((b) => b.slotId === slot.id);
                    const status = booking?.status ?? (booking?.visitId ? "booked" : "free");
                    const isBookedBySelf = status === "booked" && booking?.visitId === currentVisitId;
                    const isBookedByAnother = status === "booked" && booking?.visitId && booking.visitId !== currentVisitId;
                    const isSelected = slotId === slot.id;
                    console.log("slot", slot.id, "booking", booking);

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={!!isBookedByAnother || slotsLoading}
                        onClick={() => setSlotId(slot.id)}
                        className={cn(
                          "w-full rounded-md border px-3 py-2 text-left transition",
                          isSelected && "border-primary ring-1 ring-primary",
                          isBookedByAnother && "opacity-60 cursor-not-allowed",
                          !isSelected && !isBookedByAnother && "hover:border-primary/60"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium">{slot.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {slot.start} - {slot.end}
                            </div>
                            {status === "booked" && booking ? (
                              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                <div className={cn("font-semibold", isBookedByAnother ? "text-destructive" : "")}>
                                  {isBookedByAnother ? "Booked" : "Reserved for this visit"}
                                </div>
                                {booking.customerName && (
                                  <div className="truncate">
                                    {booking.customerName} · Deal #{booking.dealId || booking.dealDocId}
                                  </div>
                                )}
                                {booking.dealName && <div className="truncate">{booking.dealName}</div>}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground mt-1">Available</div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {isBookedByAnother ? (
                              <Badge variant="destructive">Unavailable</Badge>
                            ) : status === "booked" ? (
                              <Badge variant={isSelected ? "default" : "outline"}>
                                {isBookedBySelf ? "Held" : "Booked"}
                              </Badge>
                            ) : (
                              <Badge variant={isSelected ? "default" : "outline"}>
                                {isSelected ? "Selected" : "Free"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {slotsError && <div className="text-xs text-destructive">{slotsError}</div>}
              {slotBookedByAnotherVisit && (
                <div className="text-xs text-destructive">
                  This slot is already booked for another visit. Pick a different slot.
                </div>
              )}
            </div>
          </>
        )}

        <div className="space-y-2 mt-4">
          <div className="text-sm font-medium">Select Installer</div>

          <div className="max-h-64 overflow-auto rounded-md border p-2 space-y-2">
            {installers.map((ins) => {
              return (
                <button
                  key={ins.id}
                  type="button"
                  onClick={() => {
                    setInstallerId(ins.id);
                    setSlotId("");
                  }}
                  className={cn(
                    "w-full flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
                    installerId === ins.id && "border-primary"
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{ins.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{ins.email}</div>
                  </div>

                  <div className="flex items-center gap-2">{installerId === ins.id && <Badge>Selected</Badge>}</div>
                </button>
              );
            })}
          </div>

          {slotsEnabled && (!slotDate || !installerId) ? (
            <div className="text-xs text-muted-foreground">Pick date + installer to view slots.</div>
          ) : null}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>

          <Button
            disabled={!canSubmit}
            onClick={() => {
              if (!slotsEnabled) {
                onAssign(installerId);
                return;
              }

              const picked = SLOT_OPTIONS.find((s) => s.id === slotId);
              if (!picked) return;

              onAssign(installerId, {
                slotDate,
                slotId: picked.id,
                slotLabel: picked.label,
                slotStart: picked.start,
                slotEnd: picked.end,
              });
            }}
          >
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
