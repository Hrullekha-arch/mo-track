
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Order, OrderType } from "@/lib/types";

interface ConfirmOrderTypeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  onConfirm: (order: Order, newOrderType: OrderType) => void;
}

export function ConfirmOrderTypeDialog({ isOpen, onClose, order, onConfirm }: ConfirmOrderTypeDialogProps) {
  const [selectedOrderType, setSelectedOrderType] = useState<OrderType>(order.orderType);

  const handleConfirm = () => {
    onConfirm(order, selectedOrderType);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Order Type</DialogTitle>
          <DialogDescription>
            Please confirm or update the order type for "{order.customerName}" before moving it to the main dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <Label htmlFor="order-type-confirm">Order Type</Label>
          <Select value={selectedOrderType} onValueChange={(value: OrderType) => setSelectedOrderType(value)}>
            <SelectTrigger id="order-type-confirm">
              <SelectValue placeholder="Select an order type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="delivery">Delivery</SelectItem>
              <SelectItem value="stitching">Stitching</SelectItem>
              <SelectItem value="stitching+installation">Stitching + Installation</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm}>Confirm & Move</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
