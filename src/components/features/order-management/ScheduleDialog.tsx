
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { OrderType } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ScheduleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (date: Date) => void;
  orderType: OrderType;
}

export function ScheduleDialog({ isOpen, onClose, onSchedule, orderType }: ScheduleDialogProps) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState<string>("09:00");

  const handleSubmit = () => {
    if (date && time) {
      const [hours, minutes] = time.split(':').map(Number);
      const combinedDateTime = new Date(date);
      combinedDateTime.setHours(hours, minutes, 0, 0);
      onSchedule(combinedDateTime);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule {orderType === 'stitching+installation' ? 'Installation' : 'Delivery'}</DialogTitle>
          <DialogDescription>Select a date and time to schedule.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 py-4">
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md border w-fit"
              disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1))}
            />
          </div>
          <div className="space-y-4 flex flex-col justify-center">
             <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="time">Time</Label>
                <Input
                    id="time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full"
                />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!date || !time}>Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
