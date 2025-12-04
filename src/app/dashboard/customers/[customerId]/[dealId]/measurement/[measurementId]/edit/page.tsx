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
  width: string;
  height: string;
  noOfPannel?: string; // original panel count (for fabric)
  qty: number;
  mrp: number;
  amount: number;
  status?: "missing" | "complete";
  // 🔥 Full Firestore object (all sofa / blind fields for future use)
  raw: any;
};

const makeLocalId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const toNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const collectBcnsFromRooms = (rooms: any[] = []) => {
  const ids: string[] = [];
  rooms.forEach((room) => {
    (room?.entries || []).forEach((entry: any) => {
      if (entry?.bcn) ids.push(String(entry.bcn).trim());
    });
    (room?.blinds || []).forEach((blind: any) => {
      if (blind?.shadeNo) ids.push(String(blind.shadeNo).trim());
    });
  });
  return ids;
};

const buildEnrichedFromProducts = (
  products: any[] = [],
  mrpMap: Record<string, any> = {}
): EnrichedProduct[] => {
  return products.map((p: any) => {
    const cleanBCN = String(p?.collectionBrand || "").trim();
    const mrp = cleanBCN ? Number(mrpMap[cleanBCN]?.mrp || 0) : 0;

    const isBlind = Boolean(
      p?.isBlind ||
        p?.blindType ||
        p?.shadeNo ||
        p?.noOfBlind ||
        (p?.group && p.group.toLowerCase().includes("blind"))
    );

    let itemName = "-";
    if (isBlind) {
      itemName = p?.blindType || "Blind";
    } else if (p?.salesDescription && p.salesDescription.trim() !== "") {
      itemName = p.salesDescription.trim();
    } else if (p?.itemName) {
      itemName = p.itemName;
    }

    const shadeNo = isBlind ? String(p?.shadeNo || "-") : "-";
    const qty = isBlind
      ? toNumber(p?.noOfBlind || p?.quantity || 1)
      : toNumber(p?.quantity || 1);

    return {
      id: p?.id || makeLocalId(),
      room: p?.room || "",
      itemName,
      bcn: cleanBCN || "-",
      isBlind,
      shadeNo,
      qty,
      width: p?.width || "0",
      height: p?.height || "0",
      noOfPannel: p?.noOfPannel || p?.noOfPcs || "",
      mrp,
      amount: qty * mrp,
      status: isBlind
        ? itemName !== "-" && shadeNo !== "-" ? "complete" : "missing"
        : itemName !== "-" && cleanBCN && qty && mrp
          ? "complete"
          : "missing",
      raw: p,
    };
  });
};

const buildEnrichedFromRooms = (
  rooms: any[] = [],
  mrpMap: Record<string, any> = {}
): EnrichedProduct[] => {
  const items: EnrichedProduct[] = [];

  rooms.forEach((room: any, roomIndex: number) => {
    const roomName = room?.roomName || `Room-${roomIndex + 1}`;

    (room?.entries || []).forEach((entry: any, entryIndex: number) => {
      const cleanBCN = String(entry?.bcn || "").trim();
      const mrp = cleanBCN ? Number(mrpMap[cleanBCN]?.mrp || 0) : 0;
      const qty =
        toNumber(
          entry?.noOfPannel ||
            entry?.qty ||
            entry?.noOfSeat ||
            entry?.noOfSheet ||
            0
        ) || 0;

      items.push({
        id: entry?.id || `${roomName}-entry-${entryIndex}-${makeLocalId()}`,
        room: roomName,
        itemName: entry?.itemName || entry?.itemType || "-",
        bcn: cleanBCN || "-",
        isBlind: false,
        shadeNo: "-",
        qty,
        width: entry?.width || "0",
        height: entry?.height || "0",
        noOfPannel: entry?.noOfPannel || "",
        mrp,
        amount: qty * mrp,
        status: entry?.itemName ? "complete" : "missing",
        raw: entry,
      });
    });

    (room?.blinds || []).forEach((blind: any, blindIndex: number) => {
      const shadeNo = String(blind?.shadeNo || "").trim();
      const qty =
        toNumber(blind?.noOfBlind || blind?.quantity || blind?.qty || 0) || 0;
      const mrp = shadeNo ? Number(mrpMap[shadeNo]?.mrp || 0) : 0;

      items.push({
        id: blind?.id || `${roomName}-blind-${blindIndex}-${makeLocalId()}`,
        room: roomName,
        itemName: blind?.blindType || "Blind",
        bcn: shadeNo || "-",
        isBlind: true,
        shadeNo: shadeNo || "-",
        qty,
        width: blind?.width || "0",
        height: blind?.height || "0",
        mrp,
        amount: qty * mrp,
        status: blind?.blindType ? "complete" : "missing",
        raw: blind,
      });
    });
  });

  return items;
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
      if (!selection) throw new Error("Selection not found");

      const productBcns =
        selection.products?.map((p: any) => p?.collectionBrand)?.filter(Boolean) ||
        [];
      const roomBcns = collectBcnsFromRooms(selection.rooms || []);
      const uniqueBcns = Array.from(
        new Set(
          [...productBcns, ...roomBcns].map((b) => String(b || "").trim()).filter(Boolean)
        )
      );

      const mrpMap = uniqueBcns.length
        ? await inventoryLookupAction({ bcnList: uniqueBcns })
        : {};

      let enriched: EnrichedProduct[] = [];

      if (selection.rooms && selection.rooms.length) {
        enriched = buildEnrichedFromRooms(selection.rooms, mrpMap);
      }

      if ((!enriched || enriched.length === 0) && selection.products?.length) {
        enriched = buildEnrichedFromProducts(selection.products, mrpMap);
      }

      if (!enriched || enriched.length === 0) {
        throw new Error("No measurement items available inside selection.");
      }

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

  const subtotal = items.reduce(
    (s: number, i: EnrichedProduct) => s + i.amount,
    0
  );
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

    const fabricTotal = fabricItems.reduce(
      (s: number, i: EnrichedProduct) => s + i.amount,
      0
    );
    const blindTotal = blindItems.reduce(
      (s: number, i: EnrichedProduct) => s + i.amount,
      0
    );

    const roomTotal = fabricTotal + blindTotal;

    const fabricwidth  = fabricItems[0]?.width ;


    const fabricheight = fabricItems[0]?.height;

    const panelqty = fabricItems[0]?.noOfPannel;

    const marginfabric  = Number(fabricwidth) + 16;

    const fabricwidthinmeter = Number(fabricwidth) * 0.0254;

    const totalfabricqty = fabricwidthinmeter * panelqty;

    console.log(fabricwidth,"--->", fabricheight, "--->", panelqty, "--->", marginfabric, "--->", fabricwidthinmeter, "--->", totalfabricqty.toFixed(0));

    
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
