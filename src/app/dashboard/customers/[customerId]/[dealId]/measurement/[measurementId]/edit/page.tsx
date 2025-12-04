"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  getSelectionById,
  inventoryLookupAction,
  createQuotationAction,
  getMeasurementById,
} from "@/app/dashboard/customers/[customerId]/[dealId]/actions";

import { Pencil } from "lucide-react";

type EnrichedProduct = {
  id: string;
  room: string;
  itemName: string;
  bcn: string;
  shadeNo: string;     // ⭐ new
  isBlind: boolean;    // ⭐ new
  qty: number;
  mrp: number;
  amount: number;
  status?: "missing" | "complete";
};

export default function QuotationBuilderPage() {
  const router = useRouter();
  const { customerId, dealId, measurementId } = useParams();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EnrichedProduct[]>([]);
  const [groupedRooms, setGroupedRooms] = useState<any>({});
  const [discount, setDiscount] = useState(0);

  const loadData = async () => {
    try {
      setLoading(true);

      const cid = String(customerId);
      const did = String(dealId);
      const mid = String(measurementId);

      const measurement = await getMeasurementById(cid, did, mid);
      if (!measurement) throw new Error("Measurement not found");

      const selectionId = measurement.selectionId;
      if (!selectionId) throw new Error("Selection missing");

      const selection = await getSelectionById(cid, did, String(selectionId));
      if (!selection?.products) throw new Error("No products inside selection");

      const bcnList = selection.products
        .map((p: any) => p.collectionBrand)
        .filter((b: any) => b && b.trim());

      const mrpMap = await inventoryLookupAction({ bcnList });

            const enriched = selection.products.map((p: any) => {
              const cleanBCN = String(p.collectionBrand || "").trim();
              const mrp = mrpMap[cleanBCN]?.mrp || 0;

              // 1️⃣ Detect Blind
              const isBlind = Boolean(
                p.isBlind ||
                p.blindType ||
                p.shadeNo ||
                p.noOfBlind ||
                (p.group && p.group.toLowerCase().includes("blind"))
              );

              // 2️⃣ Item Name
              let itemName = "-";
              if (isBlind) {
                itemName = p.blindType || "Blind";
              } else if (p.salesDescription && p.salesDescription.trim() !== "") {
                itemName = p.salesDescription.trim();
              }

              // 3️⃣ Shade No for blinds
              const shadeNo = isBlind ? String(p.shadeNo || "-") : "-";

              // 4️⃣ Qty logic for blinds
              const qty = isBlind
                ? Number(p.noOfBlind || p.quantity || 1)
                : Number(p.quantity || 1);

              return {
                id: p.id,
                room: p.room || "",
                itemName,
                bcn: cleanBCN || "-",
                isBlind,
                shadeNo,
                qty,
                mrp,
                amount: qty * mrp,
                status:
                  isBlind
                    ? (itemName !== "-" && shadeNo !== "-" ? "complete" : "missing")
                    : (itemName !== "-" && cleanBCN && qty && mrp ? "complete" : "missing"),
              };
            });



      setItems(enriched);

      const grouped = enriched.reduce((acc: any, item) => {
        if (!acc[item.room]) acc[item.room] = [];
        acc[item.room].push(item);
        return acc;
      }, {});

      setGroupedRooms(grouped);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateField = (id: string, key: keyof EnrichedProduct, value: any) => {
    const updated = items.map((i) => {
      if (i.id === id) {
        const obj = { ...i, [key]: value };
        obj.amount = obj.qty * obj.mrp;
        obj.status =
          obj.bcn && obj.itemName && obj.qty && obj.mrp
            ? "complete"
            : "missing";
        return obj;
      }
      return i;
    });

    setItems(updated);

    const grouped = updated.reduce((acc: any, item) => {
      if (!acc[item.room]) acc[item.room] = [];
      acc[item.room].push(item);
      return acc;
    }, {});
    setGroupedRooms(grouped);
  };

  const openEdit = (item: EnrichedProduct) => {
    console.log("Open edit modal:", item);
  };

  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const discountAmount = subtotal * (discount / 100);
  const taxable = subtotal - discountAmount;
  const gst = taxable * 0.18;
  const grandTotal = taxable + gst;

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <div className="p-6">

      {/* TOP HEADER BAR */}
      <div className="border border-gray-400 rounded-xl p-4 mb-6 flex justify-between text-lg font-semibold">
        <span>Customer Name</span>
        <span>Mobile Number</span>
        <span>Deal Id</span>
      </div>

      <div className="grid grid-cols-4 gap-6">

        {/* LEFT SIDE ROOM CARDS */}
{/* LEFT SIDE — ROOMS */}
<div className="col-span-3 space-y-10">
  {Object.keys(groupedRooms).map((room) => {
    const roomItems = groupedRooms[room];

    // SPLIT FABRIC & BLINDS
    const fabricItems = roomItems.filter((i: EnrichedProduct) => !i.isBlind);
    const blindItems = roomItems.filter((i: EnrichedProduct) => i.isBlind);

    const fabricTotal = fabricItems.reduce((s, i) => s + i.amount, 0);
    const blindTotal = blindItems.reduce((s, i) => s + i.amount, 0);

    const roomTotal = fabricTotal + blindTotal;

    return (
      <Card key={room} className="border-2 border-slate-400">
        <CardHeader>
          <div className="font-semibold text-xl mb-3">Room Name</div>
          <Input value={room} className="w-60 border-2" />
        </CardHeader>

        <CardContent className="space-y-10">

          {/* FABRIC TABLE */}
          <div>
            <div className="font-semibold text-lg mb-2">Fabric Items</div>
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-500">
                  <TableHead>BCN / Item Name</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {fabricItems.map((i: EnrichedProduct) => (
                  <TableRow key={i.id}>
                    {/* BCN / Item Name */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{i.itemName || "-"}</span>
                        <span className="text-xs text-gray-500">{i.bcn || "-"}</span>
                      </div>
                    </TableCell>

                    {/* QTY */}
                    <TableCell>
                      <Input
                        type="number"
                        value={i.qty}
                        onChange={(e) =>
                          updateField(i.id, "qty", Number(e.target.value))
                        }
                        className="w-20"
                      />
                    </TableCell>

                    {/* RATE */}
                    <TableCell>
                      <Input
                        type="number"
                        value={i.mrp}
                        onChange={(e) =>
                          updateField(i.id, "mrp", Number(e.target.value))
                        }
                        className="w-24"
                      />
                    </TableCell>

                    {/* AMOUNT */}
                    <TableCell className="font-semibold">{i.amount}</TableCell>

                    {/* ACTION */}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(i)}
                      >
                        <Pencil className="h-5 w-5 text-blue-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {fabricItems.length === 0 && (
              <p className="text-gray-400 text-sm">No fabric items</p>
            )}

            <div className="text-right font-semibold mt-2">
              Fabric Total: ₹ {fabricTotal}
            </div>
          </div>

          {/* BLINDS TABLE */}
          <div>
            <div className="font-semibold text-lg mb-2">Blind Items</div>

            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-500">
                  <TableHead>Item Name</TableHead>
                  <TableHead>Shade No</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {blindItems.map((i: EnrichedProduct) => (
                  <TableRow key={i.id}>
                    {/* BLIND NAME */}
                    <TableCell>{i.itemName}</TableCell>

                    {/* SHADE NUMBER */}
                    <TableCell>{i.shadeNo || "-"}</TableCell>
                    

                    {/* QTY */}
                    <TableCell>
                      <Input
                        type="number"
                        value={i.qty}
                        onChange={(e) =>
                          updateField(i.id, "qty", Number(e.target.value))
                        }
                        className="w-20"
                      />
                    </TableCell>

                    {/* RATE */}
                    <TableCell>
                      <Input
                        type="number"
                        value={i.mrp}
                        onChange={(e) =>
                          updateField(i.id, "mrp", Number(e.target.value))
                        }
                        className="w-24"
                      />
                    </TableCell>

                    {/* AMOUNT */}
                    <TableCell className="font-semibold">{i.amount}</TableCell>

                    {/* ACTION */}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(i)}
                      >
                        <Pencil className="h-5 w-5 text-blue-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {blindItems.length === 0 && (
              <p className="text-gray-400 text-sm">No blinds</p>
            )}

            <div className="text-right font-semibold mt-2">
              Blinds Total: ₹ {blindTotal}
            </div>
          </div>

          {/* ROOM TOTAL */}
          <div className="text-center font-bold text-lg mt-4">
            Total Room Amount: ₹ {roomTotal}
          </div>

        </CardContent>
      </Card>
    );
  })}
</div>


        {/* RIGHT SIDE EMPTY PANEL */}
        <div className="border-2 border-slate-400 rounded-xl h-[85vh]"></div>

      </div>
    </div>
  );
}
