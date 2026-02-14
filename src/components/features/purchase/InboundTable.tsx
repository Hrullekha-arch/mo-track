
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
import { MoreHorizontal, Loader2 } from "lucide-react";
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
import { InboundRequest, PurchaseRequest, PurchaseStatus, Stock, StockTransaction, InboundItem, Order, O2DProcess, O2DStatus } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Link from 'next/link';
import { collection, doc, documentId, getDoc, getDocs, query, where, writeBatch, arrayUnion, limit, orderBy, startAfter } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { INBOUND_PROCESS_CONFIG } from "@/lib/constants";
import { format } from "date-fns";
import { updateStockQuantityAction } from "@/app/dashboard/inventory/actions";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import JsBarcode from "jsbarcode";
import Image from "next/image";

interface FlattenedInboundItem {
  id: string; // Unique ID for the row
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
  type: 'fabric' | 'furniture';
  originalRequest?: PurchaseRequest;
}

type ReceiveItem = {
  itemName: string;
  expectedQty: string;
  actualQty: string;
  unit: string;
  vendorName?: string;
  supplierCollectionName?: string;
  supplierCollectionCode?: string;
  checked: boolean;
};

const parseQty = (value: string) => {
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : NaN;
};

const isQtyMatchingExpected = (actual: number, expected: number) => {
  return Math.abs(actual - expected) < 0.0001;
};

const buildMissingMilestones = (existing: InboundItem["inboundMilestones"], completedBy: string) => {
  const completedIds = new Set((existing || []).map((m) => m.stepId));
  const now = new Date().toISOString();
  return INBOUND_PROCESS_CONFIG.filter((step) => !completedIds.has(step.id)).map(
    (step) => ({
      stepId: step.id,
      status: "completed" as const,
      completedAt: now,
      completedBy,
    })
  );
};

const STICKER_WIDTH_PX = 288;
const STICKER_HEIGHT_PX = 192;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function InboundSticker({ bcn, length, name, code }: { bcn: string; length: number; name?: string; code?: string }) {
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
        console.error(`Failed to generate barcode for value: ${barcodeValue}`, e);
      }
    }
  }, [barcodeValue]);

  return (
    <div
      className="border border-gray-300 rounded-lg p-3 bg-white text-black flex flex-col items-center justify-between"
      style={{ width: `${STICKER_WIDTH_PX}px`, height: `${STICKER_HEIGHT_PX}px`, fontFamily: "Arial, sans-serif" }}
    >
      <div className="w-full flex justify-center">
        <div className="flex items-center justify-center rounded-md border border-slate-200 px-6 py-4">
          <Image src="/logo.png" alt="MO Logo" width={80} height={40} />
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-bold">{name} | {code}</p>
        <p className="text-xs uppercase text-slate-500">BCN</p>
        <p className="text-sm font-semibold">{bcn}</p>
      </div>
      <svg ref={barcodeRef} className="w-full max-w-[200px]" />
      <p className="text-sm font-semibold">Length: {length.toFixed(2)} Mtr</p>
    </div>
  );
}

