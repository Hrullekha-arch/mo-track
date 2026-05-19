"use client";

import { useState, useCallback, useEffect, memo, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DealMeasurement, Customer, Deal } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GanttChartSquare,
  Eye,
  Loader2,
  Pencil,
  PlusCircleIcon,
  SquareCheckBig,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import {
  getMeasurementById,
  getSelectionById,
  getDealById,
  getMeasurementsForDeal,
} from "../../actions";
import { MeasurementPreviewDialog } from "@/components/features/measurement/MeasurementPreviewDialog";
import { format } from "date-fns";
import { exportElementToPdf } from "../../utils/pdfExport";
import {
  EMPTY_ROOM_KEY,
  toStrictRoomKey,
  roomLabelFromKey,
  getUniqueRoomKeys,
  hasBlankRoomNames,
  areStrictRoomSetsEqual,
  getSelectedRoomMap,
  getSelectedRoomNames,
} from "../../utils/roomUtils";
import { getCustomerById } from "@/app/dashboard/customers/actions";

// ═══════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════

interface MeasurementsTabProps {
  customerId: string;
  dealId: string;
  onRefresh?: () => void;
}

interface EditState {
  isEditing: boolean;
  tempSelection: string;
}

interface RoomMismatchDialogState {
  measurementId: string;
  selectionId: string;
  measurementData: any;
  selectionData: any;
  measurementRoomMap: Record<string, string>;
  selectionRoomMap: Record<string, string>;
  measurementRoomSelectionMap: Record<string, boolean>;
  selectionRoomSelectionMap: Record<string, boolean>;
  saving: boolean;
}

const DATE_FORMAT = "dd/MM/yy";
const EMPTY_EDIT_STATE: EditState = { isEditing: false, tempSelection: "" };

// ═══════════════════════════════════════════════════════════
// PURE HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

const formatDate = (date: any): string => {
  if (!date) return "-";
  try {
    return format(new Date(date), DATE_FORMAT);
  } catch {
    return "-";
  }
};

const buildRoomMap = (keys: string[]): Record<string, string> =>
  keys.reduce((acc, key) => {
    acc[key] = key === EMPTY_ROOM_KEY ? "" : key;
    return acc;
  }, {} as Record<string, string>);

