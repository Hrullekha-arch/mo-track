
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { OrderType } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";

interface ScheduleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (date: Date) => void;
  orderType: OrderType;
}

const timeSlots = Array.from({ length: 12 }, (_, i) => {
    const hour = i + 8; // 8 AM to 7 PM
    return [`${hour}:00`, `${hour}:30`];
}).flat();

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            className="rounded-md border"
            disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1))}
          />
          <div className="grid grid-cols-3 gap-2 h-fit">
             {timeSlots.map((slot) => (
                <Button key={slot} variant={time === slot ? 'default' : 'outline'} onClick={() => setTime(slot)}>
                    {slot}
                </Button>
             ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!date || !time}>Schedule</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
