/**
 * OrderGateProgress — compact visual stepper for the 4 payment/production gates
 * each order must pass before delivery can be created.
 *
 * Gates (in order):
 *  1. 50% Advance Received
 *  2. PMS Production Complete  (all jobs done → balanceFollowUp set)
 *  3. Full Payment Confirmed   (paymentConfirmed or creditApproved)
 *  4. Delivery Available
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Gate = {
  label: string;
  short: string;
  done: boolean;
  active: boolean;
};

type Props = {
  advanceReceived: boolean;
  productReady: boolean;
  paymentDone: boolean;
};

export function OrderGateProgress({ advanceReceived, productReady, paymentDone }: Props) {
  const gates: Gate[] = [
    {
      label: "20% Minimum Amount Received",
      short: "20%",
      done: advanceReceived,
      active: !advanceReceived,
    },
    {
      label: "PMS Production Complete",
      short: "PMS",
      done: productReady,
      active: advanceReceived && !productReady,
    },
    {
      label: "Full Payment Confirmed",
      short: "Pay",
      done: paymentDone,
      active: productReady && !paymentDone,
    },
    {
      label: "Delivery Available",
      short: "Del",
      done: paymentDone,
      active: false,
    },
  ];

  return (
    <div className="flex items-center gap-0.5">
      {gates.map((gate, index) => {
        const nodeClass = gate.done
          ? "bg-green-500 border-green-600 text-white"
          : gate.active
          ? "bg-amber-400 border-amber-500 text-white animate-pulse"
          : "bg-muted border-muted-foreground/30 text-muted-foreground";

        const lineClass =
          index < gates.length - 1
            ? gate.done
              ? "bg-green-400"
              : "bg-muted-foreground/20"
            : "";

        return (
          <div key={gate.label} className="flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold cursor-default select-none",
                    nodeClass
                  )}
                >
                  {gate.done ? <Check className="h-2.5 w-2.5" /> : gate.short[0]}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <span className={gate.done ? "text-green-600 font-medium" : gate.active ? "text-amber-600 font-medium" : ""}>
                  {gate.done ? "✓ " : gate.active ? "⏳ " : "○ "}
                  {gate.label}
                </span>
              </TooltipContent>
            </Tooltip>
            {index < gates.length - 1 && (
              <div className={cn("h-[2px] w-3 flex-shrink-0", lineClass)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Larger version for dialogs / detail views — shows full gate labels.
 */
export function OrderGateProgressFull({ advanceReceived, productReady, paymentDone }: Props) {
  const gates = [
    {
      label: "20% Minimum Amount Received",
      description: "At least 20% of the order amount must be received before PMS production starts",
      done: advanceReceived,
      active: !advanceReceived,
    },
    {
      label: "PMS Production Complete",
      description: "Product manufactured — CRM notified to call customer for full payment",
      done: productReady,
      active: advanceReceived && !productReady,
    },
    {
      label: "Full Payment Confirmed",
      description: "Accounts confirms full payment received (or MD approves credit)",
      done: paymentDone,
      active: productReady && !paymentDone,
    },
    {
      label: "Delivery Available",
      description: "Visit creation for delivery/installation is now unlocked",
      done: paymentDone,
      active: false,
    },
  ];

  return (
    <div className="space-y-2">
      {gates.map((gate, index) => (
        <div key={gate.label} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                gate.done
                  ? "border-green-500 bg-green-500 text-white"
                  : gate.active
                  ? "border-amber-400 bg-amber-50 text-amber-600 animate-pulse"
                  : "border-muted-foreground/30 bg-muted text-muted-foreground"
              )}
            >
              {gate.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </div>
            {index < gates.length - 1 && (
              <div className={cn("mt-1 h-5 w-[2px]", gate.done ? "bg-green-400" : "bg-muted-foreground/20")} />
            )}
          </div>

          <div className="pb-2">
            <div
              className={cn(
                "text-sm font-medium",
                gate.done ? "text-green-700" : gate.active ? "text-amber-600" : "text-muted-foreground"
              )}
            >
              {gate.done ? "✓ " : gate.active ? "⏳ " : ""}
              {gate.label}
            </div>
            <div className="text-xs text-muted-foreground">{gate.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
