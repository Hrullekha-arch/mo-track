"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { User, Weekday } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const formatTime = (totalMinutes: number) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const buildSlots = () => {
  const startMinutes = 10 * 60;
  const endMinutes = 20 * 60;
  const stepMinutes = 30;
  const slots: Array<{ id: string; label: string; start: string; end: string }> = [];

  let idx = 1;
  for (let m = startMinutes; m < endMinutes; m += stepMinutes) {
    const start = formatTime(m);
    const end = formatTime(m + stepMinutes);
    const id = `S${idx}`;
    slots.push({ id, label: `${id} (${start} - ${end})`, start, end });
    idx += 1;
  }

  return slots;
};

export const SLOT_OPTIONS = buildSlots();

const WEEKDAY_ORDER: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const WEEKDAY_LABELS: Record<Weekday, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

const getWeekdayFromSlotDate = (slotDate: string): Weekday | null => {
  const cleanDate = String(slotDate || "").trim();
  if (!cleanDate) return null;
  const localDate = new Date(`${cleanDate}T00:00:00`);
  if (Number.isNaN(localDate.getTime())) return null;
  return WEEKDAY_ORDER[localDate.getDay()] || null;
};

export type SlotId = string;

export type SlotSelection = {
  slotDate: string;
  slotId: SlotId;
  slotLabel: string;
  slotStart: string;
  slotEnd: string;
};

type InstallerSlotBooking = SlotSelection & {
  status: "free" | "booked";
  visitId?: string;
  customerName?: string;
  dealId?: string;
  dealDocId?: string;
  dealName?: string;
  customerId?: string;
  assignedAt?: string;
};

type CurrentSlotSelection = Partial<SlotSelection> & { slotIds?: SlotId[] };

interface AssignInstallerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (installerId: string, slots?: SlotSelection[]) => void;
  installers: User[];
  currentInstallerId?: string;
  currentVisitId?: string;
  currentSlotSelection?: CurrentSlotSelection;
  enableSlotBooking?: boolean;
}

