"use client";

import { useEffect, useState, use } from "react";
import {
  doc,
  onSnapshot,
  writeBatch,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  limit,
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  InboundRequest,
  InboundItem,
  InboundMilestone,
  PurchaseRequest,
  StockTransaction,
  Order,
  O2DProcess,
  O2DStatus,
  PurchaseStatus,
} from "@/lib/types";
import { INBOUND_PROCESS_CONFIG } from "@/lib/constants";
import { updateStockQuantityAction } from "@/app/dashboard/inventory/actions";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { dedupeO2DMilestones, upsertO2DMilestone } from "@/lib/o2d-milestones";

const buildMissingMilestones = (
  existing: InboundMilestone[],
  completedBy: string
) => {
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

export default function InboundReceivePage({
  params: paramsPromise,
}: {
  params: Promise<{ poNumber: string }>;
}) {
  const { poNumber } = use(paramsPromise);
  const [request, setRequest] = useState<InboundRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingIndex, setUpdatingIndex] = useState<number | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const docRef = doc(db, "inbounds", poNumber);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as InboundRequest;
        if (data.items) {
          data.items = data.items.map((item) => ({
            ...item,
            inboundMilestones: item.inboundMilestones || [],
          }));
        }
        setRequest(data);
      } else {
        setRequest(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [poNumber]);

  const handleReceive = async (itemIndex: number) => {
    if (!request || !user) return;
    const items = JSON.parse(JSON.stringify(request.items || [])) as InboundItem[];
    const itemToUpdate = items[itemIndex];
    if (!itemToUpdate) return;

    const existing = itemToUpdate.inboundMilestones || [];
    if (existing.length >= INBOUND_PROCESS_CONFIG.length) {
      toast({ title: "Already received", description: `${itemToUpdate.itemName} is already completed.` });
      return;
    }

    setUpdatingIndex(itemIndex);
    try {
      const requestRef = doc(db, "inbounds", request.id);
      const newMilestones = buildMissingMilestones(existing, user.name);
      itemToUpdate.inboundMilestones = [...existing, ...newMilestones];

      const batch = writeBatch(db);
      batch.update(requestRef, { items });

      const itemIsNowComplete =
        itemToUpdate.inboundMilestones.length === INBOUND_PROCESS_CONFIG.length;

      if (itemIsNowComplete) {
        const stockId = itemToUpdate.itemName.replace(/\//g, "-");
        const quantity = parseFloat(itemToUpdate.quantity);

        let salesman = "Unknown";
        if (request.purchaseRequestId) {
          const purchaseRequestRef = doc(db, "purchaseRequests", request.purchaseRequestId);
          const prDoc = await getDoc(purchaseRequestRef);
          salesman = prDoc.exists() ? (prDoc.data() as PurchaseRequest).salesman : "Unknown";
        }

        const transaction: Omit<StockTransaction, "id"> = {
          stockId,
          bcn: itemToUpdate.itemName,
          type: "addition",
          quantityChange: Number.isFinite(quantity) ? quantity : 0,
          poNumber: itemToUpdate.poNumber,
          unit: itemToUpdate.unit || "MTR",
          salesman,
          lengths: [Number.isFinite(quantity) ? quantity : 0],
          createdAt: new Date().toISOString(),
          createdBy: user.name,
          source: "INBOUND_RECEIVE",
          dealId: request.dealId,
          customerName: request.customerName,
          vendorName: request.vendor,
          purchaseRequestId: request.purchaseRequestId,
          inboundId: request.id,
          purchaseEntryStatus: "Pending",
        };

        const stockResult = await updateStockQuantityAction(stockId, transaction);
        if (stockResult.success) {
          toast({
            title: "Stock Updated",
            description: `${itemToUpdate.quantity} units of ${itemToUpdate.itemName} added to inventory.`,
          });
        } else {
          toast({ variant: "destructive", title: "Stock Update Failed", description: stockResult.message });
        }

        const orderQuery = query(
          collection(db, "orders"),
          where("crmOrderNo", "==", request.dealId),
          limit(1)
        );
        const orderSnapshot = await getDocs(orderQuery);
        if (!orderSnapshot.empty) {
          const orderDoc = orderSnapshot.docs[0];
          const orderRef = orderDoc.ref;
          const orderData = orderDoc.data() as Order;
          const fabricDetails = (orderData.fabricDetails || []).map((fabric) => {
            if (fabric.fabricName === itemToUpdate.itemName) {
              return { ...fabric, status: "in stock" as const };
            }
            return fabric;
          });
          batch.update(orderRef, { fabricDetails });
        }

        if (request.purchaseRequestId) {
          const purchaseRequestRef = doc(db, "purchaseRequests", request.purchaseRequestId);
          const receivingMilestone: PurchaseStatus = {
            stepId: 3,
            status: "completed",
            completedAt: new Date().toISOString(),
            completedBy: user.name,
            itemName: itemToUpdate.itemName,
          };
          batch.update(purchaseRequestRef, {
            poMilestones: arrayUnion(receivingMilestone),
          });
        }
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

        if (request.purchaseRequestId) {
          const purchaseRequestRef = doc(db, "purchaseRequests", request.purchaseRequestId);
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
                  const mergedMilestones = upsertO2DMilestone(
                    dedupeO2DMilestones((o2dData.milestones || []) as O2DStatus[]),
                    newMilestone
                  );
                  batch.update(o2dDocRef, { milestones: mergedMilestones });
                }
              }
            }
          }
        }
      }

      await batch.commit();
      toast({ title: "Received", description: `${itemToUpdate.itemName} marked as received.` });
    } catch (error) {
      console.error("Error receiving item:", error);
      toast({ variant: "destructive", title: "Receive Failed", description: "Could not receive this item." });
    } finally {
      setUpdatingIndex(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Material Receiving</h1>
        <p className="text-sm text-muted-foreground">PO Number: {poNumber}</p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading inbound items...
        </div>
      ) : !request ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No inbound request found for this PO.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(request.items || []).map((item, index) => {
                  const completedSteps = item.inboundMilestones?.length || 0;
                  const isComplete = completedSteps >= INBOUND_PROCESS_CONFIG.length;
                  return (
                    <TableRow key={`${item.itemName}-${index}`}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{item.itemName}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell>
                        {completedSteps}/{INBOUND_PROCESS_CONFIG.length}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isComplete ? "default" : "secondary"} className={isComplete ? "bg-green-600" : ""}>
                          {isComplete ? "Received" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          disabled={isComplete || updatingIndex === index}
                          onClick={() => handleReceive(index)}
                        >
                          {updatingIndex === index && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Receive
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
