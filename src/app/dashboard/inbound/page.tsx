
"use client";

import { useState, useEffect } from "react";
import { InboundTable } from '@/components/features/purchase/InboundTable';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { FileText, Search, MoreHorizontal, PackageCheck, Loader2, CheckCircle2 } from "lucide-react";
import { collectionGroup, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { DealVisit } from "@/lib/types";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { DialogDescription, DialogFooter } from "@/components/ui/dialog";

const COMPLAINT_TYPE_LABELS: Record<string, string> = {
  "product-defect": "Product Defect",
  "installation-issue": "Installation Issue",
  "measurement-error": "Measurement Error",
  "color-mismatch": "Color Mismatch",
  "damaged-delivery": "Damaged During Delivery",
  "delay-complaint": "Delay Complaint",
  "other-complaint": "Other",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function ComplaintVisitDetailDialog({ visit, open, onClose }: { visit: DealVisit | null; open: boolean; onClose: () => void }) {
  if (!visit) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complaint Visit Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Deal ID</p>
              <p className="font-medium">{visit.dealId || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Date</p>
              <p className="font-medium">
                {visit.createdAt ? format(new Date(visit.createdAt), "dd MMM yyyy, hh:mm a") : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Customer Name</p>
              <p className="font-medium">{visit.customerSnapshot?.name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Salesman</p>
              <p className="font-medium">{visit.assignedSalesPerson?.name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Item</p>
              <p className="font-medium">{visit.complaintItem || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Quantity</p>
              <p className="font-medium">{visit.complaintQuantity || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Complaint Type</p>
              {visit.complaintType
                ? <Badge variant="secondary">{COMPLAINT_TYPE_LABELS[visit.complaintType] || visit.complaintType}</Badge>
                : <p className="font-medium">—</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Priority</p>
              {visit.complaintPriority
                ? <Badge variant="outline">{PRIORITY_LABELS[visit.complaintPriority] || visit.complaintPriority}</Badge>
                : <p className="font-medium">—</p>}
            </div>
          </div>
          {visit.complaintDescription && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Complaint Description</p>
              <p className="text-sm leading-relaxed">{visit.complaintDescription}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const PROBLEM_RESOLUTION_TYPES = ["installation-issue", "measurement-error", "color-mismatch", "damaged-delivery"];
const CREDIT_NOTE_TYPES = ["product-defect", "delay-complaint"];

function ReceiveMaterialDialog({ visit, open, onClose }: { visit: DealVisit | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [receiving, setReceiving] = useState(false);
  // Problem/Resolution fields
  const [problem, setProblem] = useState("");
  const [resolution, setResolution] = useState("");
  // Color mismatch fields
  const [colorReceived, setColorReceived] = useState("");
  const [colorExpected, setColorExpected] = useState("");
  const [colorOtherSpecs, setColorOtherSpecs] = useState("");
  // Credit note fields
  const [creditNoteNumber, setCreditNoteNumber] = useState("");
  const [creditNoteGenerated, setCreditNoteGenerated] = useState(false);

  useEffect(() => {
    if (open) {
      setProblem("");
      setResolution("");
      setColorReceived("");
      setColorExpected("");
      setColorOtherSpecs("");
      setCreditNoteNumber("");
      setCreditNoteGenerated(false);
    }
  }, [open]);

  if (!visit) return null;

  const alreadyReceived = !!(visit as any).complianceReceivedAt;
  const complaintType = visit.complaintType || "";
  const isProblemResolution = PROBLEM_RESOLUTION_TYPES.includes(complaintType);
  const isCreditNote = CREDIT_NOTE_TYPES.includes(complaintType);

  const handleReceive = async () => {
    if (!visit.customerId || !visit.dealId || !visit.id) {
      toast({ variant: "destructive", title: "Missing visit path info" });
      return;
    }
    if (complaintType === "color-mismatch" && !colorReceived.trim()) {
      toast({ variant: "destructive", title: "Please specify the colour received" });
      return;
    }
    if (isProblemResolution && complaintType !== "color-mismatch" && !problem.trim()) {
      toast({ variant: "destructive", title: "Please describe the problem" });
      return;
    }
    if (isCreditNote && !creditNoteNumber.trim()) {
      toast({ variant: "destructive", title: "Please enter the credit note number" });
      return;
    }
    setReceiving(true);
    try {
      const visitRef = doc(db, "customers", visit.customerId, "deals", visit.dealId, "visits", visit.id);
      await updateDoc(visitRef, {
        complianceReceived: true,
        complianceReceivedAt: new Date().toISOString(),
        ...(complaintType === "color-mismatch" && {
          complianceColorReceived: colorReceived.trim(),
          complianceColorExpected: colorExpected.trim(),
          complianceColorOtherSpecs: colorOtherSpecs.trim(),
        }),
        ...(isProblemResolution && complaintType !== "color-mismatch" && {
          complianceProblem: problem.trim(),
          complianceResolution: resolution.trim(),
        }),
        ...(isCreditNote && {
          complianceCreditNoteNumber: creditNoteNumber.trim(),
          complianceCreditNoteGenerated: creditNoteGenerated,
        }),
      });
      toast({ title: "Material Received", description: `Complaint for ${visit.customerSnapshot?.name || visit.dealId} marked as received.` });
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
    } finally {
      setReceiving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receive Material</DialogTitle>
          <DialogDescription>
            {COMPLAINT_TYPE_LABELS[complaintType] || "Complaint"} — {visit.customerSnapshot?.name || visit.dealId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm py-1">
          {/* Summary row */}
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Deal ID</p>
              <p className="font-medium">{visit.dealId || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Customer</p>
              <p className="font-medium">{visit.customerSnapshot?.name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Item</p>
              <p className="font-medium">{visit.complaintItem || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Qty</p>
              <p className="font-medium">{visit.complaintQuantity || "—"}</p>
            </div>
          </div>

          {alreadyReceived ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-emerald-700">Already Received</p>
                <p className="text-xs text-emerald-600">
                  {format(new Date((visit as any).complianceReceivedAt), "dd MMM yyyy, hh:mm a")}
                </p>
                {(visit as any).complianceColorReceived && (
                  <p className="text-xs text-emerald-600 mt-1">Colour Received: {(visit as any).complianceColorReceived}</p>
                )}
                {(visit as any).complianceColorExpected && (
                  <p className="text-xs text-emerald-600 mt-1">Expected Colour: {(visit as any).complianceColorExpected}</p>
                )}
                {(visit as any).complianceColorOtherSpecs && (
                  <p className="text-xs text-emerald-600 mt-1">Other Specs: {(visit as any).complianceColorOtherSpecs}</p>
                )}
                {(visit as any).complianceProblem && (
                  <p className="text-xs text-emerald-600 mt-1">Problem: {(visit as any).complianceProblem}</p>
                )}
                {(visit as any).complianceCreditNoteNumber && (
                  <p className="text-xs text-emerald-600 mt-1">Credit Note: {(visit as any).complianceCreditNoteNumber}</p>
                )}
              </div>
            </div>
          ) : complaintType === "color-mismatch" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">What colour you have received? <span className="text-destructive">*</span></label>
                <Textarea
                  placeholder="e.g. Off White, Beige..."
                  value={colorReceived}
                  onChange={(e) => setColorReceived(e.target.value)}
                  className="resize-none min-h-[80px]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">What is your expected colour?</label>
                <Textarea
                  placeholder="e.g. Ivory White, #F5F5DC..."
                  value={colorExpected}
                  onChange={(e) => setColorExpected(e.target.value)}
                  className="resize-none min-h-[80px]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">What are your other specifications?</label>
                <Textarea
                  placeholder="Any other details about the colour or material..."
                  value={colorOtherSpecs}
                  onChange={(e) => setColorOtherSpecs(e.target.value)}
                  className="resize-none min-h-[80px]"
                />
              </div>
            </div>
          ) : isProblemResolution ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">What is the problem? <span className="text-destructive">*</span></label>
                <Textarea
                  placeholder="Describe the issue in detail..."
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  className="resize-none min-h-[80px]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">How is it going to be resolved?</label>
                <Textarea
                  placeholder="Describe the resolution plan..."
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="resize-none min-h-[80px]"
                />
              </div>
            </div>
          ) : isCreditNote ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Credit Note Number <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  placeholder="Enter credit note number..."
                  value={creditNoteNumber}
                  onChange={(e) => setCreditNoteNumber(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5">
                <input
                  type="checkbox"
                  id="creditNoteGenerated"
                  checked={creditNoteGenerated}
                  onChange={(e) => setCreditNoteGenerated(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <label htmlFor="creditNoteGenerated" className="text-xs font-medium cursor-pointer">
                  Credit note has been generated and issued to the customer
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Additional Notes (optional)</label>
              <Textarea
                placeholder="Add any notes..."
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                className="resize-none min-h-[80px]"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={receiving}>Cancel</Button>
          {!alreadyReceived && (
            <Button onClick={handleReceive} disabled={receiving}>
              {receiving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <PackageCheck className="mr-2 h-4 w-4" />
              Mark as Received
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ComplianceInboundTable() {
  const [visits, setVisits] = useState<DealVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DealVisit | null>(null);
  const [receivingVisit, setReceivingVisit] = useState<DealVisit | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collectionGroup(db, "visits"),
      (snapshot) => {
        const data = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as DealVisit))
          .filter((v) => v.typeOfVisit === "complaint" && v.status === "completed");
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setVisits(data);
        setLoading(false);
      },
      (error) => {
        console.error("[ComplianceInbound] Firestore error:", error.code, error.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const filtered = visits.filter((v) => {
    const q = search.toLowerCase();
    return (
      v.customerSnapshot?.name?.toLowerCase().includes(q) ||
      v.dealId?.toLowerCase().includes(q) ||
      v.assignedSalesPerson?.name?.toLowerCase().includes(q) ||
      v.complaintItem?.toLowerCase().includes(q) ||
      v.complaintType?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search customer, deal, salesman..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs uppercase text-muted-foreground">Deal ID</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Customer</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Salesman</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Item</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Qty</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Complaint Type</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Priority</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Description</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Status</TableHead>
              <TableHead className="text-xs uppercase text-muted-foreground">Date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(11)].map((__, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full bg-muted animate-pulse rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-16 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-25" />
                  {search ? "No results match your search." : "No complaint visits yet."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((v) => {
                const isReceived = !!(v as any).complianceReceivedAt;
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.dealId || "—"}</TableCell>
                    <TableCell>{v.customerSnapshot?.name || "—"}</TableCell>
                    <TableCell>{v.assignedSalesPerson?.name || "—"}</TableCell>
                    <TableCell>{v.complaintItem || "—"}</TableCell>
                    <TableCell>{v.complaintQuantity || "—"}</TableCell>
                    <TableCell>
                      {v.complaintType
                        ? <Badge variant="secondary" className="text-xs">{COMPLAINT_TYPE_LABELS[v.complaintType] || v.complaintType}</Badge>
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {v.complaintPriority
                        ? <Badge variant="outline" className="text-xs">{PRIORITY_LABELS[v.complaintPriority] || v.complaintPriority}</Badge>
                        : "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {v.complaintDescription || "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      {isReceived ? (
                        <Badge className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Received
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {v.createdAt ? format(new Date(v.createdAt), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setReceivingVisit(v)}>
                            <PackageCheck className="w-4 h-4 mr-2" />
                            Receive Material
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSelected(v)}>
                            <FileText className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ReceiveMaterialDialog
        visit={receivingVisit}
        open={!!receivingVisit}
        onClose={() => setReceivingVisit(null)}
      />
      <ComplaintVisitDetailDialog
        visit={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

export default function InboundPage() {
  const [mode, setMode] = useState<"pending" | "completed" | "compliance">("pending");

  return (
    <div className="space-y-4 p-4 md:p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Inbound Materials</h1>
        <p className="text-muted-foreground">
          A log of all materials for which a Purchase Order has been generated.
        </p>
      </header>

      <Tabs
        value={mode}
        onValueChange={(value) => setMode(value as "pending" | "completed" | "compliance")}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending">Pending Inbound</TabsTrigger>
          <TabsTrigger value="completed">Completed Inbound</TabsTrigger>
          <TabsTrigger value="compliance">Compliance Inbound</TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "compliance" ? (
        <ComplianceInboundTable />
      ) : (
        <InboundTable mode={mode} />
      )}
    </div>
  );
}
