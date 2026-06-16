"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type RowSelectionState,
} from "@tanstack/react-table";
import {
  MoreHorizontal, Loader2, Package, CheckCircle2, Clock,
  Search, Printer, ArrowRight, Box, AlertCircle, X,
  ScanLine, Truck, Ban, Navigation, RefreshCw, ArrowDownToLine, ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { InboundRequest, PurchaseRequest, PurchaseStatus, StockTransaction, InboundItem, Order, O2DProcess, O2DStatus } from "@/lib/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, where, writeBatch, arrayUnion, limit, orderBy, startAfter, runTransaction, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";
import { updateStockQuantityAction } from "@/app/dashboard/inventory/actions";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import JsBarcode from "jsbarcode";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { dedupeO2DMilestones, upsertO2DMilestone } from "@/lib/o2d-milestones";
import { DocketTrackingDialog } from "./InboundTrackingDialog";
import {
  CreatePoDialog,
  VendorVerificationDialog,
  type CreatePoSubmitAction,
} from "@/app/dashboard/purchase/pending-po/dialogs";
import type { PendingPoItem } from "@/app/dashboard/purchase/pending-po/actions";
import {
  markInboundExcessApprovalUsedAction,
  recreateInboundZohoPurchaseOrderAction,
  requestInboundExcessApprovalAction,
} from "@/app/dashboard/inbound/actions";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface FlattenedInboundItem {
  id: string;
  inboundDocId: string;
  inboundItemIndex: number;
  dealId: string;
  poNumber?: string;
  zohoPurchaseOrderNumber?: string;
  zohoPurchaseOrderId?: string;
  zohoVendorId?: string;
  zohoSyncStatus?: "pending" | "synced" | "failed";
  zohoSyncError?: string;
  customerName: string;
  salesman: string;
  status: string;
  createdAt: string;
  itemName: string;
  supplierCollectionName?: string;
  supplierCollectionCode?: string;
  quantity: string;
  unit?: "Mtr" | "Pcs" | "mtr" | "pcs";
  vendorName?: string;
  type: "fabric" | "furniture";
  purchaseRequestId?: string;
  docketNo?: string;
  stockDetail?: any;
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
  excessApproval?: {
    id?: string;
    status?: "pending" | "approved" | "rejected" | "used";
    requestedQty?: number;
    excessQty?: number;
    reviewedBy?: { id?: string; name?: string };
  };
  checked: boolean;
};

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const parseQty = (value: string) => { const p = Number(String(value).trim()); return Number.isFinite(p) ? p : NaN; };
const asTrimmedString = (value: unknown) => String(value ?? "").trim();
const QTY_EPSILON = 0.0001;
const formatQtyString = (v: number) => !Number.isFinite(v) ? "0" : v.toFixed(2).replace(/\.?0+$/, "");
const isFullyReceivedQty = (r: number, e: number) => e > QTY_EPSILON && r + QTY_EPSILON >= e;
const normalizeMaterialKey = (v: unknown) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
function chunkArray(arr: any[], size: number) { const c = []; for (let i = 0; i < arr.length; i += size) c.push(arr.slice(i, i + size)); return c; }
const escapeHtml = (v: string) => v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

// â”€â”€â”€ Sticker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function InboundSticker({ bcn, length, name, code }: { bcn: string; length: number; name?: string; code?: string }) {
  const barcodeRef = React.useRef<SVGSVGElement>(null);
  const barcodeValue = `${bcn}|${length.toFixed(2)}`;
  React.useEffect(() => {
    if (barcodeRef.current) {
      try { JsBarcode(barcodeRef.current, barcodeValue, { format:"CODE128", width:1.6, height:32, displayValue:false, margin:0 }); }
      catch (e) { console.error(e); }
    }
  }, [barcodeValue]);
  return (
    <div className="border border-border rounded-lg p-3 bg-white text-black flex flex-col items-center justify-between shadow-sm" style={{ width:"288px", height:"192px", fontFamily:"Arial, sans-serif" }}>
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€â”€ DOCKET TRACKING DIALOG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

type ReceiveStep = "select" | "verify" | "preview";

function ReceiveDialog({ open, poNumber, onClose, user, toast }: { open:boolean; poNumber:string|null; onClose:()=>void; user:any; toast:any }) {
  const [step, setStep] = React.useState<ReceiveStep>("select");
  const [inboundRequest, setInboundRequest] = React.useState<InboundRequest | null>(null);
  const [receiveItems, setReceiveItems] = React.useState<ReceiveItem[]>([]);
  const [receiveQtyErrors, setReceiveQtyErrors] = React.useState<Record<string, string>>({});
  const [isLoadingInbound, setIsLoadingInbound] = React.useState(false);
  const [isReceiving, setIsReceiving] = React.useState(false);

  React.useEffect(() => {
    if (!open) setTimeout(() => { setStep("select"); setInboundRequest(null); setReceiveItems([]); setReceiveQtyErrors({}); }, 200);
  }, [open]);

  React.useEffect(() => {
    if (!open || !poNumber) return;
    setIsLoadingInbound(true);
    const unsubscribe = onSnapshot(
      doc(db, "inbounds", poNumber),
      (snap) => {
        if (!snap.exists()) {
          setInboundRequest(null);
          setIsLoadingInbound(false);
          return;
        }
        const data = { id: snap.id, ...snap.data() } as InboundRequest;
        setInboundRequest(data);
        setReceiveItems((current) =>
          (data.items || []).map((item, index) => {
            const previous = current.find((entry) => entry.sourceIndex === index);
            return {
              rowId: `${data.id}-${index}-${item.itemName}`,
              sourceIndex: index,
              itemName: item.itemName,
              expectedQty: item.quantity,
              receivedQty: String((item as any).receivedQty || "0"),
              actualQty: previous?.actualQty || "",
              unit: item.unit || "Mtr",
              vendorName: (item as any).vendorName || data.vendor,
              supplierCollectionName:
                (item as any).stockDetail?.supplierCollectionName ||
                (item as any).supplierCollectionName ||
                "",
              supplierCollectionCode:
                (item as any).stockDetail?.supplierCollectionCode ||
                (item as any).supplierCollectionCode ||
                "",
              excessApproval: (item as any).excessApproval,
              checked: previous?.checked || false,
            };
          })
        );
        setIsLoadingInbound(false);
      },
      (error) => {
        console.error(error);
        setIsLoadingInbound(false);
        toast({ variant:"destructive", title:"Error", description:"Failed to load inbound." });
      }
    );
    return unsubscribe;
  }, [open, poNumber]);

  const getExpectedQty = (item: Pick<ReceiveItem,"expectedQty">) => { const e = parseQty(item.expectedQty); return Number.isFinite(e) && e > 0 ? e : 0; };
  const getAlreadyReceivedQty = (item: Pick<ReceiveItem,"receivedQty">) => { const r = parseQty(item.receivedQty); return Number.isFinite(r) && r > 0 ? r : 0; };
  const getRemainingQty = (item: Pick<ReceiveItem,"expectedQty"|"receivedQty">) => Math.max(0, getExpectedQty(item) - getAlreadyReceivedQty(item));
  const selectedItems = receiveItems.filter((i) => i.checked && getRemainingQty(i) > QTY_EPSILON);

  const validateItem = (item: ReceiveItem) => {
    const actual = parseQty(item.actualQty); const expected = getExpectedQty(item); const remaining = getRemainingQty(item);
    if (!Number.isFinite(actual) || actual <= 0) return "Enter a valid quantity.";
    if (!Number.isFinite(expected) || expected <= 0) return "Expected qty is invalid.";
    if (remaining <= QTY_EPSILON) return "This line is already fully received.";
    return "";
  };

  const validateAndProceed = async () => {
    if (!selectedItems.length) { toast({ variant:"destructive", title:"No items selected", description:"Select at least one item." }); return; }
    if (step === "select") { setStep("verify"); return; }
    if (step === "verify") {
      const errors: Record<string,string> = {};
      selectedItems.forEach((item) => { const err = validateItem(item); if (err) errors[item.rowId] = err; });
      if (Object.keys(errors).length) { setReceiveQtyErrors(errors); return; }

      const excessItems = selectedItems.filter((item) => {
        const actual = parseQty(item.actualQty);
        return Number.isFinite(actual) && actual > getRemainingQty(item) + QTY_EPSILON;
      });
      const pendingItems = excessItems.filter((item) => {
        const actual = parseQty(item.actualQty);
        return (
          item.excessApproval?.status === "pending" &&
          Number(item.excessApproval.requestedQty || 0) + QTY_EPSILON >= actual
        );
      });
      const requestsNeeded = excessItems.filter((item) => {
        const actual = parseQty(item.actualQty);
        const approval = item.excessApproval;
        return !(
          (approval?.status === "approved" || approval?.status === "pending") &&
          Number(approval.requestedQty || 0) + QTY_EPSILON >= actual
        );
      });

      if (requestsNeeded.length > 0 || pendingItems.length > 0) {
        const requestResults = await Promise.all(
          requestsNeeded.map((item) =>
            requestInboundExcessApprovalAction(
              {
                inboundId: inboundRequest?.id || poNumber || "",
                itemIndex: item.sourceIndex,
                requestedQty: parseQty(item.actualQty),
              },
              { id: user?.id || "", name: user?.name || "User" }
            )
          )
        );
        const nextErrors = { ...errors };
        pendingItems.forEach((item) => {
          nextErrors[item.rowId] = "Waiting for MD Accept/OK.";
        });
        requestsNeeded.forEach((item, index) => {
          const result = requestResults[index];
          nextErrors[item.rowId] = result.success
            ? "Approval will be taken from MD. Open the Approval Dashboard and wait for Accept / OK."
            : result.message;
        });
        setReceiveQtyErrors(nextErrors);
        toast({
          title: requestResults.some((result) => result.success)
            ? "MD approval requested"
            : pendingItems.length > 0
              ? "Waiting for MD approval"
              : "Approval request failed",
          description: requestResults.find((result) => result.success)?.message ||
            requestResults[0]?.message ||
            "The request is visible on the MD dashboard.",
          variant:
            requestResults.some((result) => result.success) || pendingItems.length > 0
              ? "default"
              : "destructive",
        });
        return;
      }
      setStep("preview");
    }
  };

  const getBarcodeSvg = (barcodeValue: string) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, barcodeValue, { format:"CODE128", width:1.6, height:40, displayValue:false, margin:0 });
    svg.setAttribute("xmlns","http://www.w3.org/2000/svg"); svg.setAttribute("preserveAspectRatio","none");
    return svg.outerHTML;
  };

  const handlePrintStickers = () => {
    const parsedItems = selectedItems.map((i) => ({ ...i, parsedQty: parseQty(i.actualQty) }));
    const pw = window.open("","_blank");
    if (!pw) { toast({ variant:"destructive", title:"Popup blocked" }); return; }
    const logoSrc = `${window.location.origin}/logo.png`;
    const stickersHtml = parsedItems.map((item) => {
      const ct = [item.supplierCollectionName, item.supplierCollectionCode].filter(Boolean).join(" | ");
      const bv = `${item.itemName}|${item.parsedQty.toFixed(2)}`;
      let bm = ""; try { bm = getBarcodeSvg(bv); } catch { bm = `<div class="barcode-fallback">${escapeHtml(bv)}</div>`; }
      return `<section class="sheet"><article class="sticker"><div class="sticker-header"><img src="${logoSrc}" alt="MO Logo" class="logo" /></div><div class="sticker-body"><p class="name">${escapeHtml(ct||"Collection -")}</p><p class="label">BCN</p><p class="bcn">${escapeHtml(item.itemName)}</p></div><div class="barcode-wrap">${bm}</div><p class="length">Length: ${item.parsedQty.toFixed(2)} ${escapeHtml(item.unit||"Mtr")}</p></article></section>`;
    }).join("");
    pw.document.write(`<html><head><title>Inbound Stickers</title><style>*{box-sizing:border-box}html,body{margin:0;padding:0;width:100%;background:#fff;font-family:Arial,sans-serif}@page{size:3in 2in;margin:0}.sheet{width:3in;height:2in;page-break-after:always;break-after:page}.sheet:last-child{page-break-after:auto;break-after:auto}.sticker{width:3in;height:2in;border:1px solid #111827;padding:.08in;display:flex;flex-direction:column;justify-content:space-between}.sticker-header{display:flex;justify-content:center}.logo{width:58px;height:24px;object-fit:contain}.sticker-body{text-align:center;margin-top:.02in}.name{margin:0;font-size:9px;line-height:1.15;font-weight:700;min-height:20px;overflow:hidden}.label{margin:.03in 0 0;font-size:8px;font-weight:700;letter-spacing:.08em;color:#4b5563}.bcn{margin:.015in 0 0;font-size:13px;line-height:1.15;font-weight:700;word-break:break-word}.barcode-wrap{width:100%;height:.42in;margin-top:.04in}.barcode-wrap svg{width:100%;height:100%;display:block}.barcode-fallback{width:100%;height:100%;border:1px dashed #6b7280;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#111827;word-break:break-all;padding:2px 4px}.length{margin:.02in 0 0;font-size:11px;line-height:1.1;font-weight:700;text-align:center}@media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${stickersHtml}</body></html>`);
    pw.document.close();
    const run = () => { pw.focus(); pw.print(); setTimeout(() => pw.close(), 200); };
    pw.document.readyState === "complete" ? setTimeout(run, 300) : (pw.onload = () => setTimeout(run, 300));
  };

  const handleReceive = async () => {
    if (!inboundRequest || !poNumber || !user) return;
    const parsedItems = selectedItems.map((i) => ({ ...i, parsedQty: parseQty(i.actualQty) })).filter((i) => Number.isFinite(i.parsedQty) && i.parsedQty > QTY_EPSILON);
    if (!parsedItems.length) { toast({ variant:"destructive", title:"No quantity entered", description:"Enter a valid receive quantity for at least one selected line." }); return; }
    setIsReceiving(true);
    try {
      const nowIso = new Date().toISOString();
      const requestRef = doc(db, "inbounds", inboundRequest.id);
      let resolvedInbound: InboundRequest | null = null;
      let itemsAfterReceive: InboundItem[] = [];
      let effectiveReceipts: Array<(typeof parsedItems)[number] & { parsedQty: number }> = [];
      const usedExcessApprovalIds: string[] = [];
      let allCompleteAfterReceive = false;

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(requestRef);
        if (!snap.exists()) throw new Error("Inbound request not found.");
        resolvedInbound = { id: snap.id, ...(snap.data() as Omit<InboundRequest,"id">) } as InboundRequest;
        const items = JSON.parse(JSON.stringify((resolvedInbound as InboundRequest).items || [])) as InboundItem[];
        const txReceipts: Array<(typeof parsedItems)[number] & { parsedQty: number }> = [];

        parsedItems.forEach((update) => {
          const ti = items[update.sourceIndex]; if (!ti) return;
          const expected = (() => { const e = parseQty(String(ti.quantity||"0")); return Number.isFinite(e) && e > 0 ? e : 0; })();
          const receivedSoFar = (() => { const r = parseQty(String((ti as any).receivedQty||"0")); return Number.isFinite(r) && r > 0 ? r : 0; })();
          const remaining = Math.max(0, expected - receivedSoFar);
          if (remaining <= QTY_EPSILON) return;
          const batchQty = update.parsedQty;
          if (batchQty <= QTY_EPSILON) return;
          if (batchQty > remaining + QTY_EPSILON) {
            const approval = (ti as any).excessApproval || {};
            const approvedQty = Number(approval.requestedQty || 0);
            if (
              approval.status !== "approved" ||
              !approval.id ||
              approvedQty + QTY_EPSILON < batchQty
            ) {
              throw new Error(
                `${ti.itemName}: quantity above PO balance requires MD approval.`
              );
            }
            usedExcessApprovalIds.push(String(approval.id));
            (ti as any).excessApproval = {
              ...approval,
              status: "used",
              usedAt: nowIso,
              usedBy: { id: user.id, name: user.name },
            };
          }
          const nextReceived = receivedSoFar + batchQty;
          (ti as any).receivedQty = formatQtyString(nextReceived);
          const rb = Array.isArray((ti as any).receiptBatches) ? [...(ti as any).receiptBatches] : [];
          rb.push({ receivedQty: formatQtyString(batchQty), receivedAt: nowIso, receivedBy: user.name, unit: update.unit || ti.unit || "Mtr" });
          (ti as any).receiptBatches = rb;
          const ms = Array.isArray(ti.inboundMilestones) ? [...ti.inboundMilestones] : [];
          const mIdx = ms.findIndex((m: any) => Number(m?.stepId) === 3);
          if (isFullyReceivedQty(nextReceived, expected)) {
            const cm = { stepId:3, status:"completed" as const, completedAt:nowIso, completedBy:user.name };
            if (mIdx >= 0) ms[mIdx] = cm; else ms.push(cm);
          }
          ti.inboundMilestones = ms;
          txReceipts.push({ ...update, parsedQty: batchQty });
        });

        if (!txReceipts.length) throw new Error("Selected lines are already fully received.");
        const allComplete = items.every((item) => {
          const e = parseQty(String(item.quantity||"0")); const r = parseQty(String((item as any).receivedQty||"0"));
          const es = Number.isFinite(e) && e > 0 ? e : 0; const rs = Number.isFinite(r) && r > 0 ? r : 0;
          return es <= QTY_EPSILON || isFullyReceivedQty(rs, es);
        });
        const upd: Record<string,any> = { items, updatedAt: nowIso };
        if (allComplete) { upd.status = "Completed"; upd.completedAt = nowIso; upd.completedBy = user.name; }
        transaction.update(requestRef, upd);
        itemsAfterReceive = items; effectiveReceipts = txReceipts; allCompleteAfterReceive = allComplete;
      });

      const ei = resolvedInbound || inboundRequest;
      const prId = ei.purchaseRequestId || inboundRequest.purchaseRequestId;
      const vendor = ei.vendor || inboundRequest.vendor || "";
      const dealId = ei.dealId || inboundRequest.dealId || "";
      const salesman = (ei as any).assignedSalesman?.name || (inboundRequest as any).assignedSalesman?.name || "Unknown";
      const batch = writeBatch(db);

      for (const update of effectiveReceipts) {
        const stockId = update.itemName.replace(/\//g, "-");
        const tx: Omit<StockTransaction,"id"> = {
          stockId, bcn:update.itemName, type:"addition", quantityChange:update.parsedQty,
          poNumber:poNumber, salesman, lengths:[update.parsedQty], createdAt:nowIso, createdBy:user.name,
          unit:update.unit, source:"INBOUND_RECEIVE", dealId, customerName:ei.customerName,
          vendorName:vendor, purchaseRequestId:prId, inboundId:ei.id, purchaseEntryStatus:"Pending",
        };
        const res = await updateStockQuantityAction(stockId, tx);
        if (!res.success) throw new Error(res.message || "Stock update failed");
      }

      if (prId) {
        const prRef = doc(db, "purchaseRequests", prId);
        batch.update(prRef, { poMilestones: arrayUnion(...effectiveReceipts.map((item) => ({ stepId:3, status:"completed", completedAt:nowIso, completedBy:user.name, itemName:item.itemName, quantity:String(item.parsedQty), poNumber:poNumber, vendorName:vendor }))) });
      }

      const orderSnap = await getDocs(query(collection(db,"orders"), where("crmOrderNo","==",dealId), limit(1)));
      if (!orderSnap.empty) {
        const orderDoc = orderSnap.docs[0]; const orderData = orderDoc.data() as Order;
        const progressMap = new Map<string,{expected:number;received:number}>();
        itemsAfterReceive.forEach((item) => {
          const key = normalizeMaterialKey(item.itemName); if (!key) return;
          const e = parseQty(String(item.quantity||"0")); const r = parseQty(String((item as any).receivedQty||"0"));
          const cur = progressMap.get(key) || { expected:0, received:0 };
          cur.expected += Number.isFinite(e) && e > 0 ? e : 0; cur.received += Number.isFinite(r) && r > 0 ? r : 0;
          progressMap.set(key, cur);
        });
        const fabricDetails = (orderData.fabricDetails||[]).map((fabric) => {
          const prog = progressMap.get(normalizeMaterialKey(fabric.fabricName));
          if (!prog) return fabric;
          return isFullyReceivedQty(prog.received, prog.expected) ? { ...fabric, status:"in stock" as const } : fabric;
        });
        batch.update(orderDoc.ref, { fabricDetails });
      }

      if (allCompleteAfterReceive && prId) {
        const prRef = doc(db,"purchaseRequests",prId);
        batch.update(prRef, { status:"Completed" });
        const prSnap = await getDoc(prRef);
        if (prSnap.exists()) {
          const parentPR = prSnap.data() as PurchaseRequest;
          const allPrSnap = await getDocs(query(collection(db,"purchaseRequests"), where("dealId","==",parentPR.dealId)));
          if (allPrSnap.docs.every((d) => d.data().status === "Completed")) {
            const o2dSnap = await getDocs(query(collection(db,"o2d"), where("dealId","==",parentPR.dealId), limit(1)));
            if (!o2dSnap.empty) {
              const o2dRef = o2dSnap.docs[0].ref; const o2dData = (await getDoc(o2dRef)).data() as O2DProcess;
              const o2dStep = o2dData.milestones?.find((m) => m.stepId === 7);
              if (!o2dStep || o2dStep.status !== "completed") {
                const nm: O2DStatus = { stepId:7, status:"completed", completedAt:nowIso, completedBy:"System (All Inbounds Complete)", remarks:"Automatically completed after all items received.", selection:"Done" };
                batch.update(o2dRef, { milestones: upsertO2DMilestone(dedupeO2DMilestones((o2dData.milestones||[]) as O2DStatus[]), nm) });
              }
            }
          }
        }
      }

      await batch.commit();
      await Promise.all(
        usedExcessApprovalIds.map((approvalId) =>
          markInboundExcessApprovalUsedAction(approvalId, {
            id: user.id,
            name: user.name,
          })
        )
      );
      toast({ title:"Items Received", description:`${effectiveReceipts.length} line item(s) received in this batch.` });
      onClose();
    } catch (error: any) {
      console.error(error);
      toast({ variant:"destructive", title:"Receive Failed", description:error.message||"Could not receive items." });
    } finally { setIsReceiving(false); }
  };

  const stepConfig = [
    { id:"select",  label:"Select Items",     icon:Package      },
    { id:"verify",  label:"Verify Quantities", icon:ScanLine     },
    { id:"preview", label:"Confirm",           icon:CheckCircle2 },
  ];
  const currentStepIndex = stepConfig.findIndex((s) => s.id === step);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">

        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0 bg-muted/20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-base font-bold">Receive Material</DialogTitle>
              {inboundRequest && (
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {[{ label:"PO", value:poNumber }, { label:"Deal", value:inboundRequest.dealId }, { label:"Vendor", value:inboundRequest.vendor||"â€”" }].map(({ label, value }) => (
                    <span key={label} className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{label}:</span> {value}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {/* Step pills */}
            <div className="flex items-center gap-1 shrink-0">
              {stepConfig.map((s, i) => {
                const done = i < currentStepIndex; const active = i === currentStepIndex;
                return (
                  <React.Fragment key={s.id}>
                    <div className={cn("flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all",
                      active && "bg-primary text-primary-foreground shadow-sm",
                      done && "text-emerald-700 bg-emerald-50 border border-emerald-200",
                      !active && !done && "text-muted-foreground bg-muted/50"
                    )}>
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                      {s.label}
                    </div>
                    {i < stepConfig.length - 1 && (
                      <ArrowRight className={cn("h-3.5 w-3.5 shrink-0", done ? "text-emerald-500" : "text-muted-foreground/30")} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
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
              {/* Step 1 */}
              {step === "select" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Select lines for this receive batch.</p>
                    <button className="text-xs font-semibold text-primary hover:underline"
                      onClick={() => setReceiveItems((prev) => prev.map((i) => getRemainingQty(i) > QTY_EPSILON ? { ...i, checked:true } : i))}>
                      Select all
                    </button>
                  </div>
                  <div className="rounded-xl border overflow-hidden">
                    <div className="grid grid-cols-[36px_1fr_1fr_1fr_90px] gap-3 px-4 py-2.5 bg-muted/40 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b">
                      <span /><span>BCN / Item</span><span>Collection</span><span>Vendor</span><span className="text-right">Exp. Qty</span>
                    </div>
                    <div className="divide-y max-h-72 overflow-y-auto">
                      {receiveItems.map((item) => {
                        const rem = getRemainingQty(item); const rcvd = getAlreadyReceivedQty(item); const full = rem <= QTY_EPSILON;
                        return (
                          <div key={item.rowId}
                            className={cn("grid grid-cols-[36px_1fr_1fr_1fr_90px] items-center gap-3 px-4 py-3 transition-colors",
                              full ? "opacity-50 bg-muted/10 cursor-not-allowed" : item.checked ? "bg-primary/5 cursor-pointer" : "hover:bg-muted/20 cursor-pointer"
                            )}
                            onClick={() => { if (full) return; setReceiveItems((prev) => prev.map((i) => i.rowId === item.rowId ? { ...i, checked:!i.checked } : i)); }}
                          >
                            <Checkbox checked={item.checked} disabled={full}
                              onCheckedChange={(v) => setReceiveItems((prev) => prev.map((i) => i.rowId === item.rowId ? { ...i, checked:!!v } : i))}
                              onClick={(e) => e.stopPropagation()} />
                            <div>
                              <p className="text-sm font-semibold font-mono">{item.itemName}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.unit} Â· Rcvd <span className="font-medium">{formatQtyString(rcvd)}</span> Â· Left <span className={cn("font-medium", rem > 0 ? "text-amber-600" : "text-emerald-600")}>{formatQtyString(rem)}</span>
                              </p>
                            </div>
                            <div className="text-sm">
                              {item.supplierCollectionName ? <p className="font-medium leading-tight">{item.supplierCollectionName}</p> : null}
                              {item.supplierCollectionCode ? <p className="text-xs text-muted-foreground">{item.supplierCollectionCode}</p> : null}
                              {!item.supplierCollectionName && !item.supplierCollectionCode && <span className="text-muted-foreground">â€”</span>}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{item.vendorName||"â€”"}</p>
                            <p className="text-sm font-bold text-right">{item.expectedQty} <span className="text-xs font-normal text-muted-foreground">{item.unit}</span></p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {selectedItems.length > 0 && (
                    <p className="text-xs text-muted-foreground"><span className="font-bold text-primary">{selectedItems.length}</span> item(s) selected</p>
                  )}
                </div>
              )}

              {/* Step 2 */}
              {step === "verify" && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Receive up to the PO balance normally. For any excess quantity, approval will be taken from MD through the Approval Dashboard.
                  </p>
                  <div className="rounded-xl border overflow-hidden">
                    <div className="grid grid-cols-[1fr_110px_110px_150px] gap-4 px-4 py-2.5 bg-muted/40 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b">
                      <span>BCN / Item</span><span>Expected</span><span>Remaining</span><span>Receive Now</span>
                    </div>
                    <div className="divide-y max-h-72 overflow-y-auto">
                      {selectedItems.map((item) => {
                        const rem = getRemainingQty(item); const bq = parseQty(item.actualQty);
                        const valid = Number.isFinite(bq) && bq > 0;
                        const isExcess = valid && bq > rem + QTY_EPSILON;
                        const excessApproved =
                          isExcess &&
                          item.excessApproval?.status === "approved" &&
                          Number(item.excessApproval.requestedQty || 0) + QTY_EPSILON >= bq;
                        return (
                          <div key={item.rowId} className="grid grid-cols-[1fr_110px_110px_150px] items-center gap-4 px-4 py-3">
                            <div>
                              <p className="text-sm font-semibold font-mono">{item.itemName}</p>
                              {item.supplierCollectionName && <p className="text-xs text-muted-foreground">{item.supplierCollectionName}</p>}
                            </div>
                            <div><span className="text-sm font-bold">{item.expectedQty}</span> <span className="text-xs text-muted-foreground">{item.unit}</span></div>
                            <div><span className="text-sm font-bold text-amber-600">{formatQtyString(rem)}</span> <span className="text-xs text-muted-foreground">{item.unit}</span></div>
                            <div className="space-y-1">
                              <div className="relative">
                                <Input type="number" step="0.01" value={item.actualQty}
                                  onChange={(e) => { setReceiveItems((prev) => prev.map((i) => i.rowId === item.rowId ? { ...i, actualQty:e.target.value } : i)); setReceiveQtyErrors((prev) => { const { [item.rowId]:_, ...rest } = prev; return rest; }); }}
                                  className={cn("h-9 pr-10 text-sm font-mono", receiveQtyErrors[item.rowId] && "border-red-500 focus-visible:ring-red-500")}
                                  placeholder={formatQtyString(rem)} />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{item.unit}</span>
                              </div>
                              {receiveQtyErrors[item.rowId] && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{receiveQtyErrors[item.rowId]}</p>}
                              {item.actualQty && !receiveQtyErrors[item.rowId] && valid && (
                                <p className={cn("text-xs flex items-center gap-1", excessApproved ? "text-blue-700" : isExcess ? "text-amber-700" : "text-emerald-600")}>
                                  {excessApproved ? <CheckCircle2 className="h-3 w-3" /> : isExcess ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                  {excessApproved
                                    ? "MD approved excess quantity"
                                    : isExcess
                                      ? `Excess ${formatQtyString(bq - rem)} ${item.unit} requires MD approval`
                                      : "Valid"}
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

              {/* Step 3 */}
              {step === "preview" && (
                <div className="space-y-5">
                  <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-7 w-7 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      </div>
                      <p className="text-sm font-bold text-emerald-800">Ready to receive {selectedItems.length} item(s)</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedItems.map((item) => (
                        <div key={item.rowId} className="bg-white rounded-lg border border-emerald-200 px-3 py-2">
                          <p className="text-xs font-mono font-bold truncate text-slate-700">{item.itemName}</p>
                          <p className="text-sm font-bold text-emerald-700 mt-0.5">{item.actualQty} <span className="text-xs font-normal">{item.unit}</span></p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-bold">Barcode Stickers</h3>
                        <p className="text-xs text-muted-foreground">3 Ã— 2 inch Â· Print before receiving</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={handlePrintStickers}>
                        <Printer className="mr-2 h-4 w-4" /> Print Stickers
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-4">
                      {selectedItems.map((item) => (
                        <InboundSticker key={item.rowId} bcn={item.itemName} length={parseQty(item.actualQty)||0}
                          code={item.supplierCollectionCode||"â€”"} name={item.supplierCollectionName||"â€”"} />
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
          <div className="px-6 py-4 border-t bg-muted/10 flex items-center justify-between shrink-0">
            <div>
              {step !== "select" && (
                <Button variant="ghost" size="sm" onClick={() => setStep(step==="preview" ? "verify" : "select")} className="text-xs">
                  â† Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} disabled={isReceiving} size="sm">Cancel</Button>
              {step !== "preview" ? (
                <Button onClick={validateAndProceed} disabled={selectedItems.length===0} size="sm">
                  Next <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button onClick={handleReceive} disabled={isReceiving} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]">
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€â”€ MAIN INBOUND TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export function InboundTable({ mode }: { mode: "pending" | "completed" }) {
  const [requests, setRequests] = React.useState<FlattenedInboundItem[]>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [isVerificationOpen, setIsVerificationOpen] = React.useState(false);
  const [isCreateZohoPoOpen, setIsCreateZohoPoOpen] = React.useState(false);
  const [isNewVendor, setIsNewVendor] = React.useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = React.useState(false);
  const [activePoNumber, setActivePoNumber] = React.useState<string | null>(null);
  const [trackingOpen, setTrackingOpen] = React.useState(false);
  const [activeDocket, setActiveDocket] = React.useState<string | null>(null);
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
    const q = lastDoc && !resetCursor
      ? query(collection(db,"inbounds"), where("status","==",statusFilter), orderBy("createdAt","desc"), startAfter(lastDoc), limit(PAGE_SIZE))
      : query(collection(db,"inbounds"), where("status","==",statusFilter), orderBy("createdAt","desc"), limit(PAGE_SIZE));
    const snapshot = await getDocs(q);
    if (snapshot.empty) { setLoading(false); setHasMore(false); return; }
    setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
    processPageData(snapshot.docs.map((d) => ({ id:d.id, ...d.data() })));
    setLoading(false);
  };

  const processPageData = (pageData: any[]) => {
    const filtered = pageData.filter((inbound) => {
      const s = String(inbound?.status||"").toLowerCase();
      return mode === "completed" ? s === "completed" : s !== "completed";
    });
    const flattened: FlattenedInboundItem[] = filtered.flatMap((inbound: any) => {
      const poNumber = String(inbound?.id||"");
      const items = Array.isArray(inbound?.items) ? inbound.items : [];
      const status = String(inbound?.status||"").toLowerCase();
      const salesman = inbound?.assignedSalesman?.name || "Unknown";
      const docZohoPoNumber = String(inbound?.zohoPurchaseOrderNumber || "").trim();
      const docZohoPoId = String(inbound?.zohoPurchaseOrderId || "").trim();
      const docZohoVendorId = String(inbound?.zohoVendorId || "").trim();
      const docZohoSyncStatus = String(inbound?.zohoSyncStatus || "").trim().toLowerCase();
      const docZohoSyncError = String(inbound?.zohoSyncError || "").trim();
      return items.map((item: any, idx: number) => {
        const itemName = String(item?.itemName||"").trim();
        if (!itemName) return null;
        const supplierCollectionName = item?.stockDetail?.supplierCollectionName || item?.supplierCollectionName || "";
        const supplierCollectionCode = item?.stockDetail?.supplierCollectionCode || item?.supplierCollectionCode || "";
        const docketNo = item?.stockDetail?.docketNo || item?.docketNo || inbound?.docketNo || "";
        const lineZohoPoNumber = String(item?.zohoPurchaseOrderNumber || docZohoPoNumber || "").trim();
        const lineZohoPoId = String(item?.zohoPurchaseOrderId || docZohoPoId || "").trim();
        const lineZohoVendorId = String(item?.zohoVendorId || docZohoVendorId || "").trim();
        const milestones = Array.isArray(item?.inboundMilestones) ? item.inboundMilestones : [];
        const expected = parseQty(String(item?.quantity??"0")); const received = parseQty(String(item?.receivedQty??"0"));
        const es = Number.isFinite(expected) && expected > 0 ? expected : 0;
        const rs = Number.isFinite(received) && received > 0 ? received : 0;
        let statusText = "Pending Receiving";
        if (status === "completed" || (es > QTY_EPSILON && isFullyReceivedQty(rs, es))) statusText = "Received";
        else if (rs > QTY_EPSILON || milestones.length > 0) statusText = "In Progress";
        if (mode === "completed" && statusText !== "Received") return null;
        if (mode === "pending" && statusText === "Received") return null;
        return {
          id:`${poNumber}-${itemName}-${idx}`,
          inboundDocId: poNumber,
          inboundItemIndex: idx,
          dealId:String(inbound?.dealId||""),
          poNumber,
          zohoPurchaseOrderNumber: lineZohoPoNumber || undefined,
          zohoPurchaseOrderId: lineZohoPoId || undefined,
          zohoVendorId: lineZohoVendorId || undefined,
          zohoSyncStatus:
            docZohoSyncStatus === "pending" ||
            docZohoSyncStatus === "synced" ||
            docZohoSyncStatus === "failed"
              ? docZohoSyncStatus
              : undefined,
          zohoSyncError: docZohoSyncError || undefined,
          customerName:String(inbound?.customerName||""),
          salesman,
          status:statusText,
          createdAt:String(inbound?.createdAt||""),
          itemName,
          supplierCollectionName,
          supplierCollectionCode,
          quantity:String(item?.quantity??""),
          unit: item?.unit,
          vendorName:String(item?.vendorName||inbound?.vendor||""),
          type:"fabric" as const,
          purchaseRequestId:inbound?.purchaseRequestId,
          docketNo,
          stockDetail: item?.stockDetail,
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
    setRowSelection({});
    fetchPage(true, true);
  }, [mode]);

  const dateFilteredRequests = React.useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    const fromTime = from && Number.isFinite(from.getTime()) ? from.getTime() : null;
    const toTime = to && Number.isFinite(to.getTime()) ? to.getTime() : null;

    return requests.filter((row) => {
      const createdAtTime = new Date(row.createdAt).getTime();
      if (!Number.isFinite(createdAtTime)) return fromTime === null && toTime === null;
      if (fromTime !== null && createdAtTime < fromTime) return false;
      if (toTime !== null && createdAtTime > toTime) return false;
      return true;
    });
  }, [requests, dateFrom, dateTo]);

  // Keep PO rows ordered by newest inbound creation time first.
  const tableData = React.useMemo(() => {
    const sorted = [...dateFilteredRequests];
    sorted.sort((left, right) => {
      const leftCreatedAt = new Date(left.createdAt).getTime();
      const rightCreatedAt = new Date(right.createdAt).getTime();
      const leftTime = Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0;
      const rightTime = Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0;

      if (leftTime !== rightTime) return rightTime - leftTime;
      return String(right.poNumber || "").localeCompare(String(left.poNumber || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
    return sorted;
  }, [dateFilteredRequests]);

  const selectedRows = React.useMemo(
    () => tableData.filter((row) => !!rowSelection[row.id]),
    [tableData, rowSelection]
  );

  const selectedPoNumber = React.useMemo(
    () => asTrimmedString(selectedRows[0]?.poNumber),
    [selectedRows]
  );

  const isRowEligibleForZohoRecreate = React.useCallback(
    (row: FlattenedInboundItem) => {
      const rowPoNumber = asTrimmedString(row.poNumber);
      if (!rowPoNumber) return false;
      if (asTrimmedString(row.zohoPurchaseOrderNumber)) return false;
      if (!selectedPoNumber) return true;
      return rowPoNumber === selectedPoNumber;
    },
    [selectedPoNumber]
  );

  const toggleRowSelection = React.useCallback(
    (row: FlattenedInboundItem, checked: boolean) => {
      setRowSelection((prev) => {
        const next = { ...prev };
        if (!checked) {
          delete next[row.id];
          return next;
        }

        if (asTrimmedString(row.zohoPurchaseOrderNumber)) {
          toast({
            variant: "destructive",
            title: "Already linked",
            description: "This row already has a Zoho PO number.",
          });
          return prev;
        }

        const rowPoNumber = asTrimmedString(row.poNumber);
        const previouslySelectedRow = Object.keys(prev)
          .map((id) => tableData.find((entry) => entry.id === id))
          .find(Boolean);
        const activePo = selectedPoNumber || asTrimmedString(previouslySelectedRow?.poNumber);
        if (!rowPoNumber) return prev;
        if (activePo && rowPoNumber !== activePo) {
          toast({
            variant: "destructive",
            title: "Same PO only",
            description: "Select rows from the same PO number only.",
          });
          return prev;
        }

        next[row.id] = true;
        return next;
      });
    },
    [selectedPoNumber, tableData, toast]
  );

  const selectedPendingPoItems = React.useMemo<PendingPoItem[]>(() => {
    return selectedRows.map((row) => {
      const nowIso = new Date().toISOString();
      const fallbackRequest: PurchaseRequest = {
        id: row.purchaseRequestId || row.inboundDocId || row.poNumber || row.id,
        dealId: row.dealId || "",
        quotationNo: row.dealId || undefined,
        customerName: row.customerName || "",
        promiseDeliveryDate: nowIso,
        salesman: row.salesman || "Unknown",
        type: row.type || "fabric",
        createdAt: row.createdAt || nowIso,
        createdBy: {
          id: user?.id || "system",
          name: user?.name || "System",
        },
        milestones: [],
        vendorType: "undecided",
        status: "Approved",
      };

      const neededQty = parseQty(row.quantity);
      const sanitizedQty = Number.isFinite(neededQty) && neededQty > 0 ? neededQty : 0;
      const fallbackUnit =
        String(row.unit || "").toLowerCase() === "pcs" ? "Pcs" : "Mtr";

      return {
        id: row.id,
        inboundDocId: row.inboundDocId,
        inboundItemIndex: row.inboundItemIndex,
        currentZohoPoNumber: row.zohoPurchaseOrderNumber,
        currentZohoPoId: row.zohoPurchaseOrderId,
        purchaseRequestId: row.purchaseRequestId || row.inboundDocId || undefined,
        fabricIndex: row.inboundItemIndex,
        quotationNo: row.dealId || row.poNumber || row.id,
        dealId: row.dealId || "",
        customerName: row.customerName || "",
        salesman: row.salesman || "Unknown",
        collectionBrand: row.itemName || "",
        itemName: row.itemName || "",
        serialNo: row.supplierCollectionCode || "N/A",
        hsnCode: "N/A",
        mrp: 0,
        vendorName: row.vendorName || "",
        neededQty: sanitizedQty,
        stock: 0,
        category: row.type === "furniture" ? "Furniture" : "Fabric",
        unit: fallbackUnit,
        supplierCollectionCode: row.supplierCollectionCode || undefined,
        supplierCollectionName: row.supplierCollectionName || undefined,
        detailedStockItem: row.stockDetail || {},
        stockDocId: undefined,
        productId: undefined,
        originalRequest: fallbackRequest,
      };
    });
  }, [selectedRows, user?.id, user?.name]);

  const handleVerificationConfirm = React.useCallback((nextIsNewVendor: boolean) => {
    setIsNewVendor(nextIsNewVendor);
    setIsVerificationOpen(false);
    setIsCreateZohoPoOpen(true);
  }, []);

  const submitInboundZohoPo = React.useCallback<CreatePoSubmitAction>(
    async (poData, creator) => {
      return recreateInboundZohoPurchaseOrderAction(poData, creator);
    },
    []
  );

  const columns: ColumnDef<FlattenedInboundItem>[] = [
    {
      id: "select",
      header: ({ table }) => {
        const visibleRows = table.getRowModel().rows.map((row) => row.original as FlattenedInboundItem);
        const firstEligiblePo = asTrimmedString(
          visibleRows.find(
            (row) =>
              !asTrimmedString(row.zohoPurchaseOrderNumber) &&
              asTrimmedString(row.poNumber)
          )?.poNumber
        );
        const targetPo = selectedPoNumber || firstEligiblePo;
        const selectableRows = visibleRows.filter(
          (row) =>
            !asTrimmedString(row.zohoPurchaseOrderNumber) &&
            asTrimmedString(row.poNumber) === targetPo
        );
        const selectedCount = selectableRows.filter((row) => !!rowSelection[row.id]).length;
        const allSelected = selectableRows.length > 0 && selectedCount === selectableRows.length;
        const partiallySelected = selectedCount > 0 && !allSelected;

        return (
          <Checkbox
            checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
            disabled={selectableRows.length === 0}
            onCheckedChange={(checked) => {
              setRowSelection((prev) => {
                const next = { ...prev };
                selectableRows.forEach((row) => {
                  if (checked) next[row.id] = true;
                  else delete next[row.id];
                });
                return next;
              });
            }}
            aria-label="Select all rows for same PO"
          />
        );
      },
      cell: ({ row }) => {
        const current = row.original;
        const checked = !!rowSelection[current.id];
        const disabled = !isRowEligibleForZohoRecreate(current) && !checked;
        return (
          <Checkbox
            checked={checked}
            disabled={disabled}
            onCheckedChange={(value) => toggleRowSelection(current, !!value)}
            aria-label="Select row"
          />
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
    { accessorKey:"dealId", header:"Order ID",
      cell:({ row }) => <Link href="#" className="font-bold text-primary hover:underline text-sm tabular-nums">{row.getValue("dealId")}</Link> },
    { accessorKey:"poNumber", header:"PO Number",
      cell:({ row }) => row.original.poNumber
        ? <button className="text-sm font-mono text-primary hover:underline font-semibold" onClick={() => { setActivePoNumber(row.original.poNumber!); setReceiveDialogOpen(true); }}>{row.original.poNumber}</button>
        : <span className="text-muted-foreground">â€”</span> },
    {
      accessorKey: "zohoPurchaseOrderNumber",
      header: "Zoho PO Number",
      cell: ({ row }) =>
        row.original.zohoPurchaseOrderNumber ? (
          <Badge variant="outline" className="text-xs font-medium border-emerald-200 bg-emerald-50 text-emerald-700">
            {row.original.zohoPurchaseOrderNumber}
          </Badge>
        ) : row.original.zohoSyncStatus === "failed" ? (
          <Badge
            variant="outline"
            className="text-xs border-red-200 bg-red-50 text-red-700"
            title={row.original.zohoSyncError}
          >
            Failed
          </Badge>
        ) : row.original.zohoSyncStatus === "pending" ? (
          <Badge variant="outline" className="text-xs border-amber-200 bg-amber-50 text-amber-700">
            Pending
          </Badge>
        ) : (
          <span className="text-xs text-amber-600">Not Created</span>
        ),
    },
    { accessorKey:"customerName", header:"Customer",
      cell:({ row }) => <span className="text-sm font-medium">{row.getValue("customerName")}</span> },
    { accessorKey:"itemName", header:"BCN / Item",
      cell:({ row }) => <span className="text-sm font-mono font-semibold">{row.getValue("itemName")}</span> },
    { accessorKey:"supplierCollectionName", header:"Collection",
      cell:({ row }) => (
        <div>
          {row.original.supplierCollectionName ? <p className="text-sm font-medium">{row.original.supplierCollectionName}</p> : <span className="text-muted-foreground text-sm">â€”</span>}
          {row.original.supplierCollectionCode && <p className="text-xs text-muted-foreground">{row.original.supplierCollectionCode}</p>}
        </div>
      )},
    { accessorKey:"quantity", header:"Qty",
      cell:({ row }) => <span className="text-sm font-bold tabular-nums">{row.getValue("quantity")}</span> },
    { accessorKey:"status", header:"Status",
      cell:({ row }) => {
        const s = row.original.status;
        return (
          <Badge variant="outline" className={cn("text-xs font-semibold gap-1",
            s==="Received" && "border-emerald-200 bg-emerald-50 text-emerald-700",
            s==="In Progress" && "border-amber-200 bg-amber-50 text-amber-700",
            s==="Pending Receiving" && "border-slate-200 bg-slate-50 text-slate-500"
          )}>
            {s==="Received" && <CheckCircle2 className="h-3 w-3" />}
            {s==="In Progress" && <Clock className="h-3 w-3" />}
            {s}
          </Badge>
        );
      }},
    { accessorKey:"createdAt", header:"Date",
      cell:({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{format(new Date(row.original.createdAt),"dd MMM yyyy")}</span> },
    { id:"actions",
      cell:({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0 data-[state=open]:bg-muted"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {row.original.poNumber && (
              <>
                <DropdownMenuItem onClick={() => { setActivePoNumber(row.original.poNumber!); setReceiveDialogOpen(true); }}>
                  <Package className="mr-2 h-4 w-4 text-muted-foreground" /> Receive Material
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => { setActiveDocket(row.original.docketNo||""); setTrackingOpen(true); }}
                  disabled={!row.original.docketNo}
                >
                  <Truck className="mr-2 h-4 w-4 text-muted-foreground" /> Track Shipment
                  {!row.original.docketNo && <span className="ml-auto text-[10px] text-muted-foreground">No docket</span>}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )},
  ];

  const table = useReactTable({
    data: tableData, columns,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter, state: { globalFilter },
  });

  const stats = React.useMemo(() => ({
    total: tableData.length,
    inProgress: tableData.filter((r) => r.status==="In Progress").length,
    pending: tableData.filter((r) => r.status==="Pending Receiving").length,
  }), [tableData]);

  const canRecreateZohoPo = React.useMemo(() => {
    if (selectedPendingPoItems.length === 0) return false;
    const po = asTrimmedString(selectedPendingPoItems[0]?.inboundDocId);
    if (!po) return false;
    return selectedPendingPoItems.every((item) => {
      const candidatePo = asTrimmedString(item.inboundDocId);
      const hasExistingZohoPo = asTrimmedString(item.currentZohoPoNumber);
      return candidatePo === po && !hasExistingZohoPo;
    });
  }, [selectedPendingPoItems]);

  const refreshInboundRows = () => {
    setRequests([]);
    setLastDoc(null);
    setHasMore(true);
    setLoading(false);
    fetchPage(true, true);
  };

  return (
    <>
      <div className="space-y-4">
        {mode === "pending" && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label:"Pending Receiving", value:stats.pending,    color:"bg-slate-600" },
              { label:"In Progress",       value:stats.inProgress, color:"bg-amber-500" },
              { label:"Total Items",       value:stats.total,      color:"bg-blue-600"  },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border bg-card p-4 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-shadow">
                <div className={cn("rounded-xl p-2.5 shrink-0", stat.color)}>
                  <Package className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                  <p className="text-2xl font-bold tabular-nums leading-tight mt-0.5">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <Card className="shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="relative w-full md:max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search order, customer, BCN..." value={globalFilter}
                    onChange={(e) => setGlobalFilter(e.target.value)} className="pl-9 h-9 text-sm" />
                  {globalFilter && (
                    <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setGlobalFilter("")}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="h-9 w-full md:w-44 text-sm"
                  aria-label="Filter from date"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="h-9 w-full md:w-44 text-sm"
                  aria-label="Filter to date"
                />
                {(dateFrom || dateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 md:h-8"
                    onClick={() => {
                      setDateFrom("");
                      setDateTo("");
                    }}
                  >
                    Clear dates
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedPendingPoItems.length > 0 ? (
                  <Badge variant="outline" className="text-xs font-medium">
                    Selected {selectedPendingPoItems.length} item(s) · PO {selectedPoNumber || "—"}
                  </Badge>
                ) : null}
                {selectedPendingPoItems.length > 0 && !canRecreateZohoPo ? (
                  <Badge variant="outline" className="text-xs border-amber-200 bg-amber-50 text-amber-700">
                    Select rows from same PO without Zoho PO number
                  </Badge>
                ) : null}
                {selectedPendingPoItems.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => setRowSelection({})}
                  >
                    Clear selection
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => setIsVerificationOpen(true)}
                  disabled={!canRecreateZohoPo}
                  className="gap-2"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Recreate Zoho PO
                </Button>
              </div>
            </div>

            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                      {hg.headers.map((h) => (
                        <TableHead key={h.id} className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground h-10">
                          {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {loading && requests.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{columns.map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded-md animate-pulse" /></TableCell>)}</TableRow>
                    ))
                  ) : table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row, idx) => (
                      <TableRow key={row.id} className={cn("transition-colors", idx%2===0 ? "bg-background" : "bg-muted/10", "hover:bg-primary/5")}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="py-2.5">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-36 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Box className="h-8 w-8 opacity-20" />
                          <p className="text-sm font-medium">No items found</p>
                          {globalFilter && <p className="text-xs">Try adjusting your search</p>}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {hasMore && (
              <div className="flex justify-center pt-1">
                <Button variant="outline" size="sm" onClick={() => fetchPage()} disabled={loading} className="text-xs">
                  {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  {loading ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
            {!hasMore && requests.length > 0 && (
              <p className="text-center text-xs text-muted-foreground py-1">
                All <span className="font-semibold">{requests.length}</span> items loaded
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <ReceiveDialog
        open={receiveDialogOpen}
        poNumber={activePoNumber}
        onClose={() => { setReceiveDialogOpen(false); setTimeout(() => setActivePoNumber(null), 200); }}
        user={user}
        toast={toast}
      />

      <DocketTrackingDialog
        open={trackingOpen}
        onClose={() => { setTrackingOpen(false); setActiveDocket(null); }}
        docketNo={activeDocket ?? ""}
      />

      <VendorVerificationDialog
        isOpen={isVerificationOpen}
        onClose={() => setIsVerificationOpen(false)}
        onConfirm={handleVerificationConfirm}
      />

      <CreatePoDialog
        isOpen={isCreateZohoPoOpen}
        onClose={() => setIsCreateZohoPoOpen(false)}
        items={selectedPendingPoItems}
        creator={user ? { id: user.id, name: user.name } : null}
        isNewVendor={isNewVendor}
        submitAction={submitInboundZohoPo}
        onSuccess={() => {
          setRowSelection({});
          setIsCreateZohoPoOpen(false);
          refreshInboundRows();
        }}
      />
    </>
  );
}