const buildSelectionMap = (keys: string[]): Record<string, boolean> =>
  keys.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {} as Record<string, boolean>);

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export default function MeasurementsTab({
  customerId,
  dealId,
  onRefresh,
}: MeasurementsTabProps) {
  const { role } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  // ─── Core State ──────────────────────────────────────────
  const [measurements, setMeasurements] = useState<DealMeasurement[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Edit State ──────────────────────────────────────────
  const [editingMap, setEditingMap] = useState<Record<string, EditState>>({});

  // ─── Dialog States ───────────────────────────────────────
  const [viewingMeasurement, setViewingMeasurement] = useState<DealMeasurement | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // ─── Room Mismatch Dialog ────────────────────────────────
  const [roomMismatchDialog, setRoomMismatchDialog] = useState<RoomMismatchDialogState | null>(null);
  const [measurementMergeRoomName, setMeasurementMergeRoomName] = useState("");
  const [selectionMergeRoomName, setSelectionMergeRoomName] = useState("");

  // ─── Memoized Values ─────────────────────────────────────

  const hasMeasurements = measurements.length > 0;

  const isInstaller = role === "installer";

  // Check if room mismatch dialog is ready to proceed
  const roomMismatchReady = useMemo(() => {
    if (!roomMismatchDialog) return false;

    const selectedMeasurementRooms = getSelectedRoomMap(
      roomMismatchDialog.measurementRoomMap,
      roomMismatchDialog.measurementRoomSelectionMap
    );

    const selectedSelectionRooms = getSelectedRoomMap(
      roomMismatchDialog.selectionRoomMap,
      roomMismatchDialog.selectionRoomSelectionMap
    );

    return (
      Object.keys(selectedMeasurementRooms).length > 0 &&
      Object.keys(selectedSelectionRooms).length > 0 &&
      !hasBlankRoomNames(selectedMeasurementRooms) &&
      !hasBlankRoomNames(selectedSelectionRooms) &&
      areStrictRoomSetsEqual(selectedMeasurementRooms, selectedSelectionRooms)
    );
  }, [roomMismatchDialog]);

  // ─── Data Fetching ───────────────────────────────────────

  const fetchMeasurements = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMeasurementsForDeal(customerId, dealId);
      startTransition(() => {
        setMeasurements(data);
      });
    } catch (error) {
      console.error("Failed to fetch measurements:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load measurements",
      });
    } finally {
      setLoading(false);
    }
  }, [customerId, dealId, toast]);

  useEffect(() => {
    fetchMeasurements();
  }, [fetchMeasurements]);

  // ─── Edit Handlers ───────────────────────────────────────

  const getEditState = useCallback(
    (id: string): EditState => editingMap[id] ?? EMPTY_EDIT_STATE,
    [editingMap]
  );

  const handleEdit = useCallback((id: string) => {
    setEditingMap((prev) => ({
      ...prev,
      [id]: { isEditing: true, tempSelection: "" },
    }));
  }, []);

  const handleChange = useCallback((id: string, value: string) => {
    setEditingMap((prev) => ({
      ...prev,
      [id]: { ...prev[id], tempSelection: value },
    }));
  }, []);

  const handleCancel = useCallback((id: string) => {
    setEditingMap((prev) => ({
      ...prev,
      [id]: EMPTY_EDIT_STATE,
    }));
  }, []);

  const handleSave = useCallback(
    async (id: string) => {
      const { tempSelection } = getEditState(id);

      if (!tempSelection.trim()) {
        toast({
          variant: "destructive",
          title: "Invalid Selection ID",
          description: "Please enter a valid selection ID",
        });
        return;
      }

      try {
        const ref = doc(db, "customers", customerId, "deals", dealId, "measurements", id);
        await updateDoc(ref, { selectionId: tempSelection });

        // Optimistic update
        setMeasurements((prev) =>
          prev.map((m) => (m.id === id ? { ...m, selectionId: tempSelection } : m))
        );

        setEditingMap((prev) => ({
          ...prev,
          [id]: EMPTY_EDIT_STATE,
        }));

        toast({
          title: "Selection Updated",
          description: "Selection ID has been updated successfully",
        });
      } catch (error) {
        console.error("Failed to update selection:", error);
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: "Failed to update selection ID",
        });
      }
    },
    [customerId, dealId, getEditState, toast]
  );

  // ─── PDF & Preview Handlers ──────────────────────────────

  const handleViewPdf = useCallback(
    async (measurementId: string) => {
      try {
        const [fullMeasurement, customerData, dealData] = await Promise.all([
          getMeasurementById(customerId, dealId, measurementId),
          getCustomerById(customerId),
          getDealById(customerId, dealId),
        ]);

        if (fullMeasurement && customerData && dealData) {
          setCustomer(customerData);
          setDeal(dealData);
          setViewingMeasurement(fullMeasurement);
        } else {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Could not load measurement details",
          });
        }
      } catch (error) {
        console.error("Failed to load measurement:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load measurement details",
        });
      }
    },
    [customerId, dealId, toast]
  );

  const handleDownloadPdf = useCallback(async () => {
    setPdfLoading(true);
    try {
      await exportElementToPdf(
        "measurement-preview-content",
        `Measurement-${deal?.dealId || "details"}.pdf`
      );
      toast({
        title: "PDF Downloaded",
        description: "Measurement PDF has been downloaded successfully",
      });
    } catch (error) {
      console.error("PDF generation failed:", error);
      toast({
        variant: "destructive",
        title: "PDF Generation Failed",
        description: "Failed to generate PDF",
      });
    } finally {
      setPdfLoading(false);
    }
  }, [deal, toast]);

  const handleClosePdfDialog = useCallback(() => {
    setViewingMeasurement(null);
  }, []);

  // ─── Measurement Editor Handlers ─────────────────────────

  const handleOpenMeasurementEditor = useCallback(
    async (measurementId: string) => {
      try {
        const measurement = await getMeasurementById(customerId, dealId, measurementId);

        if (!measurement) {
          toast({
            variant: "destructive",
            title: "Measurement Not Found",
            description: "The requested measurement could not be found",
          });
          return;
        }

        if (!measurement.selectionId) {
          toast({
            variant: "destructive",
            title: "Selection Missing",
            description: "Please update selection ID first",
          });
          return;
        }

        const selection = await getSelectionById(
          customerId,
          dealId,
          String(measurement.selectionId)
        );

        if (!selection) {
          toast({
            variant: "destructive",
            title: "Selection Not Found",
            description: "The associated selection could not be found",
          });
          return;
        }

        // Get room keys
        const measurementRoomKeys = getUniqueRoomKeys(
          (measurement.rooms || []).map((r: any) => r?.roomName)
        );
        const selectionRoomKeys = getUniqueRoomKeys(
          (selection.products || []).map((i: any) => i?.room)
        );

        // Build room maps
        const measurementRoomMap = buildRoomMap(measurementRoomKeys);
        const selectionRoomMap = buildRoomMap(selectionRoomKeys);

        // Check if rooms match
        if (
          !hasBlankRoomNames(measurementRoomMap) &&
          !hasBlankRoomNames(selectionRoomMap) &&
          areStrictRoomSetsEqual(measurementRoomMap, selectionRoomMap)
        ) {
          // Rooms match - navigate directly
          router.push(
            `/dashboard/customers/${customerId}/${dealId}/measurement/${measurementId}/edit`
          );
          return;
        }

        // Rooms don't match - show dialog
        toast({
          variant: "destructive",
          title: "Room Names Mismatch",
          description: "Please align room names before editing",
        });

        setMeasurementMergeRoomName("");
        setSelectionMergeRoomName("");

        setRoomMismatchDialog({
          measurementId,
          selectionId: String(measurement.selectionId),
          measurementData: measurement,
          selectionData: selection,
          measurementRoomMap,
          selectionRoomMap,
          measurementRoomSelectionMap: buildSelectionMap(measurementRoomKeys),
          selectionRoomSelectionMap: buildSelectionMap(selectionRoomKeys),
          saving: false,
        });
      } catch (error) {
        console.error("Failed to open editor:", error);
        toast({
          variant: "destructive",
          title: "Failed To Open Editor",
          description: "An error occurred while opening the editor",
        });
      }
    },
    [customerId, dealId, router, toast]
  );

  // ─── Room Mismatch Dialog Handlers ───────────────────────

  const handleMismatchDialogRoomToggle = useCallback(
    (source: "measurement" | "selection", key: string, checked: boolean) => {
      setRoomMismatchDialog((prev) => {
        if (!prev) return prev;

        const mapKey =
          source === "measurement"
            ? "measurementRoomSelectionMap"
            : "selectionRoomSelectionMap";

        return {
          ...prev,
          [mapKey]: {
            ...prev[mapKey],
            [key]: checked,
          },
        };
      });
    },
    []
  );

  const handleMismatchDialogRoomChange = useCallback(
    (source: "measurement" | "selection", key: string, value: string) => {
      setRoomMismatchDialog((prev) => {
        if (!prev) return prev;

        const mapKey =
          source === "measurement" ? "measurementRoomMap" : "selectionRoomMap";

        return {
          ...prev,
          [mapKey]: {
            ...prev[mapKey],
            [key]: value,
          },
        };
      });
    },
    []
  );

  const handleMergeSelectedRooms = useCallback(
    (source: "measurement" | "selection") => {
      if (!roomMismatchDialog) return;

      const roomMap =
        source === "measurement"
          ? roomMismatchDialog.measurementRoomMap
          : roomMismatchDialog.selectionRoomMap;

      const selMap =
        source === "measurement"
          ? roomMismatchDialog.measurementRoomSelectionMap
          : roomMismatchDialog.selectionRoomSelectionMap;

      const mergeName = String(
        source === "measurement" ? measurementMergeRoomName : selectionMergeRoomName
      ).trim();

      const selectedKeys = Object.keys(roomMap).filter((k) => !!selMap[k]);

      if (selectedKeys.length < 2 || !mergeName) {
        toast({
          variant: "destructive",
          title: "Invalid Merge",
          description: "Select at least 2 rooms and enter a merge name",
        });
        return;
      }

      setRoomMismatchDialog((prev) => {
        if (!prev) return prev;

        const mapKey =
          source === "measurement" ? "measurementRoomMap" : "selectionRoomMap";

        const nextMap = { ...prev[mapKey] };
        selectedKeys.forEach((k) => {
          nextMap[k] = mergeName;
        });

        return {
          ...prev,
          [mapKey]: nextMap,
        };
      });

      toast({
        title: "Rooms Merged",
        description: `${selectedKeys.length} rooms merged into "${mergeName}"`,
      });
    },
    [roomMismatchDialog, measurementMergeRoomName, selectionMergeRoomName, toast]
  );

  const handleApplyRoomAlignmentAndOpenEditor = useCallback(async () => {
    if (!roomMismatchDialog) return;

    const selectedMeasurementRooms = getSelectedRoomMap(
      roomMismatchDialog.measurementRoomMap,
      roomMismatchDialog.measurementRoomSelectionMap
    );

    const selectedSelectionRooms = getSelectedRoomMap(
      roomMismatchDialog.selectionRoomMap,
      roomMismatchDialog.selectionRoomSelectionMap
    );

    if (
      Object.keys(selectedMeasurementRooms).length === 0 ||
      Object.keys(selectedSelectionRooms).length === 0 ||
      hasBlankRoomNames(selectedMeasurementRooms) ||
      hasBlankRoomNames(selectedSelectionRooms) ||
      !areStrictRoomSetsEqual(selectedMeasurementRooms, selectedSelectionRooms)
    ) {
      toast({
        variant: "destructive",
        title: "Room sets don't match",
        description: "Please ensure all room names match before proceeding",
      });
      return;
    }

    try {
      setRoomMismatchDialog((prev) => (prev ? { ...prev, saving: true } : prev));

      // Update measurement rooms
      const updatedMeasurementRooms = (roomMismatchDialog.measurementData?.rooms || []).map(
        (r: any) => ({
          ...r,
          roomName: String(
            roomMismatchDialog.measurementRoomMap[toStrictRoomKey(r?.roomName)] ?? ""
          ).trim(),
        })
      );

      // Update selection products
      const updatedSelectionProducts = (
        roomMismatchDialog.selectionData?.products || []
      ).map((i: any) => ({
        ...i,
        room: String(
          roomMismatchDialog.selectionRoomMap[toStrictRoomKey(i?.room)] ?? ""
        ).trim(),
      }));

      // Save to Firestore
      await Promise.all([
        updateDoc(
          doc(
            db,
            "customers",
            customerId,
            "deals",
            dealId,
            "measurements",
            roomMismatchDialog.measurementId
          ),
          { rooms: updatedMeasurementRooms }
        ),
        updateDoc(
          doc(
            db,
            "customers",
            customerId,
            "deals",
            dealId,
            "selections",
            roomMismatchDialog.selectionId
          ),
          { products: updatedSelectionProducts }
        ),
      ]);

      // Get selected room names
      const selectedRoomNames = getSelectedRoomNames(
        roomMismatchDialog.measurementRoomMap,
        roomMismatchDialog.measurementRoomSelectionMap
      );

      // Build URL params
      const params = new URLSearchParams();
      selectedRoomNames.forEach((room) => params.append("room", room));

      setRoomMismatchDialog(null);

      // Navigate to editor
      router.push(
        `/dashboard/customers/${customerId}/${dealId}/measurement/${roomMismatchDialog.measurementId}/edit${params.toString() ? `?${params}` : ""}`
      );

      toast({
        title: "Room Alignment Saved",
        description: "Opening measurement editor...",
      });
    } catch (error) {
      console.error("Failed to apply room alignment:", error);
      toast({
        variant: "destructive",
        title: "Failed",
        description: "Failed to apply room alignment",
      });
      setRoomMismatchDialog((prev) => (prev ? { ...prev, saving: false } : prev));
    }
  }, [roomMismatchDialog, customerId, dealId, router, toast]);

  const handleCloseMismatchDialog = useCallback(() => {
    if (roomMismatchDialog?.saving) return;
    setRoomMismatchDialog(null);
  }, [roomMismatchDialog]);

  // ─── Render ──────────────────────────────────────────────

  if (loading) {
    return <LoadingState />;
  }

  if (isInstaller) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Measurement History</CardTitle>
        </CardHeader>

        <CardContent>
          {hasMeasurements ? (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <MeasurementsTable
                  measurements={measurements}
                  editingMap={editingMap}
                  onEdit={handleEdit}
                  onChange={handleChange}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  onOpenEditor={handleOpenMeasurementEditor}
                  onViewPdf={handleViewPdf}
                />
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                <MeasurementCards
                  measurements={measurements}
                  onOpenEditor={handleOpenMeasurementEditor}
                  onViewPdf={handleViewPdf}
                />
              </div>
            </>
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>

      {/* Room Mismatch Dialog */}
      {roomMismatchDialog && (
        <RoomMismatchDialog
          state={roomMismatchDialog}
          measurementMergeRoomName={measurementMergeRoomName}
          selectionMergeRoomName={selectionMergeRoomName}
          roomMismatchReady={roomMismatchReady}
          onMeasurementMergeNameChange={setMeasurementMergeRoomName}
          onSelectionMergeNameChange={setSelectionMergeRoomName}
          onRoomToggle={handleMismatchDialogRoomToggle}
          onRoomChange={handleMismatchDialogRoomChange}
          onMerge={handleMergeSelectedRooms}
          onApply={handleApplyRoomAlignmentAndOpenEditor}
          onClose={handleCloseMismatchDialog}
        />
      )}

      {/* PDF Preview Dialog */}
      {viewingMeasurement && customer && deal && (
        <PdfPreviewDialog
          measurement={viewingMeasurement}
          customer={customer}
          deal={deal}
          pdfLoading={pdfLoading}
          onDownload={handleDownloadPdf}
          onClose={handleClosePdfDialog}
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
    <div className="space-y-3">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
});

const EmptyState = memo(function EmptyState() {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <GanttChartSquare className="mx-auto h-12 w-12 mb-2 opacity-50" />
      <p>No measurements have been logged for this deal yet.</p>
    </div>
  );
});

interface MeasurementsTableProps {
  measurements: DealMeasurement[];
  editingMap: Record<string, EditState>;
  onEdit: (id: string) => void;
  onChange: (id: string, value: string) => void;
  onSave: (id: string) => void;
  onCancel: (id: string) => void;
  onOpenEditor: (id: string) => void;
  onViewPdf: (id: string) => void;
}

const MeasurementsTable = memo(function MeasurementsTable({
  measurements,
  editingMap,
  onEdit,
  onChange,
  onSave,
  onCancel,
  onOpenEditor,
  onViewPdf,
}: MeasurementsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Doer</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-24">Status</TableHead>
          <TableHead>Selection ID</TableHead>
          <TableHead className="w-32">Actions</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {measurements.map((m, index) => {
          const editState = editingMap[m.id] ?? EMPTY_EDIT_STATE;
          return (
            <MeasurementRow
              key={m.id}
              measurement={m}
              index={index}
              editState={editState}
              onEdit={onEdit}
              onChange={onChange}
              onSave={onSave}
              onCancel={onCancel}
              onOpenEditor={onOpenEditor}
              onViewPdf={onViewPdf}
            />
          );
        })}
      </TableBody>
    </Table>
  );
});

