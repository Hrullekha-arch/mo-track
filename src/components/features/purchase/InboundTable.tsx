"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  MoreHorizontal,
  Loader2,
  Package,
  CheckCircle2,
  Clock,
  Search,
  ChevronDown,
  Printer,
  ArrowRight,
  Box,
  AlertCircle,
  X,
  ScanLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import {
  InboundRequest,
  PurchaseRequest,
  PurchaseStatus,
  Stock,
  StockTransaction,
  InboundItem,
  Order,
  O2DProcess,
  O2DStatus,
} from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  arrayUnion,
  limit,
  orderBy,
  startAfter,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { INBOUND_PROCESS_CONFIG } from "@/lib/constants";
import { format } from "date-fns";
import { updateStockQuantityAction } from "@/app/dashboard/inventory/actions";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import JsBarcode from "jsbarcode";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { dedupeO2DMilestones, upsertO2DMilestone } from "@/lib/o2d-milestones";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface FlattenedInboundItem {
  id: string;
  dealId: string;
  poNumber?: string;
  customerName: string;
  salesman: string;
  status: string;
  createdAt: string;
  itemName: string;
  supplierCollectionName?: string;
  supplierCollectionCode?: string;
  quantity: string;
  vendorName?: string;
  type: "fabric" | "furniture";
  originalRequest?: PurchaseRequest;
}

type ReceiveItem = {
  rowId: string;
  sourceIndex: number;
  itemName: string;
  expectedQty: string;
  receivedQty: string;
  actualQty: string;
  unit: string;
  vendorName?: string;
  supplierCollectionName?: string;
  supplierCollectionCode?: string;
  checked: boolean;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const parseQty = (value: string) => {
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : NaN;
};

const QTY_EPSILON = 0.0001;

const formatQtyString = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(2).replace(/\.?0+$/, "");
};

const isFullyReceivedQty = (received: number, expected: number) =>
  expected > QTY_EPSILON && received + QTY_EPSILON >= expected;

const normalizeMaterialKey = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function chunkArray(arr: any[], size: number) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// ─── Sticker ───────────────────────────────────────────────────────────────────
function InboundSticker({
  bcn,
  length,
  name,
  code,
}: {
  bcn: string;
  length: number;
  name?: string;
  code?: string;
}) {
  const barcodeRef = React.useRef<SVGSVGElement>(null);
  const barcodeValue = `${bcn}|${length.toFixed(2)}`;

  React.useEffect(() => {
    if (barcodeRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: "CODE128",
          width: 1.6,
          height: 32,
          displayValue: false,
          margin: 0,
        });
      } catch (e) {
        console.error(`Barcode gen failed for: ${barcodeValue}`, e);
      }
    }
  }, [barcodeValue]);

  return (
    <div className="border border-border rounded-lg p-3 bg-white text-black flex flex-col items-center justify-between shadow-sm"
      style={{ width: "288px", height: "192px", fontFamily: "Arial, sans-serif" }}>
      <div className="w-full flex justify-center">
        <div className="flex items-center justify-center rounded border border-slate-200 px-4 py-2">
          <Image src="/logo.png" alt="MO Logo" width={80} height={40} />
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-bold">{name} | {code}</p>
        <p className="text-[10px] uppercase text-slate-500 tracking-wider mt-0.5">BCN</p>
        <p className="text-sm font-bold">{bcn}</p>
      </div>
      <svg ref={barcodeRef} className="w-full max-w-[200px]" />
      <p className="text-sm font-semibold">Length: {length.toFixed(2)} Mtr</p>
    </div>
  );
}

// ─── Receive Dialog ────────────────────────────────────────────────────────────
type ReceiveStep = "select" | "verify" | "preview";