const getInitialSlotIds = (slotSelection?: CurrentSlotSelection): SlotId[] => {
  if (!slotSelection) return [];
  if (Array.isArray(slotSelection.slotIds) && slotSelection.slotIds.length > 0) {
    return slotSelection.slotIds;
  }
  if (slotSelection.slotId) return [slotSelection.slotId];
  return [];
};

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
  const [selectedSlotIds, setSelectedSlotIds] = React.useState<SlotId[]>(
    getInitialSlotIds(currentSlotSelection)
  );
  const [installerId, setInstallerId] = React.useState(currentInstallerId || "");
  const [slotBookings, setSlotBookings] = React.useState<InstallerSlotBooking[]>([]);
  const [slotsLoading, setSlotsLoading] = React.useState(false);
  const [slotsError, setSlotsError] = React.useState<string | null>(null);

  const slotsEnabled = enableSlotBooking !== false;

  const toggleSlotSelection = (slotId: SlotId) => {
    setSelectedSlotIds((prev) =>
      prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId]
    );
  };

  React.useEffect(() => {
    if (!isOpen) return;
    setInstallerId(currentInstallerId || "");
    setSlotDate(currentSlotSelection?.slotDate || "");
    setSelectedSlotIds(getInitialSlotIds(currentSlotSelection));
  }, [currentInstallerId, currentSlotSelection, isOpen]);

  React.useEffect(() => {
    if (!slotsEnabled) {
      setSlotBookings([]);
      setSlotsError(null);
      setSlotsLoading(false);
      return;
    }

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
          .filter((s: InstallerSlotBooking) => !!s.slotId);

        setSlotBookings(normalized);
      } catch (error) {
        console.error("Failed to load installer slots", error);
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
  }, [installerId, isOpen, slotDate, slotsEnabled]);

  React.useEffect(() => {
    if (!isOpen) {
      setSlotBookings([]);
      setSlotsError(null);
      setSlotsLoading(false);
    }
  }, [isOpen]);

  const blockedSlotIds = React.useMemo(() => {
    if (!slotsEnabled) return new Set<string>();
    return new Set(
      slotBookings
        .filter((s) => s.status === "booked" && s.visitId && s.visitId !== currentVisitId)
        .map((s) => s.slotId)
    );
  }, [currentVisitId, slotBookings, slotsEnabled]);

  const selectedSlots = React.useMemo(
    () => SLOT_OPTIONS.filter((slot) => selectedSlotIds.includes(slot.id)),
    [selectedSlotIds]
  );

  const selectedSlotsSorted = React.useMemo(() => {
    const indices = new Map<string, number>();
    SLOT_OPTIONS.forEach((slot, idx) => indices.set(slot.id, idx));
    return [...selectedSlots].sort(
      (a, b) => (indices.get(a.id) ?? 0) - (indices.get(b.id) ?? 0)
    );
  }, [selectedSlots]);

  const selectedRangeLabel = React.useMemo(() => {
    if (selectedSlotsSorted.length === 0) return "";
    const first = selectedSlotsSorted[0];
    const last = selectedSlotsSorted[selectedSlotsSorted.length - 1];
    return `${first.start} - ${last.end}`;
  }, [selectedSlotsSorted]);

  const isSelectionContiguous = React.useMemo(() => {
    if (selectedSlotsSorted.length <= 1) return true;
    const indices = selectedSlotsSorted.map((slot) =>
      SLOT_OPTIONS.findIndex((s) => s.id === slot.id)
    );
    for (let i = 1; i < indices.length; i += 1) {
      if (indices[i] !== indices[i - 1] + 1) return false;
    }
    return true;
  }, [selectedSlotsSorted]);

  const hasBlockedSelected = selectedSlotIds.some((id) => blockedSlotIds.has(id));
  const selectedWeekday = React.useMemo(
    () => (slotsEnabled ? getWeekdayFromSlotDate(slotDate) : null),
    [slotDate, slotsEnabled]
  );
  const selectedInstaller = React.useMemo(
    () => installers.find((installer) => installer.id === installerId),
    [installerId, installers]
  );
  const selectedInstallerIsDayOff =
    !!slotsEnabled &&
    !!selectedWeekday &&
    !!selectedInstaller?.dayOff &&
    selectedInstaller.dayOff === selectedWeekday;

  const canSubmit = slotsEnabled
    ? !!installerId &&
      !!slotDate &&
      selectedSlotIds.length > 0 &&
      !hasBlockedSelected &&
      isSelectionContiguous &&
      !selectedInstallerIsDayOff
    : !!installerId;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-2xl lg:max-w-4xl h-[95vh] sm:h-full overflow-auto rounded-lg mt-5 mb-5">
        <DialogHeader>
          <DialogTitle>{slotsEnabled ? "Assign Installer + Slots" : "Assign Installer"}</DialogTitle>
        </DialogHeader>

        {slotsEnabled && (
          <>
            <div className="space-y-2 sm:w-[20%] w-[45%]">
              <div className="text-sm font-medium">Select Date</div>
              <Input
                type="date"
                value={slotDate}
                onChange={(e) => {
                  setSlotDate(e.target.value);
                  setSelectedSlotIds([]);
                }}
              />
            </div>

            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Select Slots</div>
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
                    const status = booking?.status || (booking?.visitId ? "booked" : "free");
                    const isBookedBySelf =
                      status === "booked" && booking?.visitId === currentVisitId;
                    const isBookedByAnother =
                      status === "booked" &&
                      !!booking?.visitId &&
                      booking.visitId !== currentVisitId;
                    const isSelected = selectedSlotIds.includes(slot.id);

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={isBookedByAnother || slotsLoading}
                        onClick={() => toggleSlotSelection(slot.id)}
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
                                <div className={cn("font-semibold", isBookedByAnother && "text-destructive")}>
                                  {isBookedByAnother ? "Booked" : "Reserved for this visit"}
                                </div>
                                {booking.customerName && (
                                  <div className="truncate">
                                    {booking.customerName} | Deal #{booking.dealId || booking.dealDocId}
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
              {selectedRangeLabel && (
                <div className="text-xs text-muted-foreground">
                  Selected range:{" "}
                  <span className="font-medium text-foreground">{selectedRangeLabel}</span>{" "}
                  {selectedSlotIds.length > 1 && (
                    <span className="text-muted-foreground">({selectedSlotIds.length} slots)</span>
                  )}
                </div>
              )}
              {!isSelectionContiguous && selectedSlotIds.length > 1 && (
                <div className="text-xs text-destructive">
                  Select consecutive slots to create a combined time range.
                </div>
              )}
            </div>
          </>
        )}

        <div className="space-y-2 mt-4">
          <div className="text-sm font-medium">Select Installer</div>
          <div className="max-h-64 overflow-auto rounded-md border p-2 space-y-2">
            {installers.map((installer) => {
              const isDayOffForDate =
                !!slotsEnabled &&
                !!selectedWeekday &&
                !!installer.dayOff &&
                installer.dayOff === selectedWeekday;

              return (
                <button
                  key={installer.id}
                  type="button"
                  onClick={() => {
                    if (isDayOffForDate) return;
                    setInstallerId(installer.id);
                    if (slotsEnabled) setSelectedSlotIds([]);
                  }}
                  disabled={isDayOffForDate}
                  className={cn(
                    "w-full flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
                    installerId === installer.id && "border-primary",
                    isDayOffForDate && "opacity-60 cursor-not-allowed bg-muted/40"
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{installer.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{installer.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isDayOffForDate && (
                      <Badge variant="outline" className="text-destructive border-destructive/30">
                        Day Off
                      </Badge>
                    )}
                    {installerId === installer.id && <Badge>Selected</Badge>}
                  </div>
                </button>
              );
            })}
          </div>

          {slotsEnabled && (!slotDate || !installerId) ? (
            <div className="text-xs text-muted-foreground">Pick date + installer to view slots.</div>
          ) : null}
          {selectedInstallerIsDayOff && selectedWeekday ? (
            <div className="text-xs text-destructive">
              {selectedInstaller?.name || "Selected installer"} is off on {WEEKDAY_LABELS[selectedWeekday]}.
            </div>
          ) : null}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              if (!installerId) return;

              if (!slotsEnabled) {
                onAssign(installerId);
                return;
              }

              if (!slotDate || selectedSlotsSorted.length === 0) return;

              const selections: SlotSelection[] = selectedSlotsSorted.map((slot) => ({
                slotDate,
                slotId: slot.id,
                slotLabel: slot.label,
                slotStart: slot.start,
                slotEnd: slot.end,
              }));

              onAssign(installerId, selections);
            }}
          >
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