interface MeasurementRowProps {
  measurement: DealMeasurement;
  index: number;
  editState: EditState;
  onEdit: (id: string) => void;
  onChange: (id: string, value: string) => void;
  onSave: (id: string) => void;
  onCancel: (id: string) => void;
  onOpenEditor: (id: string) => void;
  onViewPdf: (id: string) => void;
}

const MeasurementRow = memo(function MeasurementRow({
  measurement,
  index,
  editState,
  onEdit,
  onChange,
  onSave,
  onCancel,
  onOpenEditor,
  onViewPdf,
}: MeasurementRowProps) {
  const handleEdit = useCallback(() => onEdit(measurement.id), [measurement.id, onEdit]);
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(measurement.id, e.target.value),
    [measurement.id, onChange]
  );
  const handleSave = useCallback(() => onSave(measurement.id), [measurement.id, onSave]);
  const handleCancel = useCallback(
    () => onCancel(measurement.id),
    [measurement.id, onCancel]
  );
  const handleOpenEditor = useCallback(
    () => onOpenEditor(measurement.id),
    [measurement.id, onOpenEditor]
  );
  const handleViewPdf = useCallback(
    () => onViewPdf(measurement.id),
    [measurement.id, onViewPdf]
  );

  const formattedDate = useMemo(
    () => formatDate(measurement.createdAt),
    [measurement.createdAt]
  );

  return (
    <TableRow>
      <TableCell>{index + 1}</TableCell>
      <TableCell>{measurement.typeOf || "-"}</TableCell>
      <TableCell>{measurement.doerName || "-"}</TableCell>
      <TableCell>
        <div className="text-sm">
          <div>{measurement.createdBy}</div>
          <div className="text-muted-foreground">{formattedDate}</div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{measurement.status || "Unknown"}</Badge>
      </TableCell>
      <TableCell>
        {measurement.selectionId ? (
          <Badge variant="secondary" className="px-3 py-1 text-xs">
            {measurement.selectionId}
          </Badge>
        ) : (
          <SelectionIdEditor
            isEditing={editState.isEditing}
            tempSelection={editState.tempSelection}
            onEdit={handleEdit}
            onChange={handleChange}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleOpenEditor}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={handleViewPdf}>
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}, (prev, next) =>
  prev.measurement.id === next.measurement.id &&
  prev.index === next.index &&
  prev.editState.isEditing === next.editState.isEditing &&
  prev.editState.tempSelection === next.editState.tempSelection
);

interface SelectionIdEditorProps {
  isEditing: boolean;
  tempSelection: string;
  onEdit: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onCancel: () => void;
}

const SelectionIdEditor = memo(function SelectionIdEditor({
  isEditing,
  tempSelection,
  onEdit,
  onChange,
  onSave,
  onCancel,
}: SelectionIdEditorProps) {
  if (!isEditing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">None</span>
        <Button size="icon" variant="outline" className="h-7 w-7" onClick={onEdit}>
          <PlusCircleIcon className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={tempSelection}
        onChange={onChange}
        className="h-8 w-[120px]"
        placeholder="Enter ID"
      />
      <Button
        size="icon"
        variant="outline"
        className="h-7 w-7 text-green-600"
        onClick={onSave}
      >
        <SquareCheckBig className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        className="h-7 w-7 text-red-500"
        onClick={onCancel}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
});

interface MeasurementCardsProps {
  measurements: DealMeasurement[];
  onOpenEditor: (id: string) => void;
  onViewPdf: (id: string) => void;
}

const MeasurementCards = memo(function MeasurementCards({
  measurements,
  onOpenEditor,
  onViewPdf,
}: MeasurementCardsProps) {
  return (
    <>
      {measurements.map((m) => (
        <MeasurementCard
          key={m.id}
          measurement={m}
          onOpenEditor={onOpenEditor}
          onViewPdf={onViewPdf}
        />
      ))}
    </>
  );
});

interface MeasurementCardProps {
  measurement: DealMeasurement;
  onOpenEditor: (id: string) => void;
  onViewPdf: (id: string) => void;
}

const MeasurementCard = memo(function MeasurementCard({
  measurement,
  onOpenEditor,
  onViewPdf,
}: MeasurementCardProps) {
  const handleOpenEditor = useCallback(
    () => onOpenEditor(measurement.id),
    [measurement.id, onOpenEditor]
  );
  const handleViewPdf = useCallback(
    () => onViewPdf(measurement.id),
    [measurement.id, onViewPdf]
  );

  const formattedDate = useMemo(
    () => formatDate(measurement.createdAt),
    [measurement.createdAt]
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-sm">{measurement.typeOf || "Measurement"}</p>
            <p className="text-xs text-muted-foreground">
              by {measurement.doerName || "-"}
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {measurement.status || "Unknown"}
          </Badge>
        </div>

        <Separator />

        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created By:</span>
            <span>{measurement.createdBy}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created:</span>
            <span>{formattedDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Selection ID:</span>
            {measurement.selectionId ? (
              <Badge variant="secondary" className="text-xs">
                {measurement.selectionId}
              </Badge>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={handleOpenEditor}
          >
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={handleViewPdf}>
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

interface RoomMismatchDialogProps {
  state: RoomMismatchDialogState;
  measurementMergeRoomName: string;
  selectionMergeRoomName: string;
  roomMismatchReady: boolean;
  onMeasurementMergeNameChange: (value: string) => void;
  onSelectionMergeNameChange: (value: string) => void;
  onRoomToggle: (source: "measurement" | "selection", key: string, checked: boolean) => void;
  onRoomChange: (source: "measurement" | "selection", key: string, value: string) => void;
  onMerge: (source: "measurement" | "selection") => void;
  onApply: () => void;
  onClose: () => void;
}

const RoomMismatchDialog = memo(function RoomMismatchDialog({
  state,
  measurementMergeRoomName,
  selectionMergeRoomName,
  roomMismatchReady,
  onMeasurementMergeNameChange,
  onSelectionMergeNameChange,
  onRoomToggle,
  onRoomChange,
  onMerge,
  onApply,
  onClose,
}: RoomMismatchDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Room Name Matching Required</DialogTitle>
          <DialogDescription>
            Select matching rooms on both sides and align the names.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <RoomMappingPanel
            source="measurement"
            roomMap={state.measurementRoomMap}
            selectionMap={state.measurementRoomSelectionMap}
            mergeRoomName={measurementMergeRoomName}
            saving={state.saving}
            onMergeNameChange={onMeasurementMergeNameChange}
            onMerge={onMerge}
            onRoomToggle={onRoomToggle}
            onRoomChange={onRoomChange}
          />

          <RoomMappingPanel
            source="selection"
            roomMap={state.selectionRoomMap}
            selectionMap={state.selectionRoomSelectionMap}
            mergeRoomName={selectionMergeRoomName}
            saving={state.saving}
            onMergeNameChange={onSelectionMergeNameChange}
            onMerge={onMerge}
            onRoomToggle={onRoomToggle}
            onRoomChange={onRoomChange}
          />
        </div>

        <DialogFooter className="gap-2">
          {!roomMismatchReady && (
            <p className="text-sm text-destructive mr-auto">
              Room sets don't match yet.
            </p>
          )}
          <Button variant="outline" onClick={onClose} disabled={state.saving}>
            Cancel
          </Button>
          <Button onClick={onApply} disabled={!roomMismatchReady || state.saving}>
            {state.saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save & Open Editor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

interface RoomMappingPanelProps {
  source: "measurement" | "selection";
  roomMap: Record<string, string>;
  selectionMap: Record<string, boolean>;
  mergeRoomName: string;
  saving: boolean;
  onMergeNameChange: (value: string) => void;
  onMerge: (source: "measurement" | "selection") => void;
  onRoomToggle: (source: "measurement" | "selection", key: string, checked: boolean) => void;
  onRoomChange: (source: "measurement" | "selection", key: string, value: string) => void;
}

const RoomMappingPanel = memo(function RoomMappingPanel({
  source,
  roomMap,
  selectionMap,
  mergeRoomName,
  saving,
  onMergeNameChange,
  onMerge,
  onRoomToggle,
  onRoomChange,
}: RoomMappingPanelProps) {
  const handleMerge = useCallback(() => onMerge(source), [source, onMerge]);

  const roomKeys = useMemo(() => Object.keys(roomMap), [roomMap]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base capitalize">{source} Rooms</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            value={mergeRoomName}
            onChange={(e) => onMergeNameChange(e.target.value)}
            placeholder="Merged room name"
            disabled={saving}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleMerge}
            disabled={saving}
          >
            Merge Selected
          </Button>
        </div>

        {roomKeys.map((roomKey) => (
          <RoomMappingField
            key={`${source}-${roomKey}`}
            source={source}
            roomKey={roomKey}
            roomValue={roomMap[roomKey]}
            isSelected={selectionMap[roomKey]}
            onToggle={onRoomToggle}
            onChange={onRoomChange}
          />
        ))}
      </CardContent>
    </Card>
  );
});

interface RoomMappingFieldProps {
  source: "measurement" | "selection";
  roomKey: string;
  roomValue: string;
  isSelected: boolean;
  onToggle: (source: "measurement" | "selection", key: string, checked: boolean) => void;
  onChange: (source: "measurement" | "selection", key: string, value: string) => void;
}

const RoomMappingField = memo(function RoomMappingField({
  source,
  roomKey,
  roomValue,
  isSelected,
  onToggle,
  onChange,
}: RoomMappingFieldProps) {
  const handleToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onToggle(source, roomKey, e.target.checked),
    [source, roomKey, onToggle]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(source, roomKey, e.target.value),
    [source, roomKey, onChange]
  );

  const label = useMemo(() => roomLabelFromKey(roomKey), [roomKey]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Original: {label}</p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={isSelected} onChange={handleToggle} /> Use
        </label>
      </div>
      <Input value={roomValue} onChange={handleChange} placeholder="Enter room name" />
    </div>
  );
});

interface PdfPreviewDialogProps {
  measurement: DealMeasurement;
  customer: Customer;
  deal: Deal;
  pdfLoading: boolean;
  onDownload: () => void;
  onClose: () => void;
}

const PdfPreviewDialog = memo(function PdfPreviewDialog({
  measurement,
  customer,
  deal,
  pdfLoading,
  onDownload,
  onClose,
}: PdfPreviewDialogProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Measurement Preview</DialogTitle>
          <DialogDescription>Review details before downloading PDF.</DialogDescription>
        </DialogHeader>

        <div id="measurement-preview-content">
          <MeasurementPreviewDialog
            open
            onOpenChange={onClose}
            data={{
              customerName: customer.name,
              dealId: deal.dealId,
              doerName: measurement.doerName,
              rooms: measurement.rooms || [],
            }}
            onSave={() => {}}
            saving={false}
            saveStep="idle"
          />
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onDownload} disabled={pdfLoading}>
            {pdfLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});