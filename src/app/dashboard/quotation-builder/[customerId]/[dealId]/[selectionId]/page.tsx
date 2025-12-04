"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

// YOU WILL ADD THESE BACKEND FUNCTIONS IN actions.ts
import { getSelectionById, inventoryLookupAction, createQuotationAction } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";

type EnrichedProduct = {
  id: string;
  room: string;
  itemName: string;
  bcn: string;
  qty: number;
  mrp: number;
  amount: number;
};

export default function QuotationBuilderPage() {
  const router = useRouter();
  const { customerId, dealId, selectionId } = useParams();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EnrichedProduct[]>([]);
  const [groupedRooms, setGroupedRooms] = useState<any>({});
  const [discount, setDiscount] = useState(0);

  // ----------------------------
  // 1️⃣ LOAD SELECTION + MRPs
  // ----------------------------
  const loadData = async () => {
    try {
      setLoading(true);

      const selection = await getSelectionById(customerId as string, dealId as string, selectionId as string);

      // Extract BCNs
      const bcnList = selection.products.map((p: any) => p.collectionBrand);

      // Fetch MRPs
      const mrpMap = await inventoryLookupAction({ bcnList });

      // Merge selection + MRP
      const enriched: EnrichedProduct[] = selection.products.map((p: any) => {
        const mrp = mrpMap[p.collectionBrand]?.mrp || 0;

        return {
          id: p.id,
          room: p.room,
          itemName: p.salesDescription ?? "",
          bcn: p.collectionBrand,
          qty: Number(p.noOfPcs || 1),
          mrp,
          amount: mrp * Number(p.noOfPcs || 1),
        };
      });

      setItems(enriched);

      // Group by room
      const grouped = enriched.reduce((acc: any, item: EnrichedProduct) => {
        if (!acc[item.room]) acc[item.room] = [];
        acc[item.room].push(item);
        return acc;
      }, {});

      setGroupedRooms(grouped);

      setLoading(false);
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message
      });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ----------------------------
  // 2️⃣ HANDLE QTY CHANGE
  // ----------------------------
  const updateQty = (room: string, id: string, qty: number) => {
    const updated = items.map(i => {
      if (i.id === id) {
        return { ...i, qty, amount: qty * i.mrp };
      }
      return i;
    });

    setItems(updated);

    // regroup
    const grouped = updated.reduce((acc: any, item) => {
      if (!acc[item.room]) acc[item.room] = [];
      acc[item.room].push(item);
      return acc;
    }, {});

    setGroupedRooms(grouped);
  };

  // ----------------------------
  // 3️⃣ SUMMARY CALCULATIONS
  // ----------------------------
  const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
  const discountAmount = subtotal * (discount / 100);
  const taxable = subtotal - discountAmount;
  const gst = taxable * 0.18;
  const grandTotal = taxable + gst;

  // ----------------------------
  // 4️⃣ SUBMIT / CREATE QUOTATION
  // ----------------------------
  const saveQuotation = async () => {
    try {
      const payload = {
        customerId,
        dealId,
        selectionId,
        items,
        discount,
        subtotal,
        discountAmount,
        taxable,
        gst,
        grandTotal,
        groupedRooms
      };

      const res = await createQuotationAction(payload);

      if (res.success) {
        toast({ title: "Quotation Created Successfully" });
        router.push(`/dashboard/customers/${customerId}/${dealId}`);
      } else {
        toast({ variant: "destructive", title: "Error", description: res.error });
      }

    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message
      });
    }
  };

  if (loading) return <p className="p-6">Loading...</p>;

  // ----------------------------
  // 5️⃣ PAGE UI
  // ----------------------------
  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <Card>
        <CardHeader>
          <CardTitle>Quotation Builder — Selection #{selectionId}</CardTitle>
        </CardHeader>
      </Card>

      {/* MAIN CONTENT */}
      <div className="grid grid-cols-4 gap-6">
        {/* LEFT SIDE — ROOMS */}
        <div className="col-span-3 space-y-6">
          {Object.keys(groupedRooms).map(room => {
            const roomItems = groupedRooms[room];
            const roomQty = roomItems.reduce((s: number, i: EnrichedProduct) => s + i.qty, 0);
            const roomTotal = roomItems.reduce((s: number, i: EnrichedProduct) => s + i.amount, 0);

            return (
              <Card key={room}>
                <CardHeader>
                  <CardTitle className="capitalize">{room}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>BCN</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>MRP</TableHead>
                        <TableHead>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roomItems.map((i: EnrichedProduct) => (
                        <TableRow key={i.id}>
                          <TableCell>{i.itemName}</TableCell>
                          <TableCell>{i.bcn}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={i.qty}
                              className="w-20"
                              onChange={(e) => updateQty(room, i.id, Number(e.target.value))}
                            />
                          </TableCell>
                          <TableCell>₹ {i.mrp}</TableCell>
                          <TableCell>₹ {i.amount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="text-right font-semibold mt-2">
                    Total Qty: {roomQty} | Total Amount: ₹ {roomTotal}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* RIGHT SIDE — SUMMARY */}
        <div className="col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>Subtotal: ₹ {subtotal}</p>

              <div>
                <p>Discount %</p>
                <Input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                />
              </div>

              <Separator />

              <p>After Discount: ₹ {taxable}</p>
              <p>GST (18%): ₹ {gst.toFixed(2)}</p>

              <Separator />

              <p className="font-bold text-lg">Grand Total: ₹ {grandTotal.toFixed(2)}</p>

              <Button className="w-full" onClick={saveQuotation}>
                Save Quotation
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
