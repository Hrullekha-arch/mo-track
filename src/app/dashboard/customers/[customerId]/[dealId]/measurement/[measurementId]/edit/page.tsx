"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
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
  getMeasurementById,
  updateBlindsAction,
  updateItemsAction,
  getDealById,
} from "@/app/dashboard/customers/[customerId]/[dealId]/actions";

import { getCustomerById } from "@/app/dashboard/customers/actions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
  const { customerId, dealId, measurementId } = useParams();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EnrichedProduct[]>([]);
  const [groupedRooms, setGroupedRooms] = useState<any>({});
  const [discountMap, setDiscountMap] = useState<Record<string, number>>({});
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EnrichedProduct | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [dealCode, setDealCode] = useState("");
  const pdfRef = useRef<HTMLDivElement | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const groupByRoom = (list: EnrichedProduct[]) =>
    list.reduce((acc: any, item) => {
      if (!acc[item.room]) acc[item.room] = [];
      acc[item.room].push(item);
      return acc;
    }, {});

  const calculateFabricQty = (i: EnrichedProduct) => {
    const widthCM = Number(i.width || 0) * 2.75; // convert to cm + added margin
    const hrCM = Number(i.raw?.horizontalRepeat || 0); // always cm
    const panelQty = Number(i.noOfPannel || 1);
    console.log("🧮 Qty calc start", {
      id: i.id,
      widthCM,
      hrCM,
      panelQty,
    });

    // No HR → simple width × panel qty
    if (!hrCM || hrCM === 0) {
      const basicMeters = (widthCM / 100) * panelQty;
      console.log("➡️ No HR path", {
        basicMeters,
        ceil: Math.ceil(basicMeters),
      });
      return Math.ceil(basicMeters);
    }

    // repeats needed
    let repeatCount = widthCM / hrCM;
    console.log("Repeat count raw", repeatCount);

    // if result < 1 → treat as 1
    repeatCount = repeatCount < 1 ? 1 : Math.ceil(repeatCount);
    console.log("Repeat count adj", repeatCount);

    // effective width in cm to cover pattern
    const effectiveWidth = repeatCount * hrCM;
    console.log("Effective width cm", effectiveWidth);

    // total for all panels
    const totalCM = effectiveWidth * panelQty;
    console.log("Total cm all panels", totalCM);

    // convert to meter
    const meters = totalCM / 100;
    console.log("Meters raw", meters, "ceil", Math.ceil(meters));

    // final qty in meters (rounded)
    return Math.ceil(meters);
  };

  const getGstPercent = (item: EnrichedProduct) => {
    const group = String(item.raw?.group || item.raw?.itemType || "").toLowerCase();
    if (item.isBlind) return 18;
    if (group.includes("hardware")) return 18;
    return 5;
  };

  const deriveRowAmounts = (item: EnrichedProduct) => {
    const qty = item.isBlind ? item.qty : calculateFabricQty(item);
    const gross = qty * item.mrp;
    const discountPercent = discountMap[item.id] ?? 0;
    const discountAmount = gross * (discountPercent / 100);
    const net = gross - discountAmount;
    const taxPercent = getGstPercent(item);
    const gstAmount = net * (taxPercent / 100);
    const totalWithTax = net + gstAmount;
    return { qty, gross, discountAmount, net, discountPercent, taxPercent, gstAmount, totalWithTax };
  };

  const formatCurrency = (value: number) =>
    Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

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
      setSelectionId(String(selectionId));

      const selection = await getSelectionById(cid, did, String(selectionId));
      if (!selection) throw new Error("Selection not found");

      const [customer, deal] = await Promise.all([
        getCustomerById(cid),
        getDealById(cid, did),
      ]);
      if (customer) {
        setCustomerName(customer.name || "");
        setCustomerPhone(customer.mobileNo || "");
      }
      if (deal) {
        setDealCode(deal.dealId || deal.id || "");
      }

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
      setDiscountMap(
        enriched.reduce((acc: Record<string, number>, curr) => {
          acc[curr.id] =
            Number(curr.raw?.discountPercent ?? curr.raw?.discount ?? 0) || 0;
          return acc;
        }, {})
      );

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

    setGroupedRooms(groupByRoom(updated));
  };

  const openEdit = (item: EnrichedProduct) => {
    setEditingItem(item);

    if (item.isBlind) {
      setEditForm({
        blindType: item.raw?.blindType || item.itemName || "",
        shadeNo: item.raw?.shadeNo || item.shadeNo || "",
        control: item.raw?.control || item.raw?.controlSide || "",
        type: item.raw?.type || item.raw?.mountType || "",
        width: item.raw?.width || item.width || "",
        height: item.raw?.height || item.height || "",
        noOfBlind: item.raw?.noOfBlind || item.raw?.quantity || item.qty || "",
        area: item.raw?.area || "",
        remarks: item.raw?.remarks || item.raw?.remark || "",
        qty: item.qty,
        mrp: item.mrp,
      });
    } else {
      setEditForm({
        itemName: item.raw?.itemName || item.itemName || "",
        collectionBrand: item.raw?.collectionBrand || item.bcn || "",
        width: item.raw?.width || item.width || "",
        height: item.raw?.height || item.height || "",
        noOfPannel:
          item.raw?.noOfPannel ||
          item.raw?.noOfSeat ||
          item.raw?.noOfSheet ||
          item.noOfPannel ||
          "",
        remark: item.raw?.remark || item.raw?.remarks || "",
        qty: item.qty,
        mrp: item.mrp,
      });
    }

    setEditOpen(true);
  };

  const handleEditChange = (key: string, value: any) => {
    setEditForm((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    if (!selectionId) {
      toast({
        variant: "destructive",
        title: "Missing selection",
        description: "Selection id not available to update.",
      });
      return;
    }

    const cid = String(customerId);
    const did = String(dealId);

    try {
      setSaving(true);

      if (editingItem.isBlind) {
        const payload = {
          id: editingItem.id,
          blindType: editForm.blindType || editingItem.itemName || "",
          shadeNo: editForm.shadeNo || editingItem.shadeNo || "",
          control: editForm.control || "",
          type: editForm.type || "",
          width: editForm.width || "",
          height: editForm.height || "",
          noOfBlind: editForm.noOfBlind || editForm.qty || "",
          quantity: editForm.noOfBlind || editForm.qty || "",
          area: editForm.area || "",
          remarks: editForm.remarks || "",
          mrp: editForm.mrp ?? editingItem.mrp,
        };

        const res = await updateBlindsAction({
          customerId: cid,
          dealId: did,
          selectionId,
          roomName: editingItem.room,
          blinds: [payload],
        });

        if (!res?.success) {
          throw new Error(res?.error || "Failed to update blind");
        }

        const updated = items.map((i) => {
          if (i.id !== editingItem.id) return i;

          const qtyVal =
            Number(editForm.noOfBlind || editForm.qty || i.qty || 0) || 0;
          const mrpVal = Number(editForm.mrp ?? i.mrp ?? 0);

          const newRaw = {
            ...i.raw,
            blindType: payload.blindType,
            shadeNo: payload.shadeNo,
            control: payload.control,
            type: payload.type,
            width: payload.width,
            height: payload.height,
            noOfBlind: payload.noOfBlind,
            area: payload.area,
            remarks: payload.remarks,
            quantity: payload.quantity,
          };

          return {
            ...i,
            itemName: payload.blindType,
            bcn: payload.shadeNo || "-",
            shadeNo: payload.shadeNo,
            width: payload.width,
            height: payload.height,
            qty: qtyVal,
            mrp: mrpVal,
            amount: qtyVal * mrpVal,
            raw: newRaw,
          };
        });

        setItems(updated);
        setGroupedRooms(groupByRoom(updated));
      } else {
        const payload = {
          id: editingItem.id,
          itemType: editingItem.raw?.itemType,
          itemName: editForm.itemName || editingItem.itemName || "",
          collectionBrand: editForm.collectionBrand || editingItem.bcn || "",
          width: editForm.width || "",
          height: editForm.height || "",
          noOfPannel: editForm.noOfPannel || "",
          remark: editForm.remark || "",
          quantity: editForm.qty ?? editingItem.qty ?? 0,
          mrp: editForm.mrp ?? editingItem.mrp ?? 0,
        };

        const res = await updateItemsAction({
          customerId: cid,
          dealId: did,
          selectionId,
          roomName: editingItem.room,
          items: [payload],
        });

        if (!res?.success) {
          throw new Error(res?.error || "Failed to update item");
        }

        const updated = items.map((i) => {
          if (i.id !== editingItem.id) return i;

          const newRaw = {
            ...i.raw,
            itemName: payload.itemName,
            collectionBrand: payload.collectionBrand,
            width: payload.width,
            height: payload.height,
            noOfPannel: payload.noOfPannel,
            remark: payload.remark,
            quantity: payload.quantity,
          };

          const recalculatedQty = calculateFabricQty({
            ...i,
            raw: newRaw,
            width: payload.width,
            height: payload.height,
            noOfPannel: payload.noOfPannel,
          });

          const mrpVal = Number(payload.mrp ?? i.mrp ?? 0);

          return {
            ...i,
            itemName: payload.itemName,
            bcn: payload.collectionBrand || "-",
            width: payload.width,
            height: payload.height,
            noOfPannel: payload.noOfPannel,
            qty: recalculatedQty,
            mrp: mrpVal,
            amount: recalculatedQty * mrpVal,
            raw: newRaw,
          };
        });

        setItems(updated);
        setGroupedRooms(groupByRoom(updated));
      }

      toast({
        title: "Saved",
        description: "Selection updated successfully.",
      });

      setEditOpen(false);
      setEditingItem(null);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message || "Failed to save changes.",
      });
    } finally {
      setSaving(false);
    }
  };

  const grossTotal = items.reduce((s: number, i: EnrichedProduct) => {
    const { gross } = deriveRowAmounts(i);
    return s + gross;
  }, 0);
  const discountAmount = items.reduce((s: number, i: EnrichedProduct) => {
    const { discountAmount } = deriveRowAmounts(i);
    return s + discountAmount;
  }, 0);
  const netTotal = grossTotal - discountAmount;
  // GST per item (5% fabric, 18% hardware/blind)
  const gstTotal = items.reduce((s: number, i: EnrichedProduct) => {
    const { gstAmount } = deriveRowAmounts(i);
    return s + gstAmount;
  }, 0);
  const baseAmount = netTotal; // taxable without GST
  const cgst = gstTotal / 2;
  const sgst = gstTotal / 2;
  const grandTotal = baseAmount + gstTotal;

  const downloadPdf = async () => {
    if (!pdfRef.current) return;
    try {
      setPdfLoading(true);
      const canvas = await html2canvas(pdfRef.current, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);

      pdf.save("quotation.pdf");
    } catch (e) {
      toast({
        variant: "destructive",
        title: "PDF error",
        description: (e as any)?.message || "Failed to generate PDF",
      });
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <div className="p-6">

      {/* TOP HEADER BAR */}
      <div className="border border-gray-400 rounded-xl p-4 mb-6 flex justify-between text-lg font-semibold">
        <span>{customerName || "Customer Name"}</span>
        <span>{customerPhone || "Mobile Number"}</span>
        <span>{dealCode || "Deal Id"}</span>
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

    const fabricTotal = fabricItems.reduce((s: number, i: EnrichedProduct) => {
      const { totalWithTax } = deriveRowAmounts(i);
      return s + totalWithTax;
    }, 0);
    const blindTotal = blindItems.reduce((s: number, i: EnrichedProduct) => {
      const { totalWithTax } = deriveRowAmounts(i);
      return s + totalWithTax;
    }, 0);

    const roomTotal = fabricTotal + blindTotal;
    
    const updateNested = (id: string, nestedKey: string, nestedValue: any) => {
      const updated = items.map((i) => {
        if (i.id === id) {
          const newRaw = { ...i.raw, [nestedKey]: nestedValue };

          // Recalculate qty after raw update
          const newQty = calculateFabricQty({ ...i, raw: newRaw });
          console.log("Recalculated Qty:", newQty);
          const newAmount = newQty * i.mrp;

          return {
            ...i,
            raw: newRaw,
            qty: newQty,
            amount: newAmount,
          };
        }
        return i;
      });

      setItems(updated);
      setGroupedRooms(groupByRoom(updated));
    };


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
                  <TableHead>No. of Seat / Panel</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>GST</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {fabricItems.map((i: EnrichedProduct) => {
              
                        const { qty, discountAmount: rowDiscount, net: amount, taxPercent, gstAmount, totalWithTax } = deriveRowAmounts(i);

                  return(
                  <TableRow key={i.id}>
                    {/* BCN / Item Name */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{i.itemName || "-"}</span>
                        <span className="text-xs text-gray-500">{i.bcn || "-"}</span>
                      </div>
                    </TableCell>
                          {/* ⭐ NEW: SEAT / PANEL COLUMN */}
                    <TableCell>
                      <Input
                        type="text"
                        value={
                          i.raw?.noOfSeat || 
                          i.raw?.noOfSheet || 
                          i.raw?.noOfPannel || 
                          ""
                        }
                        onChange={(e) => {
                          const val = e.target.value;

                          if (i.raw?.noOfSeat !== undefined) {
                            updateNested(i.id, "noOfSeat", val);
                          } else if (i.raw?.noOfSheet !== undefined) {
                            updateNested(i.id, "noOfSheet", val);
                          } else {
                            updateNested(i.id, "noOfPannel", val);
                          }
                        }}
                        className="w-24"
                      />
                    </TableCell>

                    {/* QTY */}
                    <TableCell className="flex justify-center items-center gap-1 w-32">
                      <Input
                        type="number"
                        value={qty}
                        onChange={(e) => updateField(i.id, "qty", Number(e.target.value))}
                      />Mtr
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

                    {/* DISCOUNT */}
                    <TableCell className="font-semibold text-blue-600">
                      <Input
                        type="number"
                        value={discountMap[i.id] ?? 0}
                        onChange={(e) =>
                          setDiscountMap((prev) => ({
                            ...prev,
                            [i.id]: Number(e.target.value) || 0,
                          }))
                        }
                        className="w-20"
                      />
                    </TableCell>

                    {/* GST */}
                    <TableCell className="text-center">
                      {taxPercent}%
                    </TableCell>

                    {/* AMOUNT */}
                    <TableCell  className="font-semibold">{totalWithTax.toFixed(0)}</TableCell>

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
                  );
                })}
              </TableBody>
            </Table>

            {fabricItems.length === 0 && (
              <p className="text-gray-400 text-sm">No fabric items</p>
            )}

            <div className="text-right font-semibold mt-2">
              Fabric Total: ₹ {fabricTotal.toFixed(2)}
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
                  <TableHead>Discount</TableHead>
                  <TableHead>Gst</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {blindItems.map((i: EnrichedProduct) => {
                  const { discountAmount: rowDiscount, net, qty, taxPercent, totalWithTax } = deriveRowAmounts(i);
                  return (
                  <TableRow key={i.id}>
                    {/* BLIND NAME */}
                    <TableCell>{i.itemName}</TableCell>

                    {/* SHADE NUMBER */}
                    <TableCell>{i.shadeNo || "-"}</TableCell>
                    

                    {/* QTY */}
                    <TableCell>
                      <Input
                        type="number"
                        value={qty}
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

                    {/* DISCOUNT */}
                    <TableCell className="font-semibold text-blue-600">
                      <Input
                        type="number"
                        value={discountMap[i.id] ?? 0}
                        onChange={(e) =>
                          setDiscountMap((prev) => ({
                            ...prev,
                            [i.id]: Number(e.target.value) || 0,
                          }))
                        }
                        className="w-20"
                      />
                    </TableCell>

                    {/* GST */}
                    <TableCell className="text-center">{taxPercent}%</TableCell>

                    {/* AMOUNT */}
                    <TableCell className="font-semibold">{totalWithTax.toFixed(0)}</TableCell>

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
                )})}
              </TableBody>
            </Table>

            {blindItems.length === 0 && (
              <p className="text-gray-400 text-sm">No blinds</p>
            )}

            <div className="text-right font-semibold mt-2">
              Blinds Total (incl. GST): ₹ {blindTotal.toFixed(2)}
            </div>
          </div>

          {/* ROOM TOTAL */}
          <div className="text-right font-bold text-lg mt-4">
            Total Room Amount (incl. GST): ₹ {roomTotal.toFixed(2)}
          </div>

        </CardContent>
      </Card>
    );
  })}
