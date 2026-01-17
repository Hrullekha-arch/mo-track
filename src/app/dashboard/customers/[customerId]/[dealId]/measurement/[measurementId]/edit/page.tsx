

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
  createQuotationAction
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
import { useAuth } from "@/context/AuthContext";

// ================= LOGGER =================
const log = (...args: any[]) => console.log("✅ [QuotationBuilder]", ...args);
const logError = (...args: any[]) => console.error("❌ [QuotationBuilder]", ...args);
// ==========================================

type EnrichedProduct = {
  id: string;
  room: string;
  itemName: string;
  bcn: string;
  shadeNo: string;
  isBlind: boolean;
  width: string;
  height: string;
  noOfPannel?: string;
  qty: number;
  mrp: number;
  amount: number;
  normalizedType: NormalizedType;
  source: "measurement" | "selection" | "merged";
  status?: "complete" | "attention";
  issues?: string[];
  raw: any;
};


type NormalizedType =
  | "fabric"
  | "blind"
  | "wallpaper"
  | "stitching"
  | "hardware"
  | "service"
  | "unknown";

const detectItemType = (raw: any): NormalizedType => {
  if (!raw) return "unknown";

  if (
    raw.isBlind ||
    raw.blindType ||
    raw.shadeNo ||
    raw.noOfBlind ||
    raw.type === "blind"
  ) return "blind";

  const src = String(raw.productSource || "").toLowerCase();
  const cat = String(raw.productCategory || "").toLowerCase();
  const grp = String(raw.group || "").toLowerCase();

  if (src.includes("fabric")) return "fabric";
  if (src.includes("wall")) return "wallpaper";
  if (cat.includes("stitch")) return "stitching";
  if (grp.includes("hardware") || grp.includes("track")) return "hardware";

  return "unknown";
};

const normalizeRoom = (name: string = "") => {
  return (name || "unassigned").trim().toLowerCase();
};


const makeLocalId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const toNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const collectBcnsFromRooms = (rooms: any[] = []) => {
  const ids: string[] = [];
  (rooms || []).forEach((room) => {
    (room?.items || []).forEach((item: any) => {
      if (item?.data?.bcn) ids.push(String(item.data.bcn).trim());
      if (item?.data?.shadeNo) ids.push(String(item.data.shadeNo).trim());
    });
  });
  return ids;
};

// Helper function to normalize room names for consistent matching
const buildEnrichedFromProducts = (
  products: any[] = [],
  mrpMap: Record<string, any> = {}
): EnrichedProduct[] => {
  return products.map((p: any) => {
    const cleanBCN = String(
      p?.collectionBrand ||
      p?.bcn ||
      p?.BCN ||
      p?.collectionCode ||
      ""
    ).trim();
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
        ? itemName !== "-" && shadeNo !== "-" ? "complete" : "attention"
        : itemName !== "-" && cleanBCN && qty && mrp
          ? "complete"
          : "attention",
      raw: p,
      normalizedType: detectItemType(p),
      source: 'selection',
      issues: [],
    };
  });
};

