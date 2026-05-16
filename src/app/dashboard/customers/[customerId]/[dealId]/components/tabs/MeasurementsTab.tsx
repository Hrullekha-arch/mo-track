"use client";

import React, { useState, useCallback, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import { DealMeasurement, Customer, Deal } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GanttChartSquare, Eye, Loader2, Pencil, PlusCircleIcon, SquareCheckBig, X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import {
  getMeasurementById, getSelectionById, getDealById,
  getMeasurementsForDeal,
} from "../../actions";
import { MeasurementPreviewDialog } from "@/components/features/measurement/MeasurementPreviewDialog";
import { format } from "date-fns";
import { exportElementToPdf } from "../../utils/pdfExport";
import {
  EMPTY_ROOM_KEY, toStrictRoomKey, roomLabelFromKey, getUniqueRoomKeys,
  hasBlankRoomNames, areStrictRoomSetsEqual, getSelectedRoomMap, getSelectedRoomNames,
} from "../../utils/roomUtils";
import { getCustomerById } from "@/app/dashboard/customers/actions";

interface MeasurementsTabProps {
  customerId: string;
  dealId: string;
  onRefresh: () => void;
}

type RoomMismatchDialogState = {
  measurementId: string;
  selectionId: string;
  measurementData: any;
  selectionData: any;
  measurementRoomMap: Record<string, string>;
  selectionRoomMap: Record<string, string>;
  measurementRoomSelectionMap: Record<string, boolean>;
  selectionRoomSelectionMap: Record<string, boolean>;
  saving: boolean;
};

const MeasurementRow = memo(function MeasurementRow({
  m, index, isEditing, tempSelection, onEdit, onChange, onSave, onCancel, onOpenEditor, onViewPdf,
}: {
  m: DealMeasurement; index: number; isEditing: boolean; tempSelection: string;
  onEdit: () => void; onChange: (v: string) => void; onSave: () => void;
  onCancel: () => void; onOpenEditor: () => void; onViewPdf: () => void;
}) {
  return (
    <TableRow>
      <TableCell>{index + 1}</TableCell>
      <TableCell>{m.typeOf || "-"}</TableCell>
      <TableCell>{m.doerName || "-"}</TableCell>
      <TableCell>
        <div className="text-sm">
          <div>{m.createdBy}</div>
          <div className="text-muted-foreground">{m.createdAt ? format(new Date(m.createdAt), "dd/MM/yy") : "-"}</div>
        </div>
      </TableCell>
      <TableCell><Badge variant="outline">{m.status || "Unknown"}</Badge></TableCell>
      <TableCell>
        {m.selectionId ? (
          <Badge variant="secondary" className="px-3 py-1 text-xs">{m.selectionId}</Badge>
        ) : (
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <><span className="text-muted-foreground text-sm">None</span>
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={onEdit}><PlusCircleIcon className="h-4 w-4" /></Button></>
            ) : (
              <div className="flex items-center gap-2">
                <Input value={tempSelection} onChange={(e) => onChange(e.target.value)} className="h-8 w-[120px]" placeholder="Enter ID" />
                <Button size="icon" variant="outline" className="h-7 w-7 text-green-600" onClick={onSave}><SquareCheckBig className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" className="h-7 w-7 text-red-500" onClick={onCancel}><X className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onOpenEditor}><Pencil className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={onViewPdf}><Eye className="h-4 w-4" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

export default function MeasurementsTab({
  customerId, dealId, onRefresh,
}: MeasurementsTabProps) {
  const { role } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // ✅ Self-contained: fetch own measurements
  const [measurements, setMeasurements] = useState<DealMeasurement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMeasurements = useCallback(async () => {
    setLoading(true);
    const data = await getMeasurementsForDeal(customerId, dealId);
    setMeasurements(data);
    setLoading(false);
  }, [customerId, dealId]);

  useEffect(() => { fetchMeasurements(); }, [fetchMeasurements]);

  const [viewingMeasurement, setViewingMeasurement] = useState<DealMeasurement | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [roomMismatchDialog, setRoomMismatchDialog] = useState<RoomMismatchDialogState | null>(null);
  const [measurementMergeRoomName, setMeasurementMergeRoomName] = useState("");
  const [selectionMergeRoomName, setSelectionMergeRoomName] = useState("");

  const [editingMap, setEditingMap] = useState<Record<string, { isEditing: boolean; tempSelection: string }>>({});
  const getEditState = (id: string) => editingMap[id] ?? { isEditing: false, tempSelection: "" };
  const handleEdit = (id: string) => setEditingMap((p) => ({ ...p, [id]: { isEditing: true, tempSelection: "" } }));
  const handleChange = (id: string, value: string) => setEditingMap((p) => ({ ...p, [id]: { ...getEditState(id), tempSelection: value } }));
  const handleCancel = (id: string) => setEditingMap((p) => ({ ...p, [id]: { isEditing: false, tempSelection: "" } }));

  const handleSave = async (id: string) => {
    const { tempSelection } = getEditState(id);
    const ref = doc(db, "customers", customerId, "deals", dealId, "measurements", id);
    await updateDoc(ref, { selectionId: tempSelection });
    fetchMeasurements();
    setEditingMap((p) => ({ ...p, [id]: { isEditing: false, tempSelection: "" } }));
  };

  const handleViewPdf = async (measurementId: string) => {
    const [fullMeasurement, customerData, dealData] = await Promise.all([
      getMeasurementById(customerId, dealId, measurementId),
      getCustomerById(customerId),
      getDealById(customerId, dealId),
    ]);
    if (fullMeasurement && customerData && dealData) {
      setCustomer(customerData); setDeal(dealData); setViewingMeasurement(fullMeasurement);
    } else {
      toast({ variant: "destructive", title: "Error", description: "Could not load measurement details." });
    }
  };

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try { await exportElementToPdf("measurement-preview-content", `Measurement-${deal?.dealId || "details"}.pdf`); }
    catch { toast({ variant: "destructive", title: "PDF Generation Failed" }); }
    finally { setPdfLoading(false); }
  };

  const handleOpenMeasurementEditor = async (measurementId: string) => {
    try {
      const measurement = await getMeasurementById(customerId, dealId, measurementId);
      if (!measurement) { toast({ variant: "destructive", title: "Measurement Not Found" }); return; }
      if (!measurement.selectionId) { toast({ variant: "destructive", title: "Selection Missing", description: "Please update selection ID first." }); return; }
      const selection = await getSelectionById(customerId, dealId, String(measurement.selectionId));
      if (!selection) { toast({ variant: "destructive", title: "Selection Not Found" }); return; }

      const mRoomKeys = getUniqueRoomKeys((measurement.rooms || []).map((r: any) => r?.roomName));
      const sRoomKeys = getUniqueRoomKeys((selection.products || []).map((i: any) => i?.room));
      const mRoomMap = mRoomKeys.reduce((a, k) => { a[k] = k === EMPTY_ROOM_KEY ? "" : k; return a; }, {} as Record<string, string>);
      const sRoomMap = sRoomKeys.reduce((a, k) => { a[k] = k === EMPTY_ROOM_KEY ? "" : k; return a; }, {} as Record<string, string>);

      if (!hasBlankRoomNames(mRoomMap) && !hasBlankRoomNames(sRoomMap) && areStrictRoomSetsEqual(mRoomMap, sRoomMap)) {
        router.push(`/dashboard/customers/${customerId}/${dealId}/measurement/${measurementId}/edit`);
        return;
      }

      toast({ variant: "destructive", title: "Room Names Mismatch" });
      setMeasurementMergeRoomName(""); setSelectionMergeRoomName("");
      setRoomMismatchDialog({
        measurementId, selectionId: String(measurement.selectionId),
        measurementData: measurement, selectionData: selection,
        measurementRoomMap: mRoomMap, selectionRoomMap: sRoomMap,
        measurementRoomSelectionMap: mRoomKeys.reduce((a, k) => { a[k] = true; return a; }, {} as Record<string, boolean>),
        selectionRoomSelectionMap: sRoomKeys.reduce((a, k) => { a[k] = true; return a; }, {} as Record<string, boolean>),
        saving: false,
      });
    } catch { toast({ variant: "destructive", title: "Failed To Open Editor" }); }
  };

  const handleMismatchDialogRoomToggle = useCallback((source: "measurement" | "selection", key: string, checked: boolean) => {
    setRoomMismatchDialog((p) => {
      if (!p) return p;
      const mapKey = source === "measurement" ? "measurementRoomSelectionMap" : "selectionRoomSelectionMap";
      return { ...p, [mapKey]: { ...p[mapKey], [key]: checked } };
    });
  }, []);

  const handleMismatchDialogRoomChange = useCallback((source: "measurement" | "selection", key: string, value: string) => {
    setRoomMismatchDialog((p) => {
      if (!p) return p;
      const mapKey = source === "measurement" ? "measurementRoomMap" : "selectionRoomMap";
      return { ...p, [mapKey]: { ...p[mapKey], [key]: value } };
    });
  }, []);

  const handleMergeSelectedRooms = useCallback((source: "measurement" | "selection") => {
    if (!roomMismatchDialog) return;
    const roomMap = source === "measurement" ? roomMismatchDialog.measurementRoomMap : roomMismatchDialog.selectionRoomMap;
    const selMap = source === "measurement" ? roomMismatchDialog.measurementRoomSelectionMap : roomMismatchDialog.selectionRoomSelectionMap;
    const mergeName = String(source === "measurement" ? measurementMergeRoomName : selectionMergeRoomName).trim();
    const selectedKeys = Object.keys(roomMap).filter((k) => !!selMap[k]);
    if (selectedKeys.length < 2 || !mergeName) { toast({ variant: "destructive", title: "Select rooms + enter merge name" }); return; }
    setRoomMismatchDialog((p) => {
      if (!p) return p;
      const mapKey = source === "measurement" ? "measurementRoomMap" : "selectionRoomMap";
      const nextMap = { ...p[mapKey] }; selectedKeys.forEach((k) => { nextMap[k] = mergeName; });
      return { ...p, [mapKey]: nextMap };
    });
  }, [roomMismatchDialog, measurementMergeRoomName, selectionMergeRoomName, toast]);

  const handleApplyRoomAlignmentAndOpenEditor = async () => {
    if (!roomMismatchDialog) return;
    const sMRM = getSelectedRoomMap(roomMismatchDialog.measurementRoomMap, roomMismatchDialog.measurementRoomSelectionMap);
    const sSRM = getSelectedRoomMap(roomMismatchDialog.selectionRoomMap, roomMismatchDialog.selectionRoomSelectionMap);
    if (Object.keys(sMRM).length === 0 || Object.keys(sSRM).length === 0 || hasBlankRoomNames(sMRM) || hasBlankRoomNames(sSRM) || !areStrictRoomSetsEqual(sMRM, sSRM)) {
      toast({ variant: "destructive", title: "Room sets don't match" }); return;
    }
    try {
      setRoomMismatchDialog((p) => p ? { ...p, saving: true } : p);
      const updatedMR = (roomMismatchDialog.measurementData?.rooms || []).map((r: any) => ({ ...r, roomName: String(roomMismatchDialog.measurementRoomMap[toStrictRoomKey(r?.roomName)] ?? "").trim() }));
      const updatedSP = (roomMismatchDialog.selectionData?.products || []).map((i: any) => ({ ...i, room: String(roomMismatchDialog.selectionRoomMap[toStrictRoomKey(i?.room)] ?? "").trim() }));
      await Promise.all([
        updateDoc(doc(db, "customers", customerId, "deals", dealId, "measurements", roomMismatchDialog.measurementId), { rooms: updatedMR }),
        updateDoc(doc(db, "customers", customerId, "deals", dealId, "selections", roomMismatchDialog.selectionId), { products: updatedSP }),
      ]);
      const names = getSelectedRoomNames(roomMismatchDialog.measurementRoomMap, roomMismatchDialog.measurementRoomSelectionMap);
      const params = new URLSearchParams(); names.forEach((r) => params.append("room", r));
      setRoomMismatchDialog(null);
      router.push(`/dashboard/customers/${customerId}/${dealId}/measurement/${roomMismatchDialog.measurementId}/edit${params.toString() ? `?${params}` : ""}`);
    } catch {
      toast({ variant: "destructive", title: "Failed" });
      setRoomMismatchDialog((p) => p ? { ...p, saving: false } : p);
    }
  };

  const roomMismatchReady = roomMismatchDialog ? (() => {
    const sMRM = getSelectedRoomMap(roomMismatchDialog.measurementRoomMap, roomMismatchDialog.measurementRoomSelectionMap);
    const sSRM = getSelectedRoomMap(roomMismatchDialog.selectionRoomMap, roomMismatchDialog.selectionRoomSelectionMap);
    return Object.keys(sMRM).length > 0 && Object.keys(sSRM).length > 0 && !hasBlankRoomNames(sMRM) && !hasBlankRoomNames(sSRM) && areStrictRoomSetsEqual(sMRM, sSRM);
  })() : false;

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      {role !== "installer" && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg">Measurement History</CardTitle></CardHeader>
          <CardContent>
            {measurements.length > 0 ? (
              <div className="space-y-3">
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead><TableHead>Type</TableHead><TableHead>Doer</TableHead>
                        <TableHead>Created</TableHead><TableHead>Status</TableHead><TableHead>Selection ID</TableHead><TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {measurements.map((m, i) => {
                        const { isEditing, tempSelection } = getEditState(m.id);
                        return (
                          <MeasurementRow key={m.id} m={m} index={i} isEditing={isEditing} tempSelection={tempSelection}
                            onEdit={() => handleEdit(m.id)} onChange={(v) => handleChange(m.id, v)}
                            onSave={() => handleSave(m.id)} onCancel={() => handleCancel(m.id)}
                            onOpenEditor={() => handleOpenMeasurementEditor(m.id)} onViewPdf={() => handleViewPdf(m.id)}
                          />
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="md:hidden space-y-3">
                  {measurements.map((m, i) => (
                    <Card key={m.id}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div><p className="font-semibold text-sm">{m.typeOf || "Measurement"}</p><p className="text-xs text-muted-foreground">by {m.doerName || "-"}</p></div>
                          <Badge variant="outline" className="text-xs">{m.status || "Unknown"}</Badge>
                        </div>
                        <Separator />
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between"><span className="text-muted-foreground">Created By:</span><span>{m.createdBy}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Created:</span><span>{m.createdAt ? format(new Date(m.createdAt), "dd/MM/yy") : "-"}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Selection ID:</span>
                            {m.selectionId ? <Badge variant="secondary" className="text-xs">{m.selectionId}</Badge> : <span className="text-muted-foreground">None</span>}
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => handleOpenMeasurementEditor(m.id)}><Pencil className="h-4 w-4 mr-1" />Edit</Button>
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => handleViewPdf(m.id)}><Eye className="h-4 w-4 mr-1" />View</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground"><GanttChartSquare className="mx-auto h-12 w-12 mb-2 opacity-50" /><p>No measurements have been logged for this deal yet.</p></div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Room Mismatch Dialog */}
      <Dialog open={!!roomMismatchDialog} onOpenChange={(o) => !o && !roomMismatchDialog?.saving && setRoomMismatchDialog(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Room Name Matching Required</DialogTitle>
            <DialogDescription>Select matching rooms on both sides.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            {(["measurement", "selection"] as const).map((source) => {
              const roomMap = source === "measurement" ? roomMismatchDialog?.measurementRoomMap : roomMismatchDialog?.selectionRoomMap;
              const selMap = source === "measurement" ? roomMismatchDialog?.measurementRoomSelectionMap : roomMismatchDialog?.selectionRoomSelectionMap;
              const mergeName = source === "measurement" ? measurementMergeRoomName : selectionMergeRoomName;
              const setMergeName = source === "measurement" ? setMeasurementMergeRoomName : setSelectionMergeRoomName;
              return (
                <Card key={source}>
                  <CardHeader className="pb-2"><CardTitle className="text-base">{source === "measurement" ? "Measurement" : "Selection"} Rooms</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Input value={mergeName} onChange={(e) => setMergeName(e.target.value)} placeholder="Merged room name" />
                      <Button type="button" variant="outline" onClick={() => handleMergeSelectedRooms(source)} disabled={!!roomMismatchDialog?.saving}>Merge Selected</Button>
                    </div>
                    {roomMap && Object.keys(roomMap).map((roomKey) => (
                      <div key={`${source}-${roomKey}`} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">Original: {roomLabelFromKey(roomKey)}</p>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input type="checkbox" checked={!!selMap?.[roomKey]} onChange={(e) => handleMismatchDialogRoomToggle(source, roomKey, e.target.checked)} /> Use
                          </label>
                        </div>
                        <Input value={roomMap[roomKey]} onChange={(e) => handleMismatchDialogRoomChange(source, roomKey, e.target.value)} placeholder="Enter room name" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <DialogFooter className="gap-2">
            {!roomMismatchReady && <p className="text-sm text-destructive mr-auto">Room sets don't match yet.</p>}
            <Button variant="outline" onClick={() => setRoomMismatchDialog(null)} disabled={!!roomMismatchDialog?.saving}>Cancel</Button>
            <Button onClick={handleApplyRoomAlignmentAndOpenEditor} disabled={!roomMismatchReady || !!roomMismatchDialog?.saving}>
              {roomMismatchDialog?.saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save & Open Editor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Measurement Preview Dialog */}
      <Dialog open={!!viewingMeasurement} onOpenChange={() => setViewingMeasurement(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Measurement Preview</DialogTitle>
            <DialogDescription>Review details before downloading PDF.</DialogDescription>
          </DialogHeader>
          <div id="measurement-preview-content">
            {viewingMeasurement && customer && deal && (
              <MeasurementPreviewDialog open={!!viewingMeasurement} onOpenChange={() => setViewingMeasurement(null)}
                data={{ customerName: customer.name, dealId: deal.dealId, doerName: viewingMeasurement.doerName, rooms: viewingMeasurement.rooms || [] }}
                onSave={() => {}} saving={false} saveStep="idle"
              />
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setViewingMeasurement(null)}>Close</Button>
            <Button onClick={handleDownloadPdf} disabled={pdfLoading}>
              {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}