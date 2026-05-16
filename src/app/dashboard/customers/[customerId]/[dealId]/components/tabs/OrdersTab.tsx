"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShoppingCart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DealOrder } from "@/lib/types";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { format } from "date-fns";
import { parseDate } from "../../utils/dateUtils";

interface OrdersTabProps {
  customerId: string;
  dealId: string;
}

export default function OrdersTab({ customerId, dealId }: OrdersTabProps) {
  const [orders, setOrders] = useState<DealOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    const q = collection(
      db,
      "customers",
      customerId,
      "deals",
      dealId,
      "orders"
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const ordersData = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as DealOrder)
        );
        setOrders(
          ordersData.sort(
            (a, b) =>
              new Date(b.orderDate).getTime() -
              new Date(a.orderDate).getTime()
          )
        );
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching orders:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not load orders.",
        });
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [customerId, dealId, toast]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Orders Details</CardTitle>
      </CardHeader>
      <CardContent>
        {orders.length > 0 ? (
          <div className="space-y-3">
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Order No</TableHead>
                    <TableHead>Remark</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order, i) => (
                    <TableRow key={order.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        {order.orderNo}
                      </TableCell>
                      <TableCell>{order.remark || "-"}</TableCell>
                      <TableCell>
                        {format(parseDate(order.orderDate), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{order.status}</Badge>
                      </TableCell>
                      <TableCell>{order.createdBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {orders.map((order, i) => (
                <Card key={order.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">
                          {order.orderNo}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseDate(order.orderDate), "dd/MM/yyyy")}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {order.status}
                      </Badge>
                    </div>
                    <Separator />
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Remark:</span>
                        <span>{order.remark || "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Created By:
                        </span>
                        <span>{order.createdBy}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <ShoppingCart className="mx-auto h-12 w-12 mb-2 opacity-50" />
            <p>No orders have been generated for this deal yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}