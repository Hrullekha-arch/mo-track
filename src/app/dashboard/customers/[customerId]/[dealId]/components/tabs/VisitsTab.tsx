"use client";

import { useState, useEffect, useCallback, useMemo, memo, useTransition } from "react";
import { Customer, DealVisit, DealOrder, Selection, User } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar, Eye, Loader2 } from "lucide-react";
import { VisitForm } from "@/app/dashboard/customers/[customerId]/[dealId]/dialogs.tsx/VisitForm";
import {
  getVisitsForDeal,
  getOrdersForDeal,
  getSelectionsForDeal,
} from "../../actions";
import { getSalesmen } from "../../../../actions";
import { parseDateNullable } from "../../utils/dateUtils";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

// ═══════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════

interface VisitsTabProps {
  customerId: string;
  dealId: string;
  customers: Customer[];
}

const DATE_FORMAT_FULL = "PPP p";
const DATE_FORMAT_SHORT = "dd/MM/yy";

// ═══════════════════════════════════════════════════════════
// PURE HELPER FUNCTIONS (Zero Dependencies)
// ═══════════════════════════════════════════════════════════

const asArray = (val: unknown): any[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  
  return [];
};

const safeFormat = (val: any, fmt: string = DATE_FORMAT_FULL): string => {
  const date = parseDateNullable(val);
  if (!date) return "N/A";
  
  try {
    return format(date, fmt);
  } catch {
    return "N/A";
  }
};

