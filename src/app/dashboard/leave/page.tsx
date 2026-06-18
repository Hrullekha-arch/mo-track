"use client";

import { LeaveWidget } from "@/components/features/dashboard/LeaveWidget";

export default function LeavePage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leave</h1>
        <p className="text-sm text-muted-foreground">
          Check your balance and submit a leave request.
        </p>
      </div>
      <LeaveWidget />
    </div>
  );
}