export function InboundTable({ mode }: { mode: "pending" | "completed" }) {
  const [requests, setRequests] = React.useState<FlattenedInboundItem[]>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [receiveDialogOpen, setReceiveDialogOpen] = React.useState(false);
  const [activePoNumber, setActivePoNumber] = React.useState<string | null>(null);
  const [inboundRequest, setInboundRequest] = React.useState<InboundRequest | null>(null);
  const [receiveItems, setReceiveItems] = React.useState<ReceiveItem[]>([]);
  const [receiveQtyErrors, setReceiveQtyErrors] = React.useState<Record<string, string>>({});
  const [isLoadingInbound, setIsLoadingInbound] = React.useState(false);
  const [isReceiving, setIsReceiving] = React.useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const PAGE_SIZE = 20;
  const [lastDoc, setLastDoc] =React.useState<any>(null);
  const[hasMore, setHasMore] = React.useState(true);
  const [loading, setLoading] = React.useState(false);



  const fetchPage = async (force = false, resetCursor = false) => {
    if (loading || (!hasMore && !force)) return;
    setLoading(true);

    const statusFilter = mode === "completed" ? "Completed" : "Active";
    let q;
    if (lastDoc && !resetCursor) {
      q = query(
        collection(db,"inbounds"),
        where("status", "==", statusFilter),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
      );
    } else{
      q = query(
        collection(db ,"inbounds"),
        where("status", "==", statusFilter),
        orderBy("createdAt","desc"),
        limit(PAGE_SIZE)
      )
    }

    const snapshort = await getDocs(q);

    if (snapshort.empty){
      setLoading(false);
      setHasMore(false);
      return;
    }
    const newLastDoc = snapshort.docs[snapshort.docs.length -1];
    setLastDoc(newLastDoc);

    const pageData = snapshort.docs.map(doc =>({
      id: doc.id,
      ...doc.data(),

    }));

    await processPageData(pageData);
    setLoading(false);
  }

  // utlity Function helper
  function chunkArray(arr: any[], size: number) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}


  const processPageData = async (pageData: any[]) => {
    const filteredInbounds = pageData.filter((inbound) => {
      const status = String(inbound?.status || "").toLowerCase();
      if (mode === "completed") return status === "completed";
      return status !== "completed";
    });

    const allBcns = filteredInbounds.flatMap((inbound) =>
      (Array.isArray(inbound?.items) ? inbound.items : [])
        .map((item: any) => item?.itemName)
        .filter(Boolean)
    );

    const allPurchaseRequestIds = filteredInbounds
      .map((inbound) => inbound?.purchaseRequestId)
      .filter(Boolean);

    const uniqueBcns = [...new Set(allBcns)];
    const uniquePurchaseRequestIds = [...new Set(allPurchaseRequestIds)];

    const stockDataMap = new Map<string, Stock>();
    const purchaseRequestById = new Map<string, PurchaseRequest>();

    if (uniqueBcns.length > 0) {
      const stockChunks = chunkArray(uniqueBcns, 30);
      for (const chunk of stockChunks) {
        const stockQuery = query(collection(db, "stocks"), where("bcn", "in", chunk));
        const snap = await getDocs(stockQuery);
        snap.forEach((docSnap) => {
          const stockData = docSnap.data() as Stock;
          if (stockData?.bcn) stockDataMap.set(stockData.bcn, stockData);
        });
      }
    }

    if (uniquePurchaseRequestIds.length > 0) {
      const prChunks = chunkArray(uniquePurchaseRequestIds, 30);
      for (const chunk of prChunks) {
        const prQuery = query(
          collection(db, "purchaseRequests"),
          where(documentId(), "in", chunk)
        );
        const snap = await getDocs(prQuery);
        snap.forEach((docSnap) => {
          purchaseRequestById.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as PurchaseRequest);
        });
      }
    }

    const flattened: FlattenedInboundItem[] = filteredInbounds.flatMap((inbound: any) => {
      const poNumber = String(inbound?.id || "");
      const inboundItems = Array.isArray(inbound?.items) ? inbound.items : [];
      const purchaseRequestId = String(inbound?.purchaseRequestId || "");
      const purchaseRequest = purchaseRequestById.get(purchaseRequestId);
      const salesperson = purchaseRequest?.salesman || "Unknown";
      const inboundStatus = String(inbound?.status || "").toLowerCase();

      return inboundItems
        .map((item: any) => {
          const itemName = String(item?.itemName || "").trim();
          if (!itemName) return null;

          const stockData = stockDataMap.get(itemName);
          const completedMilestones = Array.isArray(item?.inboundMilestones)
            ? item.inboundMilestones
            : [];

          let statusText = "Pending Receiving";
          if (
            inboundStatus === "completed" ||
            completedMilestones.length >= INBOUND_PROCESS_CONFIG.length
          ) {
            statusText = "Received";
          } else if (completedMilestones.length > 0) {
            statusText = "In Progress";
          }

          if (mode === "completed" && statusText !== "Received") return null;
          if (mode === "pending" && statusText === "Received") return null;

          return {
            id: `${poNumber}-${itemName}`,
            dealId: String(inbound?.dealId || purchaseRequest?.dealId || ""),
            poNumber,
            customerName: String(inbound?.customerName || purchaseRequest?.customerName || ""),
            salesman: salesperson,
            status: statusText,
            createdAt: String(inbound?.createdAt || purchaseRequest?.createdAt || ""),
            itemName,
            supplierCollectionName: stockData?.supplierCollectionName || "",
            supplierCollectionCode: stockData?.supplierCollectionCode || "",
            quantity: String(item?.quantity ?? ""),
            vendorName: String(inbound?.vendor || ""),
            type: (purchaseRequest?.type || "fabric") as "fabric" | "furniture",
            originalRequest: purchaseRequest,
          } as FlattenedInboundItem;
        })
        .filter(Boolean) as FlattenedInboundItem[];
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
  const openReceiveDialog = (poNumber?: string) => {
    if (!poNumber) return;
    setActivePoNumber(poNumber);
    setReceiveQtyErrors({});
    setReceiveDialogOpen(true);
  };

  React.useEffect(() => {
    if (!receiveDialogOpen || !activePoNumber) return;
    const loadInbound = async () => {
      setIsLoadingInbound(true);
      try {
        const inboundSnap = await getDoc(doc(db, 'inbounds', activePoNumber));
        if (!inboundSnap.exists()) {
          setInboundRequest(null);
          setReceiveItems([]);
          return;
        }
        const inboundData = { id: inboundSnap.id, ...inboundSnap.data() } as InboundRequest;
        setInboundRequest(inboundData);

        const bcns = inboundData.items?.map((item) => item.itemName).filter(Boolean) || [];
        const stockDataMap = new Map<string, Stock>();
        if (bcns.length) {
          const chunks: string[][] = [];
          for (let i = 0; i < bcns.length; i += 30) {
            chunks.push(bcns.slice(i, i + 30));
          }
          for (const chunk of chunks) {
            const stockQuery = query(collection(db, 'stocks'), where('bcn', 'in', chunk));
            const stockSnapshot = await getDocs(stockQuery);
            stockSnapshot.forEach((docSnap) => {
              const data = docSnap.data() as Stock;
              stockDataMap.set(data.bcn, data);
            });
          }
        }

        const items: ReceiveItem[] = (inboundData.items || []).map((item) => {
          const stock = stockDataMap.get(item.itemName);
          return {
            itemName: item.itemName,
            expectedQty: item.quantity,
            actualQty: "",
            unit: item.unit || "Mtr",
            vendorName: inboundData.vendor,
            supplierCollectionName: stock?.supplierCollectionName,
            supplierCollectionCode: stock?.supplierCollectionCode,
            checked: false,
          };
        });
        setReceiveItems(items);
        setReceiveQtyErrors({});
      } catch (error) {
        console.error("Failed to load inbound request", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to load inbound request." });
      } finally {
        setIsLoadingInbound(false);
      }
    };

    loadInbound();
  }, [activePoNumber, receiveDialogOpen, toast]);

  const handleToggleItem = (itemName: string, checked: boolean) => {
    setReceiveItems((prev) =>
      prev.map((item) => (item.itemName === itemName ? { ...item, checked } : item))
    );
    if (!checked) {
      setReceiveQtyErrors((prev) => {
        if (!prev[itemName]) return prev;
        const { [itemName]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleActualQtyChange = (itemName: string, value: string) => {
    setReceiveItems((prev) =>
      prev.map((item) => (item.itemName === itemName ? { ...item, actualQty: value } : item))
    );
    setReceiveQtyErrors((prev) => {
      if (!prev[itemName]) return prev;
      const { [itemName]: _, ...rest } = prev;
      return rest;
    });
  };

  const validateReceiveItemQty = (item: ReceiveItem) => {
    const actual = parseQty(item.actualQty);
    const expected = parseQty(item.expectedQty);

    if (!Number.isFinite(actual) || actual <= 0) {
      return "Enter a valid receive qty.";
    }
    if (!Number.isFinite(expected) || expected <= 0) {
      return "Expected qty is invalid for this item.";
    }
    if (!isQtyMatchingExpected(actual, expected)) {
      return `Entered qty must match expected qty (${item.expectedQty}).`;
    }
    return "";
  };

  const selectedReceiveItems = React.useMemo(
    () => receiveItems.filter((item) => item.checked),
    [receiveItems]
  );

  const validateSelectedReceiveItems = (itemsToValidate: ReceiveItem[]) => {
    const errors: Record<string, string> = {};
    const parsedItems: Array<ReceiveItem & { parsedQty: number }> = [];

    itemsToValidate.forEach((item) => {
      const error = validateReceiveItemQty(item);
      if (error) {
        errors[item.itemName] = error;
        return;
      }
      parsedItems.push({
        ...item,
        parsedQty: parseQty(item.actualQty),
      });
    });

    return { errors, parsedItems };
  };

  const getBarcodeSvgMarkup = (barcodeValue: string) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, barcodeValue, {
      format: "CODE128",
      width: 1.6,
      height: 40,
      displayValue: false,
      margin: 0,
    });
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("preserveAspectRatio", "none");
    return svg.outerHTML;
  };

  const handlePrintStickers = () => {
    if (!selectedReceiveItems.length) {
      toast({
        variant: "destructive",
        title: "No items selected",
        description: "Check at least one item to print stickers.",
      });
      return;
    }

    const { errors, parsedItems } = validateSelectedReceiveItems(selectedReceiveItems);
    if (Object.keys(errors).length) {
      setReceiveQtyErrors((prev) => ({ ...prev, ...errors }));
      const firstError = Object.values(errors)[0];
      toast({
        variant: "destructive",
        title: "Invalid quantity",
        description: firstError,
      });
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Popup blocked",
        description: "Allow popups for this site to print stickers.",
      });
      return;
    }

    try {
      const logoSrc = `${window.location.origin}/logo.png`;
      const stickersHtml = parsedItems
        .map((item) => {
          const lengthValue = item.parsedQty;
          const collectionText = [item.supplierCollectionName, item.supplierCollectionCode]
            .filter(Boolean)
            .join(" | ");
          const barcodeValue = `${item.itemName}|${lengthValue.toFixed(2)}`;

          let barcodeMarkup = "";
          try {
            barcodeMarkup = getBarcodeSvgMarkup(barcodeValue);
          } catch (error) {
            console.error("Failed to generate barcode for sticker print:", error);
            barcodeMarkup = `<div class="barcode-fallback">${escapeHtml(barcodeValue)}</div>`;
          }

          return `
            <section class="sheet">
              <article class="sticker">
                <div class="sticker-header">
                  <img src="${logoSrc}" alt="MO Logo" class="logo" />
                </div>
                <div class="sticker-body">
                  <p class="name">${escapeHtml(collectionText || "Collection -")}</p>
                  <p class="label">BCN</p>
                  <p class="bcn">${escapeHtml(item.itemName)}</p>
                </div>
                <div class="barcode-wrap">
                  ${barcodeMarkup}
                </div>
                <p class="length">Length: ${lengthValue.toFixed(2)} ${escapeHtml(item.unit || "Mtr")}</p>
              </article>
            </section>
          `;
        })
        .join("");

      const html = `
        <html>
          <head>
            <title>Inbound Stickers</title>
            <style>
              * { box-sizing: border-box; }
              html, body {
                margin: 0;
                padding: 0;
                width: 100%;
                background: #ffffff;
                font-family: Arial, sans-serif;
              }
              @page {
                size: 3in 2in;
                margin: 0;
              }
              .sheet {
                width: 3in;
                height: 2in;
                page-break-after: always;
                break-after: page;
              }
              .sheet:last-child {
                page-break-after: auto;
                break-after: auto;
              }
              .sticker {
                width: 3in;
                height: 2in;
                border: 1px solid #111827;
                padding: 0.08in;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
              }
              .sticker-header {
                display: flex;
                justify-content: center;
              }
              .logo {
                width: 58px;
                height: 24px;
                object-fit: contain;
              }
              .sticker-body {
                text-align: center;
                margin-top: 0.02in;
              }
              .name {
                margin: 0;
                font-size: 9px;
                line-height: 1.15;
                font-weight: 700;
                min-height: 20px;
                overflow: hidden;
              }
              .label {
                margin: 0.03in 0 0;
                font-size: 8px;
                font-weight: 700;
                letter-spacing: 0.08em;
                color: #4b5563;
              }
              .bcn {
                margin: 0.015in 0 0;
                font-size: 13px;
                line-height: 1.15;
                font-weight: 700;
                word-break: break-word;
              }
              .barcode-wrap {
                width: 100%;
                height: 0.42in;
                margin-top: 0.04in;
              }
              .barcode-wrap svg {
                width: 100%;
                height: 100%;
                display: block;
              }
              .barcode-fallback {
                width: 100%;
                height: 100%;
                border: 1px dashed #6b7280;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                font-weight: 700;
                color: #111827;
                word-break: break-all;
                padding: 2px 4px;
              }
              .length {
                margin: 0.02in 0 0;
                font-size: 11px;
                line-height: 1.1;
                font-weight: 700;
                text-align: center;
              }
              @media print {
                html, body {
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
              }
            </style>
          </head>
          <body>
            ${stickersHtml}
          </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();

      const runPrint = () => {
        printWindow.focus();
        printWindow.print();
        setTimeout(() => printWindow.close(), 200);
      };

      if (printWindow.document.readyState === "complete") {
        setTimeout(runPrint, 300);
      } else {
        printWindow.onload = () => setTimeout(runPrint, 300);
      }
    } catch (error: any) {
      console.error("Print generation failed", error);
      toast({
        variant: "destructive",
        title: "Print failed",
        description: error?.message || "Could not prepare stickers for print.",
      });
      try {
        printWindow.close();
      } catch {
        // ignore
      }
    }
  };

  const handlePreviewAndReceive = async () => {
    if (!inboundRequest || !activePoNumber || !user) {
      toast({ variant: "destructive", title: "Missing data", description: "Select a PO and login." });
      return;
    }

    const selectedItems = selectedReceiveItems;
    if (!selectedItems.length) {
      toast({ variant: "destructive", title: "Select items", description: "Choose at least one item to receive." });
      return;
    }

    const { errors, parsedItems } = validateSelectedReceiveItems(selectedItems);
    if (Object.keys(errors).length) {
      setReceiveQtyErrors((prev) => ({ ...prev, ...errors }));
      const invalidItems = Object.keys(errors).slice(0, 3).join(", ");
      toast({
        variant: "destructive",
        title: "Invalid quantity",
        description: invalidItems
          ? `${invalidItems}: ${errors[Object.keys(errors)[0]]}`
          : "Enter valid quantities.",
      });
      return;
    }

    setIsReceiving(true);
    try {
      const requestRef = doc(db, "inbounds", inboundRequest.id);
      const items = JSON.parse(JSON.stringify(inboundRequest.items || [])) as InboundItem[];

      const receiveUpdates = new Map(parsedItems.map((item) => [item.itemName, item]));

      items.forEach((item) => {
        const update = receiveUpdates.get(item.itemName);
        if (!update) return;
        const existing = item.inboundMilestones || [];
        const newMilestones = buildMissingMilestones(existing, user.name);
        item.inboundMilestones = [...existing, ...newMilestones];
        (item as any).receivedQty = String(update.parsedQty);
      });

      const batch = writeBatch(db);
      batch.update(requestRef, { items });

      let salesman = "Unknown";
      if (inboundRequest.purchaseRequestId) {
        const purchaseRequestRef = doc(db, "purchaseRequests", inboundRequest.purchaseRequestId);
        const prDoc = await getDoc(purchaseRequestRef);
        if (prDoc.exists()) {
          salesman = (prDoc.data() as PurchaseRequest).salesman || salesman;
        }
      }

      for (const update of parsedItems) {
        const stockId = update.itemName.replace(/\//g, "-");
        const transaction: Omit<StockTransaction, "id"> = {
          stockId,
          bcn: update.itemName,
          type: "addition",
          quantityChange: update.parsedQty,
          poNumber: activePoNumber,
          salesman,
          lengths: [update.parsedQty],
          createdAt: new Date().toISOString(),
          createdBy: user.name,
          unit: update.unit,
        };

        const stockResult = await updateStockQuantityAction(stockId, transaction);
        if (!stockResult.success) {
          throw new Error(stockResult.message || "Stock update failed");
        }
      }

      if (inboundRequest.purchaseRequestId) {
        const purchaseRequestRef = doc(db, "purchaseRequests", inboundRequest.purchaseRequestId);
        const receivingMilestones: PurchaseStatus[] = parsedItems.map((item) => ({
          stepId: 3,
          status: "completed",
          completedAt: new Date().toISOString(),
          completedBy: user.name,
          itemName: item.itemName,
          quantity: String(item.parsedQty),
          poNumber: activePoNumber,
          vendorName: inboundRequest.vendor,
        }));
        batch.update(purchaseRequestRef, {
          poMilestones: arrayUnion(...receivingMilestones),
        });
      }

      const orderQuery = query(
        collection(db, "orders"),
        where("crmOrderNo", "==", inboundRequest.dealId),
        limit(1)
      );
      const orderSnapshot = await getDocs(orderQuery);
      if (!orderSnapshot.empty) {
        const orderDoc = orderSnapshot.docs[0];
        const orderData = orderDoc.data() as Order;
        const fabricDetails = (orderData.fabricDetails || []).map((fabric) => {
          if (receiveUpdates.has(fabric.fabricName)) {
            return { ...fabric, status: "in stock" as const };
          }
          return fabric;
        });
        batch.update(orderDoc.ref, { fabricDetails });
      }

      const allItemsComplete = items.every(
        (item) => (item.inboundMilestones?.length || 0) === INBOUND_PROCESS_CONFIG.length
      );
      if (allItemsComplete) {
        batch.update(requestRef, {
          status: "Completed",
          completedAt: new Date().toISOString(),
          completedBy: user.name,
        });

        if (inboundRequest.purchaseRequestId) {
          const purchaseRequestRef = doc(db, "purchaseRequests", inboundRequest.purchaseRequestId);
          batch.update(purchaseRequestRef, { status: "Completed" });

          const parentPurchaseRequestSnap = await getDoc(purchaseRequestRef);
          if (parentPurchaseRequestSnap.exists()) {
            const parentPR = parentPurchaseRequestSnap.data() as PurchaseRequest;
            const dealIdForQuery = parentPR.dealId;
            const allPrQuery = query(collection(db, "purchaseRequests"), where("dealId", "==", dealIdForQuery));
            const allPrSnapshot = await getDocs(allPrQuery);
            const allPrDocs = allPrSnapshot.docs.map((d) => d.data() as PurchaseRequest);
            const allPrsForDealAreComplete = allPrDocs.every((pr) => pr.status === "Completed");

            if (allPrsForDealAreComplete) {
              const o2dQuery = query(collection(db, "o2d"), where("dealId", "==", dealIdForQuery), limit(1));
              const o2dSnapshot = await getDocs(o2dQuery);
              if (!o2dSnapshot.empty) {
                const o2dDocRef = o2dSnapshot.docs[0].ref;
                const o2dData = (await getDoc(o2dDocRef)).data() as O2DProcess;
                const o2dStep = o2dData.milestones?.find((m) => m.stepId === 7);
                if (!o2dStep || o2dStep.status !== "completed") {
                  const newMilestone: O2DStatus = {
                    stepId: 7,
                    status: "completed",
                    completedAt: new Date().toISOString(),
                    completedBy: "System (All Inbounds Complete)",
                    remarks: "Automatically completed after all items for this deal were received.",
                    selection: "Done",
                  };
                  batch.update(o2dDocRef, { milestones: arrayUnion(newMilestone) });
                }
              }
            }
          }
        }
      }
      
      await batch.commit();
      
      toast({ title: "Received", description: "Inbound items received successfully." });
    } catch (error: any) {
      console.error("Receive failed", error);
      toast({ variant: "destructive", title: "Receive Failed", description: error.message || "Could not receive items." });
    } finally {
      setIsReceiving(false);
    }
  };

  const columns: ColumnDef<FlattenedInboundItem>[] = [
    {
      accessorKey: "dealId",
      header: "Order ID",
      cell: ({ row }) => {
        const poNumber = row.original.poNumber;
        const link ='#';
        return (
          <Button asChild variant="link" className="p-0 h-auto font-medium" disabled={!poNumber}>
            <Link href={link}>
              {row.getValue("dealId")}
            </Link>
          </Button>
        )
      },
    },
    { 
        accessorKey: "poNumber", 
        header: "PO Number",
        cell: ({ row }) => {
            const poNumber = row.original.poNumber;
            return poNumber ? (
                <Button variant="link" className="p-0 h-auto" onClick={() => openReceiveDialog(poNumber)}>
                    {poNumber}
                </Button>
            ) : null;
        }
    },
    { accessorKey: "customerName", header: "Customer Name" },
    { accessorKey: "itemName", header: "Item Name" },
    { accessorKey: "supplierCollectionName", header: "Supplier Collection" },
    { accessorKey: "supplierCollectionCode", header: "Supplier Code" },
    { accessorKey: "quantity", header: "Qty" },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
            const status = row.original.status;
            const isCompleted = status === 'Received';
            return <Badge variant={isCompleted ? 'default' : 'secondary'} className={isCompleted ? 'bg-green-600' : ''}>{status}</Badge>;
        }
    },
    { accessorKey: "createdAt", header: "Created Date", cell: ({ row }) => format(new Date(row.original.createdAt), 'dd/MM/yyyy') },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {row.original.poNumber && (
              <DropdownMenuItem onClick={() => openReceiveDialog(row.original.poNumber)}>
                Receive Material
              </DropdownMenuItem>
            )}
            {/* <DropdownMenuItem asChild>
                <Link href={`/dashboard/inbound/${row.original.poNumber}`}>
                    View Inbound Process
                </Link>
            </DropdownMenuItem> */}
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
    state: {
      globalFilter,
    },
  });

  return (
    <>
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center py-4">
          <Input
            placeholder="Search by Order, Customer, Item, or Supplier Collection..."
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="max-w-sm"
          />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No items pending for inbound processing.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-end space-x-2 py-4">
          {hasMore && (
          <button
            onClick={() => fetchPage()}
            disabled={loading}
          >
            {loading ? "Loading..." : "Load More"}
          </button>
        )}

        </div>
      </CardContent>
    </Card>

    <Dialog
      open={receiveDialogOpen}
      onOpenChange={(open) => {
        setReceiveDialogOpen(open);
        if (!open) {
          setActivePoNumber(null);
          setInboundRequest(null);
          setReceiveItems([]);
          setReceiveQtyErrors({});
        }
      }}
    >
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Receive material</DialogTitle>
          <DialogDescription>Verify quantities and receive inbound materials.</DialogDescription>
        </DialogHeader>
        {isLoadingInbound ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : inboundRequest ? (
          <div className="space-y-4">
            <div className="rounded-lg border px-4 py-3 text-sm">
              <div className="grid gap-2 md:grid-cols-3">
                <div><span className="text-muted-foreground">PO:</span> {activePoNumber || "-"}</div>
                <div><span className="text-muted-foreground">Deal ID:</span> {inboundRequest.dealId || "-"}</div>
                <div><span className="text-muted-foreground">Order ID:</span> {inboundRequest.purchaseRequestId || "-"}</div>
              </div>
            </div>

            <div className="rounded-lg border">
              <div className="grid grid-cols-[32px_1.3fr_1fr_1.4fr_150px] gap-3 px-4 py-2 text-xs font-semibold text-muted-foreground border-b">
                <span />
                <span>Item Name</span>
                <span>Vendor Name</span>
                <span>Supplier code and name</span>
                <span>Receive Qty</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {receiveItems.map((item) => (
                  <div key={item.itemName} className="grid grid-cols-[32px_1.3fr_1fr_1.4fr_150px] items-center gap-3 px-4 py-2 border-b last:border-b-0 text-sm">
                    <Checkbox checked={item.checked} onCheckedChange={(value) => handleToggleItem(item.itemName, !!value)} />
                    <span>{item.itemName}</span>
                    <span>{item.vendorName || inboundRequest.vendor || "-"}</span>
                    <span>{[item.supplierCollectionCode, item.supplierCollectionName].filter(Boolean).join(" ") || "-"}</span>
                    <div className="space-y-1">
                      <Input
                        type="number"
                        step="0.01"
                        value={item.actualQty}
                        onChange={(e) => handleActualQtyChange(item.itemName, e.target.value)}
                        onBlur={() => {
                          if (!item.checked) return;
                          const error = validateReceiveItemQty(item);
                          setReceiveQtyErrors((prev) => {
                            if (!error) {
                              const { [item.itemName]: _, ...rest } = prev;
                              return rest;
                            }
                            return { ...prev, [item.itemName]: error };
                          });
                          if (error) {
                            toast({
                              variant: "destructive",
                              title: "Wrong quantity",
                              description: `${item.itemName}: ${error}`,
                            });
                          }
                        }}
                        className={receiveQtyErrors[item.itemName] ? "border-red-500 focus-visible:ring-red-500" : ""}
                        placeholder="Enter qty"
                      />
                      {receiveQtyErrors[item.itemName] && (
                        <p className="text-xs text-red-600">{receiveQtyErrors[item.itemName]}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setReceiveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handlePreviewAndReceive} disabled={isReceiving}>
                {isReceiving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Receive selected items
              </Button>
            </div>

            {selectedReceiveItems.length > 0 && (
              <div className="space-y-4 border-t pt-4">
                <div>
                  <h3 className="text-sm font-semibold">Preview</h3>
                  <p className="text-xs text-muted-foreground">Checked items will be received in this batch.</p>
                </div>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        {/* <TableHead>Expected</TableHead> */}
                        <TableHead>Receive Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedReceiveItems.map((item) => (
                        <TableRow key={`preview-${item.itemName}`}>
                          <TableCell>{item.itemName}</TableCell>
                          <TableCell>{item.actualQty || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Barcode Stickers (3 x 2 in)</h4>
                  <Button variant="outline" onClick={handlePrintStickers}>Print Stickers</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border bg-muted/20 p-4">
                  {selectedReceiveItems.map((item) => (
                    <InboundSticker
                      key={`sticker-${item.itemName}`}
                      bcn={item.itemName}
                      length={parseQty(item.actualQty) || 0}
                      code={item.supplierCollectionCode || "-"}
                      name={item.supplierCollectionName || "-"}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">Inbound request not found.</div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