function ReceiveDialog({
  open,
  poNumber,
  onClose,
  user,
  toast,
}: {
  open: boolean;
  poNumber: string | null;
  onClose: () => void;
  user: any;
  toast: any;
}) {
  const [step, setStep] = React.useState<ReceiveStep>("select");
  const [inboundRequest, setInboundRequest] = React.useState<InboundRequest | null>(null);
  const [receiveItems, setReceiveItems] = React.useState<ReceiveItem[]>([]);
  const [receiveQtyErrors, setReceiveQtyErrors] = React.useState<Record<string, string>>({});
  const [isLoadingInbound, setIsLoadingInbound] = React.useState(false);
  const [isReceiving, setIsReceiving] = React.useState(false);

  // Reset on open/close
  React.useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("select");
        setInboundRequest(null);
        setReceiveItems([]);
        setReceiveQtyErrors({});
      }, 200);
    }
  }, [open]);

  // Load inbound data
  React.useEffect(() => {
    if (!open || !poNumber) return;
    const load = async () => {
      setIsLoadingInbound(true);
      try {
        const snap = await getDoc(doc(db, "inbounds", poNumber));
        if (!snap.exists()) { setInboundRequest(null); return; }
        const data = { id: snap.id, ...snap.data() } as InboundRequest;
        setInboundRequest(data);

        const bcns = data.items?.map((i) => i.itemName).filter(Boolean) || [];
        const stockMap = new Map<string, Stock>();
        for (const chunk of chunkArray(bcns, 30)) {
          const stockSnap = await getDocs(query(collection(db, "stocks"), where("bcn", "in", chunk)));
          stockSnap.forEach((d) => { const s = d.data() as Stock; stockMap.set(s.bcn, s); });
        }

        setReceiveItems((data.items || []).map((item, index) => {
          const stock = stockMap.get(item.itemName);
          return {
            rowId: `${data.id}-${index}-${item.itemName}`,
            sourceIndex: index,
            itemName: item.itemName,
            expectedQty: item.quantity,
            receivedQty: String((item as any).receivedQty || "0"),
            actualQty: "",
            unit: item.unit || "Mtr",
            vendorName: data.vendor,
            supplierCollectionName: stock?.supplierCollectionName,
            supplierCollectionCode: stock?.supplierCollectionCode,
            checked: false,
          };
        }));
      } catch (e) {
        console.error(e);
        toast({ variant: "destructive", title: "Error", description: "Failed to load inbound." });
      } finally {
        setIsLoadingInbound(false);
      }
    };
    load();
  }, [open, poNumber]);

  const getExpectedQty = (item: Pick<ReceiveItem, "expectedQty">) => {
    const expected = parseQty(item.expectedQty);
    return Number.isFinite(expected) && expected > 0 ? expected : 0;
  };

  const getAlreadyReceivedQty = (item: Pick<ReceiveItem, "receivedQty">) => {
    const received = parseQty(item.receivedQty);
    return Number.isFinite(received) && received > 0 ? received : 0;
  };

  const getRemainingQty = (item: Pick<ReceiveItem, "expectedQty" | "receivedQty">) =>
    Math.max(0, getExpectedQty(item) - getAlreadyReceivedQty(item));

  const selectedItems = receiveItems.filter(
    (i) => i.checked && getRemainingQty(i) > QTY_EPSILON
  );

  const validateItem = (item: ReceiveItem) => {
    const actual = parseQty(item.actualQty);
    const expected = getExpectedQty(item);
    const remaining = getRemainingQty(item);
    if (!Number.isFinite(actual) || actual <= 0) return "Enter a valid quantity.";
    if (!Number.isFinite(expected) || expected <= 0) return "Expected qty is invalid.";
    if (remaining <= QTY_EPSILON) return "This line is already fully received.";
    if (actual - remaining > QTY_EPSILON) {
      return `Cannot exceed remaining qty (${formatQtyString(remaining)}).`;
    }
    return "";
  };

  const validateAndProceed = () => {
    if (!selectedItems.length) {
      toast({ variant: "destructive", title: "No items selected", description: "Select at least one item." });
      return;
    }
    if (step === "select") { setStep("verify"); return; }
    if (step === "verify") {
      const errors: Record<string, string> = {};
      selectedItems.forEach((item) => {
        const err = validateItem(item);
        if (err) errors[item.rowId] = err;
      });
      if (Object.keys(errors).length) { setReceiveQtyErrors(errors); return; }
      setStep("preview");
    }
  };

  const getBarcodeSvg = (barcodeValue: string) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, barcodeValue, { format: "CODE128", width: 1.6, height: 40, displayValue: false, margin: 0 });
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("preserveAspectRatio", "none");
    return svg.outerHTML;
  };

  const handlePrintStickers = () => {
    const parsedItems = selectedItems.map((i) => ({ ...i, parsedQty: parseQty(i.actualQty) }));
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast({ variant: "destructive", title: "Popup blocked" }); return; }

    const logoSrc = `${window.location.origin}/logo.png`;
    const stickersHtml = parsedItems.map((item) => {
      const collectionText = [item.supplierCollectionName, item.supplierCollectionCode].filter(Boolean).join(" | ");
      const barcodeValue = `${item.itemName}|${item.parsedQty.toFixed(2)}`;
      let barcodeMarkup = "";
      try { barcodeMarkup = getBarcodeSvg(barcodeValue); } catch { barcodeMarkup = `<div class="barcode-fallback">${escapeHtml(barcodeValue)}</div>`; }
      return `<section class="sheet"><article class="sticker"><div class="sticker-header"><img src="${logoSrc}" alt="MO Logo" class="logo" /></div><div class="sticker-body"><p class="name">${escapeHtml(collectionText || "Collection -")}</p><p class="label">BCN</p><p class="bcn">${escapeHtml(item.itemName)}</p></div><div class="barcode-wrap">${barcodeMarkup}</div><p class="length">Length: ${item.parsedQty.toFixed(2)} ${escapeHtml(item.unit || "Mtr")}</p></article></section>`;
    }).join("");

    printWindow.document.write(`<html><head><title>Inbound Stickers</title><style>*{box-sizing:border-box}html,body{margin:0;padding:0;width:100%;background:#fff;font-family:Arial,sans-serif}@page{size:3in 2in;margin:0}.sheet{width:3in;height:2in;page-break-after:always;break-after:page}.sheet:last-child{page-break-after:auto;break-after:auto}.sticker{width:3in;height:2in;border:1px solid #111827;padding:.08in;display:flex;flex-direction:column;justify-content:space-between}.sticker-header{display:flex;justify-content:center}.logo{width:58px;height:24px;object-fit:contain}.sticker-body{text-align:center;margin-top:.02in}.name{margin:0;font-size:9px;line-height:1.15;font-weight:700;min-height:20px;overflow:hidden}.label{margin:.03in 0 0;font-size:8px;font-weight:700;letter-spacing:.08em;color:#4b5563}.bcn{margin:.015in 0 0;font-size:13px;line-height:1.15;font-weight:700;word-break:break-word}.barcode-wrap{width:100%;height:.42in;margin-top:.04in}.barcode-wrap svg{width:100%;height:100%;display:block}.barcode-fallback{width:100%;height:100%;border:1px dashed #6b7280;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#111827;word-break:break-all;padding:2px 4px}.length{margin:.02in 0 0;font-size:11px;line-height:1.1;font-weight:700;text-align:center}@media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${stickersHtml}</body></html>`);
    printWindow.document.close();
    const run = () => { printWindow.focus(); printWindow.print(); setTimeout(() => printWindow.close(), 200); };
    printWindow.document.readyState === "complete" ? setTimeout(run, 300) : (printWindow.onload = () => setTimeout(run, 300));
  };

  const handleReceive = async () => {
    if (!inboundRequest || !poNumber || !user) return;
    const parsedItems = selectedItems
      .map((item) => ({ ...item, parsedQty: parseQty(item.actualQty) }))
      .filter((item) => Number.isFinite(item.parsedQty) && item.parsedQty > QTY_EPSILON);

    if (!parsedItems.length) {
      toast({
        variant: "destructive",
        title: "No quantity entered",
        description: "Enter a valid receive quantity for at least one selected line.",
      });
      return;
    }

    setIsReceiving(true);
    try {
      const nowIso = new Date().toISOString();
      const requestRef = doc(db, "inbounds", inboundRequest.id);
      let resolvedInbound: InboundRequest | null = null;
      let itemsAfterReceive: InboundItem[] = [];
      let effectiveReceipts: Array<(typeof parsedItems)[number] & { parsedQty: number }> = [];
      let allCompleteAfterReceive = false;

      await runTransaction(db, async (transaction) => {
        const currentInboundSnap = await transaction.get(requestRef);
        if (!currentInboundSnap.exists()) {
          throw new Error("Inbound request not found.");
        }

        resolvedInbound = {
          id: currentInboundSnap.id,
          ...(currentInboundSnap.data() as Omit<InboundRequest, "id">),
        } as InboundRequest;
        const items = JSON.parse(
          JSON.stringify((resolvedInbound as InboundRequest).items || [])
        ) as InboundItem[];
        const transactionReceipts: Array<(typeof parsedItems)[number] & { parsedQty: number }> = [];

        parsedItems.forEach((update) => {
          const targetItem = items[update.sourceIndex];
          if (!targetItem) return;

          const expectedQty = parseQty(String(targetItem.quantity || "0"));
          const expected = Number.isFinite(expectedQty) && expectedQty > 0 ? expectedQty : 0;
          const alreadyReceived = parseQty(String((targetItem as any).receivedQty || "0"));
          const receivedSoFar =
            Number.isFinite(alreadyReceived) && alreadyReceived > 0 ? alreadyReceived : 0;
          const remaining = Math.max(0, expected - receivedSoFar);
          if (remaining <= QTY_EPSILON) return;

          const batchQty = Math.min(update.parsedQty, remaining);
          if (batchQty <= QTY_EPSILON) return;

          const nextReceived = receivedSoFar + batchQty;
          (targetItem as any).receivedQty = formatQtyString(nextReceived);
          const receiptBatches = Array.isArray((targetItem as any).receiptBatches)
            ? [...(targetItem as any).receiptBatches]
            : [];
          receiptBatches.push({
            receivedQty: formatQtyString(batchQty),
            receivedAt: nowIso,
            receivedBy: user.name,
            unit: update.unit || targetItem.unit || "Mtr",
          });
          (targetItem as any).receiptBatches = receiptBatches;

          const milestones = Array.isArray(targetItem.inboundMilestones)
            ? [...targetItem.inboundMilestones]
            : [];
          const receivingMilestoneIndex = milestones.findIndex(
            (milestone: any) => Number(milestone?.stepId) === 3
          );
          if (isFullyReceivedQty(nextReceived, expected)) {
            const completeMilestone = {
              stepId: 3,
              status: "completed" as const,
              completedAt: nowIso,
              completedBy: user.name,
            };
            if (receivingMilestoneIndex >= 0) milestones[receivingMilestoneIndex] = completeMilestone;
            else milestones.push(completeMilestone);
          }
          targetItem.inboundMilestones = milestones;

          transactionReceipts.push({ ...update, parsedQty: batchQty });
        });

        if (!transactionReceipts.length) {
          throw new Error("Selected lines are already fully received.");
        }

        const allComplete = items.every((item) => {
          const expected = parseQty(String(item.quantity || "0"));
          const received = parseQty(String((item as any).receivedQty || "0"));
          const expectedSafe = Number.isFinite(expected) && expected > 0 ? expected : 0;
          const receivedSafe = Number.isFinite(received) && received > 0 ? received : 0;
          return expectedSafe <= QTY_EPSILON || isFullyReceivedQty(receivedSafe, expectedSafe);
        });

        const inboundUpdate: Record<string, any> = {
          items,
          updatedAt: nowIso,
        };
        if (allComplete) {
          inboundUpdate.status = "Completed";
          inboundUpdate.completedAt = nowIso;
          inboundUpdate.completedBy = user.name;
        }
        transaction.update(requestRef, inboundUpdate);

        itemsAfterReceive = items;
        effectiveReceipts = transactionReceipts;
        allCompleteAfterReceive = allComplete;
      });

      const effectiveInbound = resolvedInbound || inboundRequest;
      const resolvedPurchaseRequestId = effectiveInbound.purchaseRequestId || inboundRequest.purchaseRequestId;
      const resolvedVendor = effectiveInbound.vendor || inboundRequest.vendor || "";
      const resolvedDealId = effectiveInbound.dealId || inboundRequest.dealId || "";
      const batch = writeBatch(db);

      let salesman = "Unknown";
      if (resolvedPurchaseRequestId) {
        const prDoc = await getDoc(doc(db, "purchaseRequests", resolvedPurchaseRequestId));
        if (prDoc.exists()) salesman = (prDoc.data() as PurchaseRequest).salesman || salesman;
      }

      for (const update of effectiveReceipts) {
        const stockId = update.itemName.replace(/\//g, "-");
        const transaction: Omit<StockTransaction, "id"> = {
          stockId,
          bcn: update.itemName,
          type: "addition",
          quantityChange: update.parsedQty,
          poNumber: poNumber,
          salesman,
          lengths: [update.parsedQty],
          createdAt: nowIso,
          createdBy: user.name,
          unit: update.unit,
          source: "INBOUND_RECEIVE",
          dealId: resolvedDealId,
          customerName: effectiveInbound.customerName,
          vendorName: resolvedVendor,
          purchaseRequestId: resolvedPurchaseRequestId,
          inboundId: effectiveInbound.id,
          purchaseEntryStatus: "Pending",
        };
        const res = await updateStockQuantityAction(stockId, transaction);
        if (!res.success) throw new Error(res.message || "Stock update failed");
      }

      if (resolvedPurchaseRequestId) {
        const prRef = doc(db, "purchaseRequests", resolvedPurchaseRequestId);
        const milestones: PurchaseStatus[] = effectiveReceipts.map((item) => ({
          stepId: 3,
          status: "completed",
          completedAt: nowIso,
          completedBy: user.name,
          itemName: item.itemName,
          quantity: String(item.parsedQty),
          poNumber: poNumber,
          vendorName: resolvedVendor,
        }));
        batch.update(prRef, { poMilestones: arrayUnion(...milestones) });
      }

      const orderSnap = await getDocs(
        query(collection(db, "orders"), where("crmOrderNo", "==", resolvedDealId), limit(1))
      );
      if (!orderSnap.empty) {
        const orderDoc = orderSnap.docs[0];
        const orderData = orderDoc.data() as Order;
        const receiveProgressByItem = new Map<string, { expected: number; received: number }>();
        itemsAfterReceive.forEach((item) => {
          const key = normalizeMaterialKey(item.itemName);
          if (!key) return;
          const expected = parseQty(String(item.quantity || "0"));
          const received = parseQty(String((item as any).receivedQty || "0"));
          const current = receiveProgressByItem.get(key) || { expected: 0, received: 0 };
          current.expected += Number.isFinite(expected) && expected > 0 ? expected : 0;
          current.received += Number.isFinite(received) && received > 0 ? received : 0;
          receiveProgressByItem.set(key, current);
        });

        const fabricDetails = (orderData.fabricDetails || []).map((fabric) => {
          const key = normalizeMaterialKey(fabric.fabricName);
          const progress = receiveProgressByItem.get(key);
          if (!progress) return fabric;
          if (isFullyReceivedQty(progress.received, progress.expected)) {
            return { ...fabric, status: "in stock" as const };
          }
          return fabric;
        });
        batch.update(orderDoc.ref, { fabricDetails });
      }

      if (allCompleteAfterReceive) {
        if (resolvedPurchaseRequestId) {
          const prRef = doc(db, "purchaseRequests", resolvedPurchaseRequestId);
          batch.update(prRef, { status: "Completed" });
          const prSnap = await getDoc(prRef);
          if (prSnap.exists()) {
            const parentPR = prSnap.data() as PurchaseRequest;
            const allPrSnap = await getDocs(
              query(collection(db, "purchaseRequests"), where("dealId", "==", parentPR.dealId))
            );
            const allComplete2 = allPrSnap.docs.every((d) => d.data().status === "Completed");
            if (allComplete2) {
              const o2dSnap = await getDocs(
                query(collection(db, "o2d"), where("dealId", "==", parentPR.dealId), limit(1))
              );
              if (!o2dSnap.empty) {
                const o2dRef = o2dSnap.docs[0].ref;
                const o2dData = (await getDoc(o2dRef)).data() as O2DProcess;
                const o2dStep = o2dData.milestones?.find((m) => m.stepId === 7);
                if (!o2dStep || o2dStep.status !== "completed") {
                  const newMilestone: O2DStatus = {
                    stepId: 7,
                    status: "completed",
                    completedAt: nowIso,
                    completedBy: "System (All Inbounds Complete)",
                    remarks: "Automatically completed after all items received.",
                    selection: "Done",
                  };
                  const mergedMilestones = upsertO2DMilestone(
                    dedupeO2DMilestones((o2dData.milestones || []) as O2DStatus[]),
                    newMilestone
                  );
                  batch.update(o2dRef, { milestones: mergedMilestones });
                }
              }
            }
          }
        }
      }

      await batch.commit();
      toast({
        title: "Items Received",
        description: `${effectiveReceipts.length} line item(s) received in this batch.`,
      });
      onClose();
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Receive Failed",
        description: error.message || "Could not receive items.",
      });
    } finally {
      setIsReceiving(false);
    }
  };

  const stepConfig = [
    { id: "select", label: "Select Items", icon: Package },
    { id: "verify", label: "Verify Quantities", icon: ScanLine },
    { id: "preview", label: "Preview & Receive", icon: CheckCircle2 },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-lg font-bold">Receive Material</DialogTitle>
          {inboundRequest && (
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span><span className="font-medium text-foreground">PO:</span> {poNumber}</span>
              <span><span className="font-medium text-foreground">Deal:</span> {inboundRequest.dealId}</span>
              <span><span className="font-medium text-foreground">Vendor:</span> {inboundRequest.vendor || "—"}</span>
            </div>
          )}
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-0 px-6 py-3 bg-muted/30 border-b shrink-0">
          {stepConfig.map((s, i) => {
            const isActive = step === s.id;
            const isCompleted = stepConfig.findIndex((x) => x.id === step) > i;
            return (
              <React.Fragment key={s.id}>
                <div className={cn("flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md",
                  isActive && "bg-primary text-primary-foreground",
                  isCompleted && "text-emerald-700",
                  !isActive && !isCompleted && "text-muted-foreground"
                )}>
                  <s.icon className="h-4 w-4" />
                  {s.label}
                </div>
                {i < stepConfig.length - 1 && (
                  <ArrowRight className={cn("h-4 w-4 mx-1 shrink-0", isCompleted ? "text-emerald-600" : "text-muted-foreground/40")} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoadingInbound ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading inbound data...</p>
            </div>
          ) : !inboundRequest ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
              <AlertCircle className="h-8 w-8 opacity-40" />
              <p className="text-sm">Inbound request not found.</p>
            </div>
          ) : (
            <>
              {/* Step 1: Select Items */}
              {step === "select" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Select lines for this receive batch. Duplicate BCN rows are handled independently.</p>
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() =>
                        setReceiveItems((prev) =>
                          prev.map((i) =>
                            getRemainingQty(i) > QTY_EPSILON ? { ...i, checked: true } : i
                          )
                        )
                      }
                    >
                      Select all
                    </button>
                  </div>
                  <div className="rounded-xl border overflow-hidden">
                    <div className="grid grid-cols-[36px_1fr_1fr_1fr_80px] gap-3 px-4 py-2.5 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
                      <span />
                      <span>BCN / Item</span>
                      <span>Supplier Collection</span>
                      <span>Vendor</span>
                      <span className="text-right">Exp. Qty</span>
                    </div>
                    <div className="divide-y max-h-72 overflow-y-auto">
                      {receiveItems.map((item) => {
                        const remainingQty = getRemainingQty(item);
                        const alreadyReceivedQty = getAlreadyReceivedQty(item);
                        const isFullyReceived = remainingQty <= QTY_EPSILON;
                        return (
                        <div
                          key={item.rowId}
                          className={cn(
                            "grid grid-cols-[36px_1fr_1fr_1fr_80px] items-center gap-3 px-4 py-3 transition-colors",
                            isFullyReceived
                              ? "opacity-60 bg-muted/20"
                              : item.checked
                              ? "bg-primary/5 cursor-pointer"
                              : "hover:bg-muted/30 cursor-pointer"
                          )}
                          onClick={() => {
                            if (isFullyReceived) return;
                            setReceiveItems((prev) =>
                              prev.map((i) =>
                                i.rowId === item.rowId ? { ...i, checked: !i.checked } : i
                              )
                            );
                          }}
                        >
                          <Checkbox
                            checked={item.checked}
                            disabled={isFullyReceived}
                            onCheckedChange={(v) =>
                              setReceiveItems((prev) =>
                                prev.map((i) =>
                                  i.rowId === item.rowId ? { ...i, checked: !!v } : i
                                )
                              )
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div>
                            <p className="text-sm font-medium font-mono">{item.itemName}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.unit} | Received {formatQtyString(alreadyReceivedQty)} | Remaining{" "}
                              {formatQtyString(remainingQty)}
                            </p>
                          </div>
                          <div className="text-sm">
                            {item.supplierCollectionName && <p className="font-medium">{item.supplierCollectionName}</p>}
                            {item.supplierCollectionCode && <p className="text-xs text-muted-foreground">{item.supplierCollectionCode}</p>}
                            {!item.supplierCollectionName && !item.supplierCollectionCode && <span className="text-muted-foreground">—</span>}
                          </div>
                          <p className="text-sm text-muted-foreground">{item.vendorName || "—"}</p>
                          <p className="text-sm font-semibold text-right">{item.expectedQty} {item.unit}</p>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                  {selectedItems.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-primary">{selectedItems.length}</span> item(s) selected
                    </p>
                  )}
                </div>
              )}

              {/* Step 2: Verify Quantities */}
              {step === "verify" && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Enter received quantity for this batch. Partial receive is allowed up to remaining quantity.</p>
                  <div className="rounded-xl border overflow-hidden">
                    <div className="grid grid-cols-[1fr_120px_120px_140px] gap-4 px-4 py-2.5 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
                      <span>BCN / Item</span>
                      <span>Expected Qty</span>
                      <span>Remaining Qty</span>
                      <span>Receive Now</span>
                    </div>
                    <div className="divide-y max-h-72 overflow-y-auto">
                      {selectedItems.map((item) => {
                        const remainingQty = getRemainingQty(item);
                        const batchQty = parseQty(item.actualQty);
                        const isValidBatch =
                          Number.isFinite(batchQty) &&
                          batchQty > 0 &&
                          batchQty - remainingQty <= QTY_EPSILON;
                        return (
                        <div key={item.rowId} className="grid grid-cols-[1fr_120px_120px_140px] items-center gap-4 px-4 py-3">
                          <div>
                            <p className="text-sm font-medium font-mono">{item.itemName}</p>
                            {item.supplierCollectionName && (
                              <p className="text-xs text-muted-foreground">{item.supplierCollectionName}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold">{item.expectedQty}</span>
                            <span className="text-xs text-muted-foreground">{item.unit}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold">{formatQtyString(remainingQty)}</span>
                            <span className="text-xs text-muted-foreground">{item.unit}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="relative">
                              <Input
                                type="number"
                                step="0.01"
                                value={item.actualQty}
                                onChange={(e) => {
                                  setReceiveItems((prev) =>
                                    prev.map((i) =>
                                      i.rowId === item.rowId ? { ...i, actualQty: e.target.value } : i
                                    )
                                  );
                                  setReceiveQtyErrors((prev) => {
                                    const { [item.rowId]: _, ...rest } = prev;
                                    return rest;
                                  });
                                }}
                                className={cn(
                                  "h-9 pr-10 text-sm",
                                  receiveQtyErrors[item.rowId] && "border-red-500 focus-visible:ring-red-500"
                                )}
                                placeholder={formatQtyString(remainingQty)}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{item.unit}</span>
                            </div>
                            {receiveQtyErrors[item.rowId] && (
                              <p className="text-xs text-red-600 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {receiveQtyErrors[item.rowId]}
                              </p>
                            )}
                            {item.actualQty && !receiveQtyErrors[item.rowId] && isValidBatch && (
                              <p className="text-xs text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Looks good
                              </p>
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Preview & Receive */}
              {step === "preview" && (
                <div className="space-y-5">
                  {/* Summary */}
                  <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <p className="text-sm font-semibold text-emerald-800">Ready to receive {selectedItems.length} item(s)</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {selectedItems.map((item) => (
                        <div key={item.rowId} className="bg-white rounded-lg border border-emerald-200 px-3 py-2">
                          <p className="text-xs font-mono font-semibold truncate">{item.itemName}</p>
                          <p className="text-sm font-bold text-emerald-700 mt-0.5">{item.actualQty} {item.unit}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Stickers */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold">Barcode Stickers</h3>
                        <p className="text-xs text-muted-foreground">3 × 2 inch • Print before receiving</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={handlePrintStickers}>
                        <Printer className="mr-2 h-4 w-4" />
                        Print Stickers
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-4">
                      {selectedItems.map((item) => (
                        <InboundSticker
                          key={item.rowId}
                          bcn={item.itemName}
                          length={parseQty(item.actualQty) || 0}
                          code={item.supplierCollectionCode || "—"}
                          name={item.supplierCollectionName || "—"}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!isLoadingInbound && inboundRequest && (
          <div className="px-6 py-4 border-t bg-muted/20 flex items-center justify-between shrink-0">
            <div>
              {step !== "select" && (
                <Button variant="ghost" size="sm" onClick={() => setStep(step === "preview" ? "verify" : "select")}>
                  ← Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} disabled={isReceiving}>Cancel</Button>
              {step !== "preview" ? (
                <Button onClick={validateAndProceed} disabled={selectedItems.length === 0}>
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleReceive} disabled={isReceiving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {isReceiving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Confirm & Receive
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main InboundTable ─────────────────────────────────────────────────────────
export function InboundTable({ mode }: { mode: "pending" | "completed" }) {
  const [requests, setRequests] = React.useState<FlattenedInboundItem[]>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [receiveDialogOpen, setReceiveDialogOpen] = React.useState(false);
  const [activePoNumber, setActivePoNumber] = React.useState<string | null>(null);
  const [lastDoc, setLastDoc] = React.useState<any>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const PAGE_SIZE = 20;

  const fetchPage = async (force = false, resetCursor = false) => {
    if (loading || (!hasMore && !force)) return;
    setLoading(true);

    const statusFilter = mode === "completed" ? "Completed" : "Active";
    const q = (lastDoc && !resetCursor)
      ? query(collection(db, "inbounds"), where("status", "==", statusFilter), orderBy("createdAt", "desc"), startAfter(lastDoc), limit(PAGE_SIZE))
      : query(collection(db, "inbounds"), where("status", "==", statusFilter), orderBy("createdAt", "desc"), limit(PAGE_SIZE));

    const snapshot = await getDocs(q);
    if (snapshot.empty) { setLoading(false); setHasMore(false); return; }

    setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
    const pageData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    await processPageData(pageData);
    setLoading(false);
  };

  const processPageData = async (pageData: any[]) => {
    const filteredInbounds = pageData.filter((inbound) => {
      const status = String(inbound?.status || "").toLowerCase();
      return mode === "completed" ? status === "completed" : status !== "completed";
    });

    const allBcns = [...new Set(filteredInbounds.flatMap((inbound) =>
      (Array.isArray(inbound?.items) ? inbound.items : []).map((item: any) => item?.itemName).filter(Boolean)
    ))];
    const allPrIds = [...new Set(filteredInbounds.map((i) => i?.purchaseRequestId).filter(Boolean))];

    const stockDataMap = new Map<string, Stock>();
    const purchaseRequestById = new Map<string, PurchaseRequest>();

    for (const chunk of chunkArray(allBcns, 30)) {
      const snap = await getDocs(query(collection(db, "stocks"), where("bcn", "in", chunk)));
      snap.forEach((d) => { const s = d.data() as Stock; if (s?.bcn) stockDataMap.set(s.bcn, s); });
    }
    for (const chunk of chunkArray(allPrIds, 30)) {
      const snap = await getDocs(query(collection(db, "purchaseRequests"), where(documentId(), "in", chunk)));
      snap.forEach((d) => purchaseRequestById.set(d.id, { id: d.id, ...d.data() } as PurchaseRequest));
    }

    const flattened: FlattenedInboundItem[] = filteredInbounds.flatMap((inbound: any) => {
      const poNumber = String(inbound?.id || "");
      const inboundItems = Array.isArray(inbound?.items) ? inbound.items : [];
      const purchaseRequest = purchaseRequestById.get(String(inbound?.purchaseRequestId || ""));
      const inboundStatus = String(inbound?.status || "").toLowerCase();

      return inboundItems.map((item: any, itemIndex: number) => {
        const itemName = String(item?.itemName || "").trim();
        if (!itemName) return null;
        const stockData = stockDataMap.get(itemName);
        const completedMilestones = Array.isArray(item?.inboundMilestones) ? item.inboundMilestones : [];
        const expected = parseQty(String(item?.quantity ?? "0"));
        const received = parseQty(String(item?.receivedQty ?? "0"));
        const expectedSafe = Number.isFinite(expected) && expected > 0 ? expected : 0;
        const receivedSafe = Number.isFinite(received) && received > 0 ? received : 0;
        let statusText = "Pending Receiving";
        if (
          inboundStatus === "completed" ||
          (expectedSafe > QTY_EPSILON && isFullyReceivedQty(receivedSafe, expectedSafe))
        ) statusText = "Received";
        else if (receivedSafe > QTY_EPSILON || completedMilestones.length > 0) statusText = "In Progress";
        if (mode === "completed" && statusText !== "Received") return null;
        if (mode === "pending" && statusText === "Received") return null;
        return {
          id: `${poNumber}-${itemName}-${itemIndex}`, dealId: String(inbound?.dealId || purchaseRequest?.dealId || ""),
          poNumber, customerName: String(inbound?.customerName || purchaseRequest?.customerName || ""),
          salesman: purchaseRequest?.salesman || "Unknown", status: statusText,
          createdAt: String(inbound?.createdAt || purchaseRequest?.createdAt || ""),
          itemName, supplierCollectionName: stockData?.supplierCollectionName || "",
          supplierCollectionCode: stockData?.supplierCollectionCode || "",
          quantity: String(item?.quantity ?? ""), vendorName: String(inbound?.vendor || ""),
          type: (purchaseRequest?.type || "fabric") as "fabric" | "furniture",
          originalRequest: purchaseRequest,
        } as FlattenedInboundItem;
      }).filter(Boolean);
    });

    setRequests((prev) => [...prev, ...flattened]);
  };

  React.useEffect(() => {
    setRequests([]);
    setLastDoc(null);
    setHasMore(true);
    setLoading(false);
    fetchPage(true, true);
  }, [mode]);

  const columns: ColumnDef<FlattenedInboundItem>[] = [
    {
      accessorKey: "dealId",
      header: "Order ID",
      cell: ({ row }) => (
        <Link href="#" className="font-semibold text-primary hover:underline text-sm">
          {row.getValue("dealId")}
        </Link>
      ),
    },
    {
      accessorKey: "poNumber",
      header: "PO Number",
      cell: ({ row }) => row.original.poNumber ? (
        <button
          className="text-sm font-mono text-primary hover:underline"
          onClick={() => { setActivePoNumber(row.original.poNumber!); setReceiveDialogOpen(true); }}
        >
          {row.original.poNumber}
        </button>
      ) : null,
    },
    {
      accessorKey: "customerName",
      header: "Customer",
      cell: ({ row }) => <span className="text-sm">{row.getValue("customerName")}</span>,
    },
    {
      accessorKey: "itemName",
      header: "BCN / Item",
      cell: ({ row }) => <span className="text-sm font-mono">{row.getValue("itemName")}</span>,
    },
    {
      accessorKey: "supplierCollectionName",
      header: "Collection",
      cell: ({ row }) => (
        <div>
          {row.original.supplierCollectionName && <p className="text-sm">{row.original.supplierCollectionName}</p>}
          {row.original.supplierCollectionCode && <p className="text-xs text-muted-foreground">{row.original.supplierCollectionCode}</p>}
          {!row.original.supplierCollectionName && <span className="text-muted-foreground text-sm">—</span>}
        </div>
      ),
    },
    {
      accessorKey: "quantity",
      header: "Qty",
      cell: ({ row }) => <span className="text-sm font-semibold">{row.getValue("quantity")}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge
            variant="outline"
            className={cn("text-xs",
              status === "Received" && "border-emerald-300 bg-emerald-50 text-emerald-700",
              status === "In Progress" && "border-amber-300 bg-amber-50 text-amber-700",
              status === "Pending Receiving" && "border-slate-200 bg-slate-50 text-slate-600"
            )}
          >
            {status === "Received" && <CheckCircle2 className="mr-1 h-3 w-3" />}
            {status === "In Progress" && <Clock className="mr-1 h-3 w-3" />}
            {status}
          </Badge>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {format(new Date(row.original.createdAt), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {row.original.poNumber && (
              <DropdownMenuItem onClick={() => { setActivePoNumber(row.original.poNumber!); setReceiveDialogOpen(true); }}>
                <Package className="mr-2 h-4 w-4" />
                Receive Material
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const table = useReactTable({
    data: requests,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: { globalFilter },
  });

  // Stats
  const stats = React.useMemo(() => ({
    total: requests.length,
    received: requests.filter((r) => r.status === "Received").length,
    inProgress: requests.filter((r) => r.status === "In Progress").length,
    pending: requests.filter((r) => r.status === "Pending Receiving").length,
  }), [requests]);

  return (
    <>
      <div className="space-y-4">
        {/* Stats */}
        {mode === "pending" && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Pending Receiving", value: stats.pending, color: "bg-slate-500" },
              { label: "In Progress", value: stats.inProgress, color: "bg-amber-500" },
              { label: "Total Items", value: stats.total, color: "bg-blue-500" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border bg-card p-3 flex items-center gap-3 shadow-sm">
                <div className={cn("rounded-lg p-2.5", stat.color)}>
                  <Package className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <Card>
          <CardContent className="p-4 space-y-4">
            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search order, customer, BCN, collection..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
              {globalFilter && (
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setGlobalFilter("")}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Table */}
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="bg-muted/50">
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-10">
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {loading && requests.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {columns.map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 bg-muted rounded animate-pulse" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row, idx) => (
                      <TableRow key={row.id}
                        className={cn("transition-colors", idx % 2 === 0 ? "bg-background" : "bg-muted/20", "hover:bg-primary/5")}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="py-2.5">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-32 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Box className="h-8 w-8 opacity-30" />
                          <p className="text-sm">No items found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" onClick={() => fetchPage()} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {loading ? "Loading..." : `Load more`}
                </Button>
              </div>
            )}
            {!hasMore && requests.length > 0 && (
              <p className="text-center text-xs text-muted-foreground py-2">
                All {requests.length} items loaded
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <ReceiveDialog
        open={receiveDialogOpen}
        poNumber={activePoNumber}
        onClose={() => {
          setReceiveDialogOpen(false);
          setTimeout(() => setActivePoNumber(null), 200);
        }}
        user={user}
        toast={toast}
      />
    </>
  );
}

