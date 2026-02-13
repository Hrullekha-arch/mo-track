
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
import {
  arrayUnion,
  collection,
  doc,
  DocumentData,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryConstraint,
  QueryDocumentSnapshot,
  startAfter,
  where,
  writeBatch,
} from "firebase/firestore";
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
  originalRequest: PurchaseRequest;
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
const PAGE_SIZE = 20;
type InboundTableMode = "pending" | "completed";

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

export function InboundTable({ mode }: { mode: InboundTableMode }) {
  const [requests, setRequests] = React.useState<FlattenedInboundItem[]>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [receiveDialogOpen, setReceiveDialogOpen] = React.useState(false);
  const [activePoNumber, setActivePoNumber] = React.useState<string | null>(null);
  const [inboundRequest, setInboundRequest] = React.useState<InboundRequest | null>(null);
  const [receiveItems, setReceiveItems] = React.useState<ReceiveItem[]>([]);
  const [isLoadingInbound, setIsLoadingInbound] = React.useState(false);
  const [isReceiving, setIsReceiving] = React.useState(false);
  const [isPageLoading, setIsPageLoading] = React.useState(false);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [hasNextPage, setHasNextPage] = React.useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const pageRowsCacheRef = React.useRef<Map<number, FlattenedInboundItem[]>>(new Map());
  const pageLastDocRef = React.useRef<Map<number, QueryDocumentSnapshot<DocumentData> | null>>(new Map());
  const pageHasNextRef = React.useRef<Map<number, boolean>>(new Map());
  const stockCacheRef = React.useRef<Map<string, Stock>>(new Map());
  const inboundCacheRef = React.useRef<Map<string, InboundRequest>>(new Map());

  const chunkArray = React.useCallback(<T,>(arr: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }, []);

  const buildRowsForPage = React.useCallback(
    async (requestPage: PurchaseRequest[]): Promise<FlattenedInboundItem[]> => {
      const poRows = requestPage.flatMap((req) =>
        (req.fabricDetails || [])
          .filter((item) => !!item.poNumber)
          .map((item) => ({ req, item }))
      );

      const uniqueBcns = Array.from(
        new Set(poRows.map(({ item }) => item.fabricName).filter(Boolean))
      ) as string[];
      const uniquePoNumbers = Array.from(
        new Set(poRows.map(({ item }) => String(item.poNumber)).filter(Boolean))
      );

      const missingBcns = uniqueBcns.filter((bcn) => !stockCacheRef.current.has(bcn));
      const missingPoNumbers = uniquePoNumbers.filter((poNo) => !inboundCacheRef.current.has(poNo));

      if (missingBcns.length) {
        const stockChunks = chunkArray(missingBcns, 30);
        for (const chunk of stockChunks) {
          const stockQuery = query(collection(db, "stocks"), where("bcn", "in", chunk));
          const stockSnapshot = await getDocs(stockQuery);
          stockSnapshot.forEach((docSnap) => {
            const data = docSnap.data() as Stock;
            stockCacheRef.current.set(data.bcn, data);
          });
        }
      }

      if (missingPoNumbers.length) {
        const inboundChunks = chunkArray(missingPoNumbers, 30);
        for (const chunk of inboundChunks) {
          const inboundQuery = query(collection(db, "inbounds"), where(documentId(), "in", chunk));
          const inboundSnapshot = await getDocs(inboundQuery);
          inboundSnapshot.forEach((docSnap) => {
            inboundCacheRef.current.set(docSnap.id, docSnap.data() as InboundRequest);
          });
        }
      }

      const rows: FlattenedInboundItem[] = poRows.map(({ req, item }) => {
        const stockData = stockCacheRef.current.get(item.fabricName);
        const inboundData = inboundCacheRef.current.get(String(item.poNumber));
        const inboundItem = inboundData?.items?.find((i) => i.itemName === item.fabricName);
        const completedMilestones = inboundItem?.inboundMilestones || [];

        let statusText = "Pending Receiving";
        if (completedMilestones.length === INBOUND_PROCESS_CONFIG.length) {
          statusText = "Received";
        } else if (completedMilestones.length > 0) {
          const lastCompletedMilestone = [...completedMilestones].sort(
            (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
          )[0];
          const lastStepConfig = INBOUND_PROCESS_CONFIG.find((step) => step.id === lastCompletedMilestone.stepId);
          statusText = lastStepConfig?.name || "In Progress";
        } else if (INBOUND_PROCESS_CONFIG[0]?.name) {
          statusText = `Pending: ${INBOUND_PROCESS_CONFIG[0].name}`;
        }

        return {
          id: `${req.id}-${item.fabricName}`,
          dealId: req.dealId,
          poNumber: item.poNumber,
          customerName: req.customerName,
          salesman: req.salesman,
          status: statusText,
          createdAt: req.createdAt,
          itemName: item.fabricName,
          supplierCollectionName: stockData?.supplierCollectionName || "",
          supplierCollectionCode: stockData?.supplierCollectionCode || "",
          quantity: item.quantity,
          vendorName: item.vendorName,
          type: "fabric",
          originalRequest: req,
        };
      });

      return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    [chunkArray]
  );

  const loadPage = React.useCallback(
    async (targetPage: number) => {
      if (targetPage < 0) return;

      const cachedRows = pageRowsCacheRef.current.get(targetPage);
      if (cachedRows) {
        setRequests(cachedRows);
        setPageIndex(targetPage);
        setHasNextPage(pageHasNextRef.current.get(targetPage) ?? false);
        return;
      }

      const previousPageCursor =
        targetPage === 0 ? null : pageLastDocRef.current.get(targetPage - 1) ?? null;

      if (targetPage > 0 && !previousPageCursor) return;

      setIsPageLoading(true);

      try {
        const constraints: QueryConstraint[] = [orderBy("createdAt", "desc"), limit(PAGE_SIZE)];
        if (previousPageCursor) {
          constraints.push(startAfter(previousPageCursor));
        }

        const pageQuery = query(collection(db, "purchaseRequests"), ...constraints);
        const pageSnapshot = await getDocs(pageQuery);

        const requestPage = pageSnapshot.docs.map(
          (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as PurchaseRequest)
        );

        const rows = await buildRowsForPage(requestPage);
        const filteredRows = rows.filter((row) =>
          mode === "pending" ? row.status !== "Received" : row.status === "Received"
        );
        const lastDoc = pageSnapshot.docs.length
          ? pageSnapshot.docs[pageSnapshot.docs.length - 1]
          : null;
        const canLoadNext = pageSnapshot.docs.length === PAGE_SIZE;

        pageRowsCacheRef.current.set(targetPage, filteredRows);
        pageLastDocRef.current.set(targetPage, lastDoc);
        pageHasNextRef.current.set(targetPage, canLoadNext);

        setRequests(filteredRows);
        setPageIndex(targetPage);
        setHasNextPage(canLoadNext);
      } catch (error) {
        console.error("Failed to fetch inbound page", error);
        if (targetPage === 0) {
          setRequests([]);
        }
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not load inbound data.",
        });
      } finally {
        setIsPageLoading(false);
      }
    },
    [buildRowsForPage, mode, toast]
  );

  React.useEffect(() => {
    pageRowsCacheRef.current.clear();
    pageLastDocRef.current.clear();
    pageHasNextRef.current.clear();
    setRequests([]);
    setPageIndex(0);
    setHasNextPage(false);
    void loadPage(0);
  }, [loadPage, mode]);


  const openReceiveDialog = (poNumber?: string) => {
    if (!poNumber) return;
    setActivePoNumber(poNumber);
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
            actualQty: item.receivedQty || item.quantity,
            unit: item.unit || "Mtr",
            vendorName: inboundData.vendor,
            supplierCollectionName: stock?.supplierCollectionName,
            supplierCollectionCode: stock?.supplierCollectionCode,
            checked: false,
          };
        });
        setReceiveItems(items);
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
  };

  const handleActualQtyChange = (itemName: string, value: string) => {
    setReceiveItems((prev) =>
      prev.map((item) => (item.itemName === itemName ? { ...item, actualQty: value } : item))
    );
  };

  const selectedReceiveItems = React.useMemo(
    () => receiveItems.filter((item) => item.checked),
    [receiveItems]
  );

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
      const stickersHtml = selectedReceiveItems
        .map((item) => {
          const lengthValue = Number(item.actualQty) || 0;
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

    const parsedItems = selectedItems.map((item) => ({
      ...item,
      parsedQty: Number(item.actualQty),
    }));

    if (parsedItems.some((item) => !Number.isFinite(item.parsedQty) || item.parsedQty <= 0)) {
      toast({ variant: "destructive", title: "Invalid quantity", description: "Enter valid actual quantities." });
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
              {isPageLoading && requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading inbound data...
                    </div>
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows?.length ? (
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
        <div className="flex items-center justify-between py-4">
          <p className="text-sm text-muted-foreground">Page {pageIndex + 1}</p>
          <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadPage(pageIndex - 1)}
            disabled={isPageLoading || pageIndex === 0}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadPage(pageIndex + 1)}
            disabled={isPageLoading || !hasNextPage}
          >
            {isPageLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading
              </span>
            ) : (
              "Next"
            )}
          </Button>
          </div>
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
              <div className="grid grid-cols-[32px_1.2fr_1fr_1.3fr_120px_120px] gap-3 px-4 py-2 text-xs font-semibold text-muted-foreground border-b">
                <span />
                <span>Item Name</span>
                <span>Vendor Name</span>
                <span>Supplier code and name</span>
                <span>Expected qty</span>
                <span>Actual qty</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {receiveItems.map((item) => (
                  <div key={item.itemName} className="grid grid-cols-[32px_1.2fr_1fr_1.3fr_120px_120px] items-center gap-3 px-4 py-2 border-b last:border-b-0 text-sm">
                    <Checkbox checked={item.checked} onCheckedChange={(value) => handleToggleItem(item.itemName, !!value)} />
                    <span>{item.itemName}</span>
                    <span>{item.vendorName || inboundRequest.vendor || "-"}</span>
                    <span>{[item.supplierCollectionCode, item.supplierCollectionName].filter(Boolean).join(" ") || "-"}</span>
                    <span>{item.expectedQty}</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.actualQty}
                      onChange={(e) => handleActualQtyChange(item.itemName, e.target.value)}
                    />
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
                        <TableHead>Expected</TableHead>
                        <TableHead>Actual</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedReceiveItems.map((item) => (
                        <TableRow key={`preview-${item.itemName}`}>
                          <TableCell>{item.itemName}</TableCell>
                          <TableCell>{item.expectedQty}</TableCell>
                          <TableCell>{item.actualQty}</TableCell>
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
                      length={Number(item.actualQty) || 0}
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