const getRepName = (salesmen: User[], repIdOrName: any): string => {
  const found = salesmen.find((s) => s.id === repIdOrName);
  return found?.name || repIdOrName || "-";
};

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export default function VisitsTab({
  customers,
  customerId,
  dealId,
}: VisitsTabProps) {
  const [isPending, startTransition] = useTransition();

  // ─── Core State ──────────────────────────────────────────
  const [salesmen, setSalesmen] = useState<User[]>([]);
  const [visits, setVisits] = useState<DealVisit[]>([]);
  const [orders, setOrders] = useState<DealOrder[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<DealVisit | null>(null);

  // ─── Loading States ──────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [formDataLoading, setFormDataLoading] = useState(false);

  // ─── Memoized Values ─────────────────────────────────────
  
  const customer = useMemo(() => customers?.[0], [customers]);
  
  const hasVisits = visits.length > 0;

  // Create a salesmen lookup map for O(1) access
  const salesmenMap = useMemo(() => {
    const map = new Map<string, User>();
    salesmen.forEach((s) => {
      if (s.id) map.set(s.id, s);
    });
    return map;
  }, [salesmen]);

  // ─── Data Fetching (Optimized) ───────────────────────────

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setFormDataLoading(true);

    try {
      // Parallel fetch all data
      const [salesmenData, visitsData, ordersData, selectionsData] = 
        await Promise.all([
          getSalesmen(),
          getVisitsForDeal(customerId, dealId),
          getOrdersForDeal(customerId, dealId),
          getSelectionsForDeal(customerId, dealId),
        ]);

      // Use startTransition for non-urgent updates
      startTransition(() => {
        setSalesmen(salesmenData || []);
        setVisits(visitsData || []);
        setOrders(ordersData || []);
        setSelections(selectionsData || []);
      });
    } catch (error) {
      console.error("Fetch Visits Error:", error);
    } finally {
      setFormDataLoading(false);
      setLoading(false);
    }
  }, [customerId, dealId]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // ─── Event Handlers ──────────────────────────────────────

  const handleVisitAdded = useCallback(async () => {
    await fetchAllData();
  }, [fetchAllData]);

  const handleViewVisit = useCallback((visit: DealVisit) => {
    setSelectedVisit(visit);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setSelectedVisit(null);
  }, []);

  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Visit Form */}
      <VisitForm
        customer={customer}
        customerId={customerId}
        dealId={dealId}
        onVisitAdded={handleVisitAdded}
        visits={visits}
        orders={orders}
        selections={selections}
        formDataLoading={formDataLoading}
      />

      {/* Visit History Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Visit History</CardTitle>
        </CardHeader>

        <CardContent>
          {loading ? (
            <LoadingState />
          ) : hasVisits ? (
            <VisitsTable
              visits={visits}
              salesmenMap={salesmenMap}
              onViewVisit={handleViewVisit}
            />
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>

      {/* Visit Details Dialog */}
      {selectedVisit && (
        <VisitDetailsDialog
          visit={selectedVisit}
          onClose={handleCloseDialog}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTS (Memoized & Optimized)
// ═══════════════════════════════════════════════════════════

const LoadingState = memo(function LoadingState() {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 3 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 8 }).map((_, j) => (
                <TableCell key={j}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
});

const EmptyState = memo(function EmptyState() {
  return (
    <div className="text-center py-10">
      <Calendar className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
      <p className="text-muted-foreground">
        No visits found for this deal.
      </p>
    </div>
  );
});

interface VisitsTableProps {
  visits: DealVisit[];
  salesmenMap: Map<string, User>;
  onViewVisit: (visit: DealVisit) => void;
}

const VisitsTable = memo(function VisitsTable({
  visits,
  salesmenMap,
  onViewVisit,
}: VisitsTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead>Representative</TableHead>
            <TableHead>Created By</TableHead>
            <TableHead className="w-24">Created At</TableHead>
            <TableHead className="w-20">Details</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {visits.map((visit, index) => (
            <VisitRow
              key={visit.id}
              visit={visit}
              index={index}
              salesmenMap={salesmenMap}
              onView={onViewVisit}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
});

interface VisitRowProps {
  visit: DealVisit;
  index: number;
  salesmenMap: Map<string, User>;
  onView: (visit: DealVisit) => void;
}

const VisitRow = memo(function VisitRow({
  visit,
  index,
  salesmenMap,
  onView,
}: VisitRowProps) {
  const handleView = useCallback(() => {
    onView(visit);
  }, [visit, onView]);

  // O(1) lookup using Map
  const repName = useMemo(() => {
    const repId = visit.assignedSalesPerson?.id || visit.assignedSalesPerson?.name;
    const found = repId ? salesmenMap.get(repId) : null;
    return found?.name || repId || "-";
  }, [visit.assignedSalesPerson, salesmenMap]);

  const formattedDueDate = useMemo(
    () => visit.dueDate ? safeFormat(visit.dueDate, DATE_FORMAT_FULL) : "Not Set",
    [visit.dueDate]
  );

  const formattedCreatedAt = useMemo(
    () => safeFormat(visit.createdAt, DATE_FORMAT_SHORT),
    [visit.createdAt]
  );

  return (
    <TableRow>
      <TableCell>{index + 1}</TableCell>
      
      <TableCell className="capitalize">
        {visit.typeOfVisit}
      </TableCell>

      <TableCell>{formattedDueDate}</TableCell>

      <TableCell>
        <Badge variant="outline" className="capitalize">
          {visit.status || "requested"}
        </Badge>
      </TableCell>

      <TableCell>{repName}</TableCell>

      <TableCell>{visit.createdBy}</TableCell>

      <TableCell>{formattedCreatedAt}</TableCell>

      <TableCell>
        <Button
          size="sm"
          variant="outline"
          onClick={handleView}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}, (prev, next) => 
  prev.visit.id === next.visit.id &&
  prev.index === next.index &&
  prev.salesmenMap === next.salesmenMap
);

interface VisitDetailsDialogProps {
  visit: DealVisit;
  onClose: () => void;
}

const VisitDetailsDialog = memo(function VisitDetailsDialog({
  visit,
  onClose,
}: VisitDetailsDialogProps) {
  const isMeasurement = visit.typeOfVisit === "measurement";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Visit Details</DialogTitle>
          <DialogDescription>
            Visit on {visit.dueDate ? safeFormat(visit.dueDate) : "N/A"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isMeasurement ? (
            <MeasurementDetails visit={visit} />
          ) : (
            <DeliveryDetails visit={visit} />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

const MeasurementDetails = memo(function MeasurementDetails({ 
  visit 
}: { 
  visit: DealVisit 
}) {
  const measurements = useMemo(() => asArray(visit.measurements), [visit.measurements]);

  return (
    <div className="space-y-4">
      {visit.selectionId && <InfoRow label="Selection ID" value={visit.selectionId} />}
      {visit.remark && <InfoRow label="Remark" value={visit.remark} />}

      <div>
        <p className="mb-2 text-sm font-semibold">Measurements</p>
        <div className="flex flex-wrap gap-1.5">
          {measurements.length > 0 ? (
            measurements.map((m: string, idx: number) => (
              <Pill key={`${m}-${idx}`}>{m}</Pill>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      </div>
    </div>
  );
});

const DeliveryDetails = memo(function DeliveryDetails({ 
  visit 
}: { 
  visit: DealVisit 
}) {
  const deliveryItems = useMemo(
    () => asArray(visit.deliveryInstallations).filter(Boolean),
    [visit.deliveryInstallations]
  );

  return (
    <div className="space-y-4">
      {visit.otherDelivery && (
        <InfoRow label="Other Delivery" value={visit.otherDelivery} />
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">Delivery Items</p>
        {deliveryItems.length > 0 ? (
          <div className="space-y-2">
            {deliveryItems.map((item: any, idx: number) => (
              <div
                key={`${item.id}-${idx}`}
                className="flex justify-between rounded bg-muted/50 p-2 text-sm"
              >
                <span>{item.id || "-"}</span>
                <span className="font-medium">{item.noOfPcs || "1"} pcs</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
});

const Pill = memo(function Pill({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="secondary" className="text-xs">
      {children}
    </Badge>
  );
});

const InfoRow = memo(function InfoRow({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
});