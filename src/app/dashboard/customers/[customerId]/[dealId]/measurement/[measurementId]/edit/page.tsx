"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
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
  createQuotationAction,
  getDealById,
  getMeasurementById,
  getSelectionById,
  inventoryLookupAction,
  updateBlindsAction,
  updateItemsAction,
} from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { getCustomerById } from "@/app/dashboard/customers/actions";
import { Pencil } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useAuth } from "@/context/AuthContext";
import {
  buildMergedItems,
  calculateFabricQty,
  collectBcnsFromRooms,
  deriveRowAmounts,
  EnrichedProduct,
  formatCurrency,
  groupByRoom,
  log,
  logError,
} from "./quotation-builder-utils";
import {
  QuotationBuilderEditDialog,
  QuotationBuilderHiddenPdf,
} from "./quotation-builder-panels";
export default function QuotationBuilderPage() {
  const { customerId, dealId, measurementId } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EnrichedProduct[]>([]);
  const [groupedRooms, setGroupedRooms] = useState<Record<string, EnrichedProduct[]>>({});
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

  const loadData = async () => {
    try {
      log("🔥 [loadData] Starting data fetch...");
      setLoading(true);

      const cid = String(customerId);
      const did = String(dealId);
      const mid = String(measurementId);
      log(`  - Params: customerId=${cid}, dealId=${did}, measurementId=${mid}`);

      const measurement = await getMeasurementById(cid, did, mid);
      if (!measurement) throw new Error("Measurement not found");
      log("  - ✅ Fetched Measurement:", measurement);

      const selectionId = measurement.selectionId;
      if (!selectionId) throw new Error("Selection missing from measurement data");
      setSelectionId(String(selectionId));
      log(`  - ✅ Found Selection ID: ${selectionId}`);


      const selection = await getSelectionById(cid, did, String(selectionId));
      if (!selection) throw new Error("Selection not found");
      log("  - ✅ Fetched Selection:", selection);


      const [customer, deal] = await Promise.all([
        getCustomerById(cid),
        getDealById(cid, did),
      ]);
      log("  - ✅ Fetched Customer and Deal:", { customer, deal });

      if (customer) {
        setCustomerName(customer.name || "");
        setCustomerPhone(customer.phone || customer.mobileNo || "");
      }
      if (deal) {
        setDealCode(deal.dealId || deal.id || "");
      }

      const productBcns =
        (selection?.products || []).map((p: any) => p?.collectionBrand).filter(Boolean) || [];
      const roomBcns = collectBcnsFromRooms(measurement?.rooms || []);
      const uniqueBcns = Array.from(
        new Set(
          [...productBcns, ...roomBcns].map((b) => String(b || "").trim()).filter(Boolean)
        )
      );
      log("  - 💰 Collecting BCNs for MRP lookup:", uniqueBcns);


      const mrpMap = uniqueBcns.length
        ? await inventoryLookupAction({ bcnList: uniqueBcns })
        : {};
      log("  - ✅ Fetched MRP Map:", mrpMap);


      const enriched = buildMergedItems(measurement, selection, mrpMap);
      log("  - ✨ Enriched & Merged Items:", enriched);
      setItems(enriched);
      setDiscountMap(
        enriched.reduce((acc: Record<string, number>, curr) => {
          acc[curr.id] =
            Number(curr.raw?.discountPercent ?? curr.raw?.discount ?? 0) || 0;
          return acc;
        }, {})
      );

      const grouped = groupByRoom(enriched);
      log("  - 🏠 Grouped Items by Room:", grouped);
      setGroupedRooms(grouped);
      log("✅ [loadData] Data loading complete.");
    } catch (e: any) {
      logError("[loadData] Error during data fetch:", e);
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
            : "attention";
        return obj;
      }
      return i;
    });

    setItems(updated);
    setGroupedRooms(groupByRoom(updated));
  };
  
  const updateNested = (id: string, nestedKey: string, nestedValue: any) => {
      const updated = items.map((i) => {
        if (i.id === id) {
          const newRaw = { ...i.raw, [nestedKey]: nestedValue };
          const newQty = calculateFabricQty({ ...i, raw: newRaw });
          const newAmount = newQty * i.mrp;
          return { ...i, raw: newRaw, qty: newQty, amount: newAmount };
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
    const { gross } = deriveRowAmounts(i, discountMap);
    return s + gross;
  }, 0);
  const discountAmount = items.reduce((s: number, i: EnrichedProduct) => {
    const { discountAmount } = deriveRowAmounts(i, discountMap);
    return s + discountAmount;
  }, 0);
  const netTotal = grossTotal - discountAmount;
  // GST per item (5% fabric, 18% hardware/blind)
  const gstTotal = items.reduce((s: number, i: EnrichedProduct) => {
    const { gstAmount } = deriveRowAmounts(i, discountMap);
    return s + gstAmount;
  }, 0);
  const baseAmount = netTotal; // taxable without GST
  const cgst = gstTotal / 2;
  const sgst = gstTotal / 2;
  const grandTotal = baseAmount + gstTotal;

  const hasBlockingIssues = items.some(
    (i) => i.issues && i.issues.length > 0
  );
  

  const downloadPdf = async () => {
    if (!pdfRef.current) return;
    try {
      setPdfLoading(true);
      const canvas = await html2canvas(pdfRef.current, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
      });
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

  const handleCreateQuotation = async () => {
    log("🚀 [handleCreateQuotation] Starting...");
    if (hasBlockingIssues) {
      toast({
        variant: "destructive",
        title: "Cannot Create Quotation",
        description: "Please resolve all item issues before creating a quotation.",
      });
      return;
    }
    if (!user) {
        toast({
            variant: "destructive",
            title: "Authentication Error",
            description: "You must be logged in to create a quotation.",
        });
        return;
    }

    setSaving(true);
    try {
      // 1. Format data for the action
      const quotationItems = items.map((item) => {
        const { qty } = deriveRowAmounts(item, discountMap);
        const mrp = item.mrp;
        const resolvedUnit = String((item.raw as any)?.stockUnit || (item.raw as any)?.unit || "").trim() || "Mtr";
        return {
          collectionBrand: item.bcn,
          serialNo: item.raw?.serialNo || "",
          salesDescription: item.itemName,
          quantity: qty,
          unit: resolvedUnit,
          stockUnit: resolvedUnit,
          rate: mrp,
          discountPercent: discountMap[item.id] ?? 0,
          room: item.room,
          remark: item.raw?.remarks || item.raw?.remark || "",
        };
      });

      const quotationData = {
          store: "MO GCR BRANCH", // Or derive this from somewhere
          date: new Date(),
          customerName: customerName,
          dealName: dealCode,
          items: quotationItems,
          // We can leave out VAS for now as it's not in this builder
          vasDetails: [],
          createdBy: user.id
      };

      log("  - 📦 Payload for createQuotationAction:", quotationData);
      
      // 2. Call the server action
      const result = await createQuotationAction(
          String(customerId),
          String(dealId),
          quotationData as any, // Cast as any to match the expected FormValues type
          grandTotal
      );

      log("  - ✅ Server action response:", result);

      if (result.success) {
        toast({
          title: "Quotation Created!",
          description: `Quotation #${result.quotation?.quotationNo} has been successfully created and is pending approval.`,
        });
        // Optionally, redirect or clear the form
      } else {
        throw new Error(result.message);
      }
    } catch (e: any) {
      logError("[handleCreateQuotation] Error:", e);
      toast({
        variant: "destructive",
        title: "Failed to Create Quotation",
        description: e.message || "An unexpected error occurred.",
      });
    } finally {
      setSaving(false);
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
        <div className="col-span-3 space-y-10">
          {Object.keys(groupedRooms).map((room) => {
            const roomItems = groupedRooms[room];
            const fabricItems = roomItems.filter((i: EnrichedProduct) => !i.isBlind);
            const blindItems = roomItems.filter((i: EnrichedProduct) => i.isBlind);

            const fabricTotal = fabricItems.reduce((s: number, i: EnrichedProduct) => {
              const { totalWithTax } = deriveRowAmounts(i, discountMap);
              return s + totalWithTax;
            }, 0);
            const blindTotal = blindItems.reduce((s: number, i: EnrichedProduct) => {
              const { totalWithTax } = deriveRowAmounts(i, discountMap);
              return s + totalWithTax;
            }, 0);

            const roomTotal = fabricTotal + blindTotal;
            
            return (
              <Card key={room} className="border-2 border-slate-400">
                <CardHeader>
                  <div className="font-semibold text-xl mb-3">Room Name</div>
                  <Input defaultValue={room} className="w-60 border-2" />
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
                                const { qty, discountAmount: rowDiscount, net: amount, taxPercent, gstAmount, totalWithTax } = deriveRowAmounts(i, discountMap);
                          return(
                          <TableRow key={i.id}>
                           <TableCell>
                            {i.issues && i.issues.length > 0 && (
                              <div className="text-xs text-red-600 font-semibold mb-1">
                                ⚠ {i.issues.join(", ")}
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="font-medium">{i.itemName || "-"}</span>
                              <span className="text-xs text-gray-500">{i.bcn || "-"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                               {i.noOfPannel ? (
                                <Input
                                    type="text"
                                    defaultValue={i.noOfPannel || ""}
                                    onChange={(e) => updateNested(i.id, "noOfPannel", e.target.value)}
                                    className="w-24"
                                />
                                ) : (
                                <span>-</span>
                                )}
                            </TableCell>

                            <TableCell className="flex justify-center items-center gap-1 w-32">
                              <Input
                                type="number"
                                defaultValue={qty}
                                onChange={(e) => updateField(i.id, "qty", Number(e.target.value))}
                              />Mtr
                              </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                defaultValue={i.mrp}
                                onChange={(e) =>
                                  updateField(i.id, "mrp", Number(e.target.value))
                                }
                                className="w-24"
                              />
                            </TableCell>

                            <TableCell className="font-semibold text-blue-600">
                              <Input
                                type="number"
                                defaultValue={discountMap[i.id] ?? 0}
                                onChange={(e) =>
                                  setDiscountMap((prev) => ({
                                    ...prev,
                                    [i.id]: Number(e.target.value) || 0,
                                  }))
                                }
                                className="w-20"
                              />
                            </TableCell>

                            <TableCell className="text-center">
                              {taxPercent}%
                            </TableCell>

                            <TableCell  className="font-semibold">{totalWithTax.toFixed(0)}</TableCell>

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
                          const { discountAmount: rowDiscount, net, qty, taxPercent, totalWithTax } = deriveRowAmounts(i, discountMap);
                          return (
                          <TableRow key={i.id}>
                            <TableCell>
                                {i.issues?.length && (
                                <div className="text-xs text-red-600 font-semibold mb-1">
                                    ⚠ {i.issues.join(", ")}
                                </div>
                                )}
                                {i.itemName}
                            </TableCell>
                            <TableCell>{i.shadeNo || "-"}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                defaultValue={qty}
                                onChange={(e) =>
                                  updateField(i.id, "qty", Number(e.target.value))
                                }
                                className="w-20"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                defaultValue={i.mrp}
                                onChange={(e) =>
                                  updateField(i.id, "mrp", Number(e.target.value))
                                }
                                className="w-24"
                              />
                            </TableCell>
                            <TableCell className="font-semibold text-blue-600">
                              <Input
                                type="number"
                                defaultValue={discountMap[i.id] ?? 0}
                                onChange={(e) =>
                                  setDiscountMap((prev) => ({
                                    ...prev,
                                    [i.id]: Number(e.target.value) || 0,
                                  }))
                                }
                                className="w-20"
                              />
                            </TableCell>
                            <TableCell className="text-center">{taxPercent}%</TableCell>
                            <TableCell className="font-semibold">{totalWithTax.toFixed(0)}</TableCell>
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
                  <div className="text-right font-bold text-lg mt-4">
                    Total Room Amount (incl. GST): ₹ {roomTotal.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
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
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Grand Total (Incl. GST)</span>
                <span>₹ {grandTotal.toFixed(0)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
          <Button
            className="flex-1"
            disabled={hasBlockingIssues || saving}
            onClick={handleCreateQuotation}
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
      <QuotationBuilderHiddenPdf
        pdfRef={pdfRef}
        dealCode={dealCode}
        customerName={customerName}
        customerPhone={customerPhone}
        groupedRooms={groupedRooms}
        deriveRowAmounts={(item) => deriveRowAmounts(item, discountMap)}
        discountAmount={discountAmount}
        baseAmount={baseAmount}
        gstTotal={gstTotal}
        grandTotal={grandTotal}
      />
      <QuotationBuilderEditDialog
        editOpen={editOpen}
        editingItem={editingItem}
        editForm={editForm}
        saving={saving}
        setEditOpen={setEditOpen}
        setEditingItem={setEditingItem}
        handleEditChange={handleEditChange}
        handleSaveEdit={handleSaveEdit}
      />
    </div>
  );
}