const buildEnrichedFromRooms = (
  rooms: any[] = [],
  mrpMap: Record<string, any> = {}
): EnrichedProduct[] => {
  const items: EnrichedProduct[] = [];

  (rooms || []).forEach((room: any) => {
    const roomName = room?.roomName || `Unnamed Room`;

    (room?.items || []).forEach((entry: any) => {
        const isBlind = entry.type === 'blind';
        const rawData = entry.data || {};
        
        const bcn = isBlind ? String(rawData.shadeNo || "").trim() : String(rawData.bcn || "").trim();
        const mrp = bcn ? Number(mrpMap[bcn]?.mrp || 0) : 0;
        
        // Use a more generic quantity detection
        const qty = toNumber(rawData.qty || rawData.panels || rawData.noOfSeat || rawData.noOfSheet || 1);

        items.push({
            id: entry?.id || `${roomName}-item-${makeLocalId()}`,
            room: roomName,
            itemName: isBlind ? (rawData.blindType || 'Blind') : (rawData.name || entry.type || 'Measured Item'),
            bcn: bcn || "-",
            isBlind,
            shadeNo: isBlind ? bcn : "-",
            qty,
            width: rawData.width || "0",
            height: rawData.height || "0",
            noOfPannel: rawData.panels || "",
            mrp,
            amount: qty * mrp,
            status: 'complete',
            raw: rawData,
            normalizedType: detectItemType(entry),
            source: 'measurement',
            issues: [],
        });
    });
  });

  return items;
};

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

  // ================= MERGE LOGIC =================
  const buildMergedItems = (
    measurement: any,
    selection: any,
    mrpMap: Record<string, any>
  ): EnrichedProduct[] => {
    log("🚀 [buildMergedItems] Starting merge...");
    log("  [Input] Measurement:", measurement);
    log("  [Input] Selection:", selection);
    log("  [Input] MRP Map:", mrpMap);

    const measurementItems = buildEnrichedFromRooms(measurement?.rooms || [], mrpMap);
    const selectionItems = buildEnrichedFromProducts(selection?.products || [], mrpMap);

    log("  [Step 1] Normalized Measurement Items:", measurementItems);
    log("  [Step 2] Normalized Selection Items:", selectionItems);

    const allItems: EnrichedProduct[] = [];
    const roomsFromSelection = new Set(selectionItems.map(item => normalizeRoom(item.room)));
    const roomsFromMeasurement = new Set(measurementItems.map(item => normalizeRoom(item.room)));

    const allRoomNames = new Set([...roomsFromSelection, ...roomsFromMeasurement]);
    log("  [Step 3] All unique rooms found:", allRoomNames);


    allRoomNames.forEach(roomName => {
        log(`  [Step 4] Processing room: "${roomName}"`);
        const selItemsInRoom = selectionItems.filter(item => normalizeRoom(item.room) === roomName);
        const mesItemsInRoom = measurementItems.filter(item => normalizeRoom(item.room) === roomName);
        log(`    - Found ${selItemsInRoom.length} items in Selection.`);
        log(`    - Found ${mesItemsInRoom.length} items in Measurement.`);


        if (selItemsInRoom.length > 0 && mesItemsInRoom.length > 0) {
            log(`    - Room exists in BOTH. Merging items...`);
            const matchedMeasurementIds = new Set<string>();
            selItemsInRoom.forEach(sItem => {
                const measurementMatch = mesItemsInRoom.find(mItem =>
                    !mItem.isBlind && !sItem.isBlind && !matchedMeasurementIds.has(mItem.id)
                ) || mesItemsInRoom.find(mItem =>
                    mItem.isBlind === sItem.isBlind && !matchedMeasurementIds.has(mItem.id)
                );

                if (measurementMatch) {
                    log(`      - ✅ MATCH: Selection item "${sItem.itemName}" (${sItem.id}) merged with Measurement item "${measurementMatch.itemName}" (${measurementMatch.id})`);
                    matchedMeasurementIds.add(measurementMatch.id);
                    
                    // ✅ Merge: keep BCN + MRP from SELECTION, keep dimensions from MEASUREMENT
                    const merged: EnrichedProduct = {
                      ...sItem,                // start from selection (keeps BCN + MRP)
                      ...measurementMatch,     // bring measurement fields (width/height/panels etc.)
                      id: sItem.id,            // stable id
                      source: "merged",
                      issues: [],
                      room: sItem.room,        // keep casing
                    
                      // ✅ HARD RULE: NEVER let measurement overwrite BCN/MRP for fabrics
                      bcn: sItem.bcn,
                      mrp: sItem.mrp,
                    
                      // ✅ For blinds, shadeNo should remain from selection if present
                      shadeNo: sItem.isBlind ? (sItem.shadeNo || measurementMatch.shadeNo) : "-",
                    
                      // ✅ raw: keep both, but selection should win for pricing fields
                      raw: { ...measurementMatch.raw, ...sItem.raw },
                    };
                    
                    allItems.push(merged);

                } else {
                    log(`      - ⚠️ NO MATCH for Selection item "${sItem.itemName}". Adding with warning.`);
                    allItems.push({ ...sItem, source: 'selection', status: 'attention', issues: ['Not measured yet'] });
                }
            });
            mesItemsInRoom.forEach(mItem => {
                if (!matchedMeasurementIds.has(mItem.id)) {
                     log(`      - ⚠️ Measurement item "${mItem.itemName}" was measured but NOT in selection.`);
                    allItems.push({ ...mItem, source: 'measurement', status: 'attention', issues: ['Not in selection'] });
                }
            });

        } else if (selItemsInRoom.length > 0) {
            log(`    - Room only exists in SELECTION. Adding all ${selItemsInRoom.length} items with warning.`);
            selItemsInRoom.forEach(sItem => {
                allItems.push({ ...sItem, source: 'selection', status: 'attention', issues: ['Not measured yet'] });
            });
        } else if (mesItemsInRoom.length > 0) {
            log(`    - Room only exists in MEASUREMENT. Adding all ${mesItemsInRoom.length} items with warning.`);
            mesItemsInRoom.forEach(mItem => {
                allItems.push({ ...mItem, source: 'measurement', status: 'attention', issues: ['Not in selection'] });
            });
        }
    });

    log("  [Step 5] Finished processing all rooms.");
    log("📦 [buildMergedItems] Final merged items:", allItems);
    return allItems;
  };

  const groupByRoom = (list: EnrichedProduct[]) =>
    list.reduce((acc: Record<string, EnrichedProduct[]>, curr) => {
      const roomKey = curr.room || 'Unassigned';
      if (!acc[roomKey]) acc[roomKey] = [];
      acc[roomKey].push(curr);
      return acc;
    }, {});
    
  const calculateFabricQty = (i: EnrichedProduct) => {
    log(`  [calculateFabricQty] Calculating for item: "${i.itemName}"`);
    const heightinch = Number(i.height || 0) + 16;
    const heightCM = heightinch * 2.54;
    const vrCM = Number(i.raw?.verticalRepeat || 0);
    const panelQty = Number(i.noOfPannel || 1);
    log(`    - Height (in): ${heightinch}, Height (cm): ${heightCM.toFixed(2)}, VR (cm): ${vrCM}, Panels: ${panelQty}`);

    if (!vrCM || vrCM === 0) {
      const basicMeters = (heightCM / 100) * panelQty;
      log(`    - No VR. Basic calc: ((${heightCM.toFixed(2)} / 100) * ${panelQty}) = ${basicMeters.toFixed(2)} -> ceil -> ${Math.ceil(basicMeters)}`);
      return Math.ceil(basicMeters);
    }

    let repeatCount = heightCM / vrCM;
    log(`    - With VR. Repeats needed: ${heightCM.toFixed(2)} / ${vrCM} = ${repeatCount.toFixed(2)}`);
    repeatCount = repeatCount < 1 ? 1 : Math.ceil(repeatCount);
    const effectiveWidth = repeatCount * vrCM;
    const totalCM = effectiveWidth * panelQty;
    const meters = totalCM / 100;
    log(`    - Final calc: Ceil(${repeatCount}) * ${vrCM} * ${panelQty} / 100 = ${meters.toFixed(2)} -> ceil -> ${Math.ceil(meters)}`);
    return Math.ceil(meters);
  };

  const getGstPercent = (item: EnrichedProduct) => {
    const group = String(item.raw?.group || item.raw?.itemType || "").toLowerCase();
    if (item.isBlind) return 18;
    if (group.includes("hardware")) return 18;
    return 5;
  };

  const deriveRowAmounts = (item: EnrichedProduct) => {
    log(`[deriveRowAmounts] Deriving amounts for item: "${item.itemName}"`);
    const qty = item.isBlind ? item.qty : calculateFabricQty(item);
    const gross = qty * item.mrp;
    const discountPercent = discountMap[item.id] ?? 0;
    const discountAmount = gross * (discountPercent / 100);
    const net = gross - discountAmount;
    const taxPercent = getGstPercent(item);
    const gstAmount = net * (taxPercent / 100);
    const totalWithTax = net + gstAmount;

    const result = { qty, gross, discountAmount, net, discountPercent, taxPercent, gstAmount, totalWithTax };
    log(`  - Results:`, result);
    return result;
  };

  const formatCurrency = (value: number) =>
    Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    
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
        setCustomerPhone(customer.mobileNo || "");
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
        const { qty, mrp } = deriveRowAmounts(item);
        return {
          collectionBrand: item.bcn,
          serialNo: item.raw?.serialNo || "",
          salesDescription: item.itemName,
          quantity: qty,
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
              const { totalWithTax } = deriveRowAmounts(i);
              return s + totalWithTax;
            }, 0);
            const blindTotal = blindItems.reduce((s: number, i: EnrichedProduct) => {
              const { totalWithTax } = deriveRowAmounts(i);
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
                                const { qty, discountAmount: rowDiscount, net: amount, taxPercent, gstAmount, totalWithTax } = deriveRowAmounts(i);
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
                          const { discountAmount: rowDiscount, net, qty, taxPercent, totalWithTax } = deriveRowAmounts(i);
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
                      defaultValue={editForm.noOfBlind || editForm.qty || ""}
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
                      defaultValue={editForm.qty || ""}
                      onChange={(e) =>
                        handleEditChange("qty", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Rate</Label>
                    <Input
                      type="number"
                      defaultValue={editForm.mrp || ""}
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