</div>
 {/*========================= RIGHT SIDE EMPTY PANEL=========================================================================================== */}
        <div className="border-2 border-slate-400 rounded-xl h-[85vh] p-4 flex flex-col justify-end gap-4">
          <div className="space-y-4">
            <div className="text-lg font-semibold border-b pb-2">
              Summary
            </div>
            <div className="border-t pt-3 space-y-2 text-sm">
              {discountAmount > 0 && (
                <div className="flex justify-between text-blue-700 font-semibold">
                  <span>Discount</span>
                  <span>- ₹ {discountAmount.toFixed(0)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Taxable Amount (excl. GST)</span>
                <span>₹ {baseAmount.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span>GST (5% Fabric, 18% Hardware/Blind)</span>
                <span>₹ {gstTotal.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span>CGST</span>
                <span>₹ {cgst.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span>SGST</span>
                <span>₹ {sgst.toFixed(0)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Grand Total (Incl. GST)</span>
                <span>₹ {grandTotal.toFixed(0)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              className="flex-1"
              onClick={() =>
                toast({
                  title: "Create Quotation",
                  description: "Hook this to your quotation flow.",
                })
              }
            >
              Create Quotation
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={downloadPdf}
              disabled={pdfLoading}
            >
              {pdfLoading ? "Preparing..." : "Download PDF"}
            </Button>
          </div>
        </div>

      </div>

      {/* ===== HIDDEN PDF LAYOUT ===== */}
      <div className="fixed -left-[9999px] top-0 bg-white text-black" ref={pdfRef}>
        <div className="w-[794px] min-h-[1123px] p-6 text-xs font-sans">
          <div className="flex justify-between items-start border-b pb-3">
            <div className="space-y-1">
              <div className="text-2xl font-bold">Quotation</div>
              <div className="font-bold">MO DESIGNS PRIVATE LIMITED</div>
              <div>A-6, Sushant Lok-1, M G Road, Gurgaon-122002,B-50, Sushant Lok-2, Sec- 56,</div>
              <div>Gurgaon - 122011 GURGAON. (HARYANA) INDIA</div>
              <div>GSTIN : 06AACCM5012B1ZY , PAN No : AACCM5012B</div>
              <div>Email id : info@mofurnishings.com , Contact No : 0124-4777888</div>
            </div>
            <div className="text-right flex flex-col items-end gap-2">
              <img src="/logo.png" alt="MO" className="h-14 w-auto" />
              <div className="text-[11px] space-y-1">
                <div>Quotation #{dealCode || "-"}</div>
                <div>Date: {new Date().toLocaleDateString("en-GB")}</div>
                <div>Salesman : -</div>
                <div>Created By : -</div>
              </div>
            </div>
          </div>

          <div className="border-b py-3 text-[11px]">
            <div className="font-semibold mb-1">To,</div>
            <div className="uppercase font-bold">{customerName || "Customer Name"}</div>
            <div>{customerPhone ? `Contact No:${customerPhone}` : ""}</div>
            <div>GSTIN:</div>
          </div>

          <div className="py-3 text-[11px]">
            <p>Dear Sir/Madam,</p>
            <p className="mt-1">
              Thank you for considering us as your furnishing partner. We look forward to your business and promise you our best services. We
              are pleased to submit our Quotation, which is as follows:-
            </p>
          </div>

          <table className="w-full text-[10px] border-collapse" cellPadding={4}>
            <thead>
              <tr className="border bg-gray-100">
                <th className="border w-6">#</th>
                <th className="border">HSN</th>
                <th className="border">Particulars</th>
                <th className="border w-10">Qty</th>
                <th className="border w-10">UOM</th>
                <th className="border w-14">Rate</th>
                <th className="border w-16">Amount</th>
                <th className="border w-14">Disc.</th>
                <th className="border w-12">Tax (%)</th>
                <th className="border w-16">Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(groupedRooms).length === 0 && (
                <tr>
                  <td className="border text-center" colSpan={10}>
                    No items
                  </td>
                </tr>
              )}
              {Object.entries(groupedRooms).map(([roomName, roomItems], roomIndex) => {
                let serial = 1;
                const roomSubtotal = (roomItems as EnrichedProduct[]).reduce((s, item) => {
                  const { totalWithTax } = deriveRowAmounts(item);
                  return s + totalWithTax;
                }, 0);

                return (
                  <React.Fragment key={roomName}>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="border text-center">{roomIndex + 1}</td>
                      <td className="border text-left" colSpan={9}>
                        {roomName.toUpperCase()}
                      </td>
                    </tr>
                    {(roomItems as EnrichedProduct[]).map((item: EnrichedProduct) => {
                      const { qty, gross, discountAmount, net, discountPercent, taxPercent, totalWithTax } = deriveRowAmounts(item);
                      const uom = item.isBlind ? "PCS" : "MTRS";

                      return (
                        <tr key={item.id}>
                          <td className="border text-center">{serial++}</td>
                          <td className="border text-center">{item.bcn || "-"}</td>
                          <td className="border">{item.itemName || "-"}</td>
                          <td className="border text-right">{qty.toFixed(2)}</td>
                          <td className="border text-center">{uom}</td>
                          <td className="border text-right">{formatCurrency(item.mrp)}</td>
                          <td className="border text-right">{formatCurrency(gross)}</td>
                          <td className="border text-right">
                            {discountPercent > 0
                              ? `${formatCurrency(discountAmount)} @${discountPercent}%`
                              : "-"}
                          </td>
                          <td className="border text-center">{taxPercent.toFixed(2)}%</td>
                          <td className="border text-right">{formatCurrency(totalWithTax)}</td>
                        </tr>
                      );
                    })}
                    <tr className="font-semibold bg-gray-50">
                      <td className="border text-right" colSpan={9}>
                        Subtotal
                      </td>
                      <td className="border text-right">{formatCurrency(roomSubtotal)}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          <div className="mt-6 grid grid-cols-2 gap-4 text-[11px]">
            <div className="space-y-1">
              <div className="font-bold">MO DESIGNS PRIVATE LIMITED</div>
              <div>BANK DETAILS - HDFC BANK LTD,SECTOR-56, HUDA DISTRICT</div>
              <div>CENTRE, GURGAON-122001 HARYANA</div>
              <div>Acc.No. - 50200094305041,IFSC - HDFC0003871</div>
            </div>
            <div>
              <table className="w-full text-[10px] border-collapse" cellPadding={4}>
                <tbody>
                  <tr>
                    <td className="border">Total Discount</td>
                    <td className="border text-right">{formatCurrency(discountAmount)}</td>
                  </tr>
                  <tr>
                    <td className="border">Taxable Amount (excl. GST)</td>
                    <td className="border text-right">{formatCurrency(baseAmount)}</td>
                  </tr>
                  <tr>
                    <td className="border">GST (5% Fabric, 18% Hardware/Blind)</td>
                    <td className="border text-right">{formatCurrency(gstTotal)}</td>
                  </tr>
                  <tr>
                    <td className="border">CGST</td>
                    <td className="border text-right">{formatCurrency(cgst)}</td>
                  </tr>
                  <tr>
                    <td className="border">SGST</td>
                    <td className="border text-right">{formatCurrency(sgst)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="border">Grand Total (Incl. GST)</td>
                    <td className="border text-right">{formatCurrency(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditingItem(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit {editingItem?.isBlind ? "Blind" : "Item"}
            </DialogTitle>
          </DialogHeader>

          {editingItem && (
            <div className="grid grid-cols-2 gap-3">
              {editingItem.isBlind ? (
                <>
                  <div className="col-span-2">
                    <Label className="text-sm">Blind Type</Label>
                    <Input
                      value={editForm.blindType || ""}
                      onChange={(e) =>
                        handleEditChange("blindType", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Shade No</Label>
                    <Input
                      value={editForm.shadeNo || ""}
                      onChange={(e) =>
                        handleEditChange("shadeNo", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Control</Label>
                    <Input
                      value={editForm.control || ""}
                      onChange={(e) =>
                        handleEditChange("control", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Type</Label>
                    <Input
                      value={editForm.type || ""}
                      onChange={(e) =>
                        handleEditChange("type", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Width</Label>
                    <Input
                      value={editForm.width || ""}
                      onChange={(e) =>
                        handleEditChange("width", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Height</Label>
                    <Input
                      value={editForm.height || ""}
                      onChange={(e) =>
                        handleEditChange("height", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Qty</Label>
                    <Input
                      type="number"
                      value={editForm.noOfBlind || editForm.qty || ""}
                      onChange={(e) =>
                        handleEditChange("noOfBlind", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Area</Label>
                    <Input
                      value={editForm.area || ""}
                      onChange={(e) =>
                        handleEditChange("area", e.target.value)
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm">Remarks</Label>
                    <Input
                      value={editForm.remarks || ""}
                      onChange={(e) =>
                        handleEditChange("remarks", e.target.value)
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="col-span-2">
                    <Label className="text-sm">Item Name</Label>
                    <Input
                      value={editForm.itemName || ""}
                      onChange={(e) =>
                        handleEditChange("itemName", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">BCN</Label>
                    <Input
                      value={editForm.collectionBrand || ""}
                      onChange={(e) =>
                        handleEditChange("collectionBrand", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">No. of Panel / Seat</Label>
                    <Input
                      value={editForm.noOfPannel || ""}
                      onChange={(e) =>
                        handleEditChange("noOfPannel", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Width</Label>
                    <Input
                      value={editForm.width || ""}
                      onChange={(e) =>
                        handleEditChange("width", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Height</Label>
                    <Input
                      value={editForm.height || ""}
                      onChange={(e) =>
                        handleEditChange("height", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Qty (Mtr)</Label>
                    <Input
                      type="number"
                      value={editForm.qty || ""}
                      onChange={(e) =>
                        handleEditChange("qty", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Rate</Label>
                    <Input
                      type="number"
                      value={editForm.mrp || ""}
                      onChange={(e) =>
                        handleEditChange("mrp", e.target.value)
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm">Remark</Label>
                    <Input
                      value={editForm.remark || ""}
                      onChange={(e) =>
                        handleEditChange("remark", e.target.value)
                      }
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setEditOpen(false);
                setEditingItem(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
