
"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Link from 'next/link';
import { collection, doc, getDoc, getDocs, query, where, writeBatch, arrayUnion, limit } from "firebase/firestore";
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

function InboundSticker({ bcn, length }: { bcn: string; length: number }) {
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
        <div className="flex items-center justify-center rounded-md border border-slate-200 bg-slate-700 px-6 py-4">
          <Image src="/logo.png" alt="MO Logo" width={80} height={40} />
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs uppercase text-slate-500">BCN</p>
        <p className="text-sm font-semibold">{bcn}</p>
      </div>
      <svg ref={barcodeRef} className="w-full max-w-[200px]" />
      <p className="text-sm font-semibold">Length: {length.toFixed(2)} Mtr</p>
    </div>
  );
}

export function InboundTable({ tableData }: { tableData: PurchaseRequest[] }) {
  const [requests, setRequests] = React.useState<FlattenedInboundItem[]>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [receiveDialogOpen, setReceiveDialogOpen] = React.useState(false);
  const [activePoNumber, setActivePoNumber] = React.useState<string | null>(null);
  const [inboundRequest, setInboundRequest] = React.useState<InboundRequest | null>(null);
  const [receiveItems, setReceiveItems] = React.useState<ReceiveItem[]>([]);
  const [previewItems, setPreviewItems] = React.useState<ReceiveItem[]>([]);
  const [isLoadingInbound, setIsLoadingInbound] = React.useState(false);
  const [isReceiving, setIsReceiving] = React.useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  React.useEffect(() => {
    const processData = async () => {
        const allBcns = tableData.flatMap(req => (req.fabricDetails || []).map(item => item.fabricName));
        const uniqueBcns = [...new Set(allBcns)];
        const stockDataMap = new Map<string, Stock>();

        if (uniqueBcns.length > 0) {
            const chunks: string[][] = [];
            for (let i = 0; i < uniqueBcns.length; i += 30) {
                chunks.push(uniqueBcns.slice(i, i + 30));
            }
            for (const chunk of chunks) {
                const stockQuery = query(collection(db, 'stocks'), where('bcn', 'in', chunk));
                const stockSnapshot = await getDocs(stockQuery);
                stockSnapshot.forEach(doc => {
                    stockDataMap.set(doc.data().bcn, doc.data() as Stock);
                });
            }
        }

        const flattenedDataPromises = tableData.flatMap(req => {
            const itemsWithPo = (req.fabricDetails || []).filter(item => !!item.poNumber);

            return itemsWithPo.map(async item => {
                let statusText = 'Pending Receiving'; // Default status
                const stockData = stockDataMap.get(item.fabricName);

                if (item.poNumber) {
                    const inboundRef = doc(db, 'inbounds', item.poNumber);
                    try {
                        const inboundSnap = await getDoc(inboundRef);
                        if (inboundSnap.exists()) {
                            const inboundData = inboundSnap.data() as InboundRequest;
                            const inboundItem = inboundData.items.find(i => i.itemName === item.fabricName);
                            const completedMilestones = (inboundItem?.inboundMilestones || []);
                            const completedStepsCount = completedMilestones.length;

                            if (completedStepsCount === INBOUND_PROCESS_CONFIG.length) {
                                statusText = 'Received';
                            } else if (completedStepsCount > 0) {
                                const lastCompletedMilestone = completedMilestones.sort((a,b) => new Date(b.completedAt).getTime() - new Date(a.createdAt).getTime())[0];
                                const lastStepConfig = INBOUND_PROCESS_CONFIG.find(step => step.id === lastCompletedMilestone.stepId);
                                statusText = lastStepConfig?.name || "In Progress";
                            } else {
                                statusText = INBOUND_PROCESS_CONFIG[0]?.name ? `Pending: ${INBOUND_PROCESS_CONFIG[0].name}` : "Pending Receiving";
                            }
                        }
                    } catch (e) {
                        statusText = "Error fetching status";
                    }
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
                    supplierCollectionName: stockData?.supplierCollectionName || '',
                    supplierCollectionCode: stockData?.supplierCollectionCode || '',
                    quantity: item.quantity,
                    vendorName: item.vendorName,
                    type: 'fabric' as const,
                    originalRequest: req,
                };
            });
        });
        const flattenedData = await Promise.all(flattenedDataPromises);
        setRequests(flattenedData.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    };
    
    processData();
  }, [tableData]);

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
        setPreviewItems([]);
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

  const handlePrintStickers = () => {
    const printContent = document.getElementById('inbound-sticker-print-area');
    if (!printContent) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const styles = `
      <style>
        @media print {
          @page { size: 3in 2in; margin: 0; }
          body { margin: 0; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; }
          .sticker-grid {
            display: grid !important;
            grid-template-columns: repeat(auto-fit, minmax(288px, 1fr));
            gap: 12px;
          }
        }
      </style>
    `;

    printWindow.document.write('<html><head><title>Inbound Stickers</title>');
    printWindow.document.write(styles);
    printWindow.document.write('</head><body>');
    printWindow.document.write(printContent.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handlePreviewAndReceive = async () => {
    if (!inboundRequest || !activePoNumber || !user) {
      toast({ variant: "destructive", title: "Missing data", description: "Select a PO and login." });
      return;
    }

    const selectedItems = receiveItems.filter((item) => item.checked);
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
      setPreviewItems(selectedItems);
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
    getPaginationRowModel: getPaginationRowModel(),
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
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button>
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
          setPreviewItems([]);
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
                Preview and receive
              </Button>
            </div>

            {previewItems.length > 0 && (
              <div className="space-y-4 border-t pt-4">
                <div>
                  <h3 className="text-sm font-semibold">Preview</h3>
                  <p className="text-xs text-muted-foreground">Checked items received in this batch.</p>
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
                      {previewItems.map((item) => (
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
                  <h4 className="text-sm font-semibold">Barcode Stickers (3 × 2 in)</h4>
                  <Button variant="outline" onClick={handlePrintStickers}>Print Stickers</Button>
                </div>
                <div id="inbound-sticker-print-area" className="sticker-grid grid grid-cols-1 md:grid-cols-2 gap-4">
                  {previewItems.map((item) => (
                    <InboundSticker
                      key={`sticker-${item.itemName}`}
                      bcn={item.itemName}
                      length={Number(item.actualQty) || 0}
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
