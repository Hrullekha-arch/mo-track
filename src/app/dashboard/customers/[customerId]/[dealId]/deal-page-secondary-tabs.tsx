"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { format } from "date-fns";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import {
  Cpd,
  Customer,
  Deal,
  DealMeasurement,
  Quotation,
  User,
} from "@/lib/types";
import { getCustomerById } from "../../actions";
import {
  getDealById,
  getMeasurementById,
  getSelectionById,
} from "./actions";
import {
  EMPTY_ROOM_KEY,
  normalizeStrictRoom,
  roomLabelFromKey,
  toStrictRoomKey,
} from "./deal-page-utils";
import { MeasurementForm } from "@/components/features/customer/MeasurementForm";
import { MeasurementPreviewDialog } from "@/components/features/measurement/MeasurementPreviewDialog";
import { PrintableCpd, PrintableCustomerCpd } from "@/components/features/customer/PrintableCpd";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Download, Eye, FileText, GanttChartSquare, Pencil, PlusCircleIcon, RefreshCw, SquareCheckBig, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type MeasurementsTabProps = {
  customerId: string;
  dealId: string;
  measurements: DealMeasurement[];
  onRefresh: () => void;
};

export function MeasurementsTab({
  customerId,
  dealId,
  measurements,
  onRefresh,
}: MeasurementsTabProps) {
  const { role } = useAuth();
  const router = useRouter();
  const [viewingMeasurement, setViewingMeasurement] = useState<DealMeasurement | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const { toast } = useToast();

  type RoomMismatchDialogState = {
    measurementId: string;
    selectionId: string;
    measurementData: any;
    selectionData: any;
    measurementRoomMap: Record<string, string>;
    selectionRoomMap: Record<string, string>;
    saving: boolean;
  };

  const [roomMismatchDialog, setRoomMismatchDialog] =
    useState<RoomMismatchDialogState | null>(null);

  const getStrictRoomSetFromMap = (roomMap: Record<string, string>) =>
    new Set(
      Object.values(roomMap)
        .map((name) => normalizeStrictRoom(name))
        .filter(Boolean),
    );

  const areStrictRoomSetsEqual = (
    measurementRoomMap: Record<string, string>,
    selectionRoomMap: Record<string, string>,
  ) => {
    const measurementSet = getStrictRoomSetFromMap(measurementRoomMap);
    const selectionSet = getStrictRoomSetFromMap(selectionRoomMap);
    if (measurementSet.size !== selectionSet.size) return false;
    for (const room of measurementSet) {
      if (!selectionSet.has(room)) return false;
    }
    return true;
  };

  const updateMeasurementSelectionId = async (
    measurementId: string,
    selectionId: string,
  ): Promise<void> => {
    const measurementRef = doc(
      db,
      "customers",
      customerId,
      "deals",
      dealId,
      "measurements",
      measurementId,
    );

    await updateDoc(measurementRef, { selectionId });
  };

  const [editingMap, setEditingMap] = useState<
    Record<string, { isEditing: boolean; tempSelection: string }>
  >({});

  const getEditState = (id: string) =>
    editingMap[id] ?? { isEditing: false, tempSelection: "" };

  const handleEdit = (id: string) => {
    setEditingMap((prev) => ({
      ...prev,
      [id]: { isEditing: true, tempSelection: "" },
    }));
  };

  const handleChange = (id: string, value: string) => {
    setEditingMap((prev) => ({
      ...prev,
      [id]: { ...getEditState(id), tempSelection: value },
    }));
  };

  const handleSave = async (id: string) => {
    const { tempSelection } = getEditState(id);
    await updateMeasurementSelectionId(id, tempSelection);
    onRefresh();
    setEditingMap((prev) => ({
      ...prev,
      [id]: { isEditing: false, tempSelection: "" },
    }));
  };

  const handleCancel = (id: string) => {
    setEditingMap((prev) => ({
      ...prev,
      [id]: { isEditing: false, tempSelection: "" },
    }));
  };

  const handleViewPdf = async (measurementId: string) => {
    const fullMeasurement = await getMeasurementById(customerId, dealId, measurementId);
    const customerData = await getCustomerById(customerId);
    const dealData = await getDealById(customerId, dealId);

    if (fullMeasurement && customerData && dealData) {
      setCustomer(customerData);
      setDeal(dealData);
      setViewingMeasurement(fullMeasurement);
    } else {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not load measurement details.",
      });
    }
  };

  const getUniqueRoomKeys = (rooms: unknown[]) =>
    Array.from(new Set(rooms.map((room) => toStrictRoomKey(room))));

  const hasBlankRoomNames = (roomMap: Record<string, string>) =>
    Object.values(roomMap).some((room) => !String(room).trim());

  const handleMismatchDialogRoomChange = (
    source: "measurement" | "selection",
    originalKey: string,
    value: string,
  ) => {
    setRoomMismatchDialog((prev) => {
      if (!prev) return prev;
      if (source === "measurement") {
        return {
          ...prev,
          measurementRoomMap: {
            ...prev.measurementRoomMap,
            [originalKey]: value,
          },
        };
      }
      return {
        ...prev,
        selectionRoomMap: {
          ...prev.selectionRoomMap,
          [originalKey]: value,
        },
      };
    });
  };

  const handleApplyRoomAlignmentAndOpenEditor = async () => {
    if (!roomMismatchDialog) return;

    if (
      hasBlankRoomNames(roomMismatchDialog.measurementRoomMap) ||
      hasBlankRoomNames(roomMismatchDialog.selectionRoomMap) ||
      !areStrictRoomSetsEqual(
        roomMismatchDialog.measurementRoomMap,
        roomMismatchDialog.selectionRoomMap,
      )
    ) {
      toast({
        variant: "destructive",
        title: "Rooms Still Not Matched",
        description:
          "Please make both Selection and Measurement room names identical before opening editor.",
      });
      return;
    }

    try {
      setRoomMismatchDialog((prev) => (prev ? { ...prev, saving: true } : prev));

      const updatedMeasurementRooms = (
        roomMismatchDialog.measurementData?.rooms || []
      ).map((room: any) => {
        const key = toStrictRoomKey(room?.roomName);
        return {
          ...room,
          roomName: String(roomMismatchDialog.measurementRoomMap[key] ?? "").trim(),
        };
      });

      const updatedSelectionProducts = (
        roomMismatchDialog.selectionData?.products || []
      ).map((item: any) => {
        const key = toStrictRoomKey(item?.room);
        return {
          ...item,
          room: String(roomMismatchDialog.selectionRoomMap[key] ?? "").trim(),
        };
      });

      const measurementRef = doc(
        db,
        "customers",
        customerId,
        "deals",
        dealId,
        "measurements",
        roomMismatchDialog.measurementId,
      );
      const selectionRef = doc(
        db,
        "customers",
        customerId,
        "deals",
        dealId,
        "selections",
        roomMismatchDialog.selectionId,
      );

      await Promise.all([
        updateDoc(measurementRef, { rooms: updatedMeasurementRooms }),
        updateDoc(selectionRef, { products: updatedSelectionProducts }),
      ]);

      const editMeasurementId = roomMismatchDialog.measurementId;
      setRoomMismatchDialog(null);
      router.push(
        `/dashboard/customers/${customerId}/${dealId}/measurement/${editMeasurementId}/edit`,
      );
    } catch (error) {
      console.error("Failed to save aligned room names:", error);
      toast({
        variant: "destructive",
        title: "Failed To Save Room Names",
        description: "Could not update room names for selection/measurement.",
      });
      setRoomMismatchDialog((prev) => (prev ? { ...prev, saving: false } : prev));
    }
  };

  const handleOpenMeasurementEditor = async (measurementId: string) => {
    try {
      const measurement = await getMeasurementById(customerId, dealId, measurementId);
      if (!measurement) {
        toast({
          variant: "destructive",
          title: "Measurement Not Found",
          description: "Could not load measurement details before opening editor.",
        });
        return;
      }

      if (!measurement.selectionId) {
        toast({
          variant: "destructive",
          title: "Selection Missing",
          description:
            "Selection ID is missing on this measurement. Please update selection ID first.",
        });
        return;
      }

      const selection = await getSelectionById(
        customerId,
        dealId,
        String(measurement.selectionId),
      );
      if (!selection) {
        toast({
          variant: "destructive",
          title: "Selection Not Found",
          description: "Linked selection was not found. Please verify selection ID.",
        });
        return;
      }

      const measurementRoomKeys = getUniqueRoomKeys(
        (measurement.rooms || []).map((room: any) => room?.roomName),
      );
      const selectionRoomKeys = getUniqueRoomKeys(
        (selection.products || []).map((item: any) => item?.room),
      );

      const measurementRoomMap = measurementRoomKeys.reduce((acc, key) => {
        acc[key] = key === EMPTY_ROOM_KEY ? "" : key;
        return acc;
      }, {} as Record<string, string>);
      const selectionRoomMap = selectionRoomKeys.reduce((acc, key) => {
        acc[key] = key === EMPTY_ROOM_KEY ? "" : key;
        return acc;
      }, {} as Record<string, string>);

      const roomsMatched =
        !hasBlankRoomNames(measurementRoomMap) &&
        !hasBlankRoomNames(selectionRoomMap) &&
        areStrictRoomSetsEqual(measurementRoomMap, selectionRoomMap);

      if (!roomsMatched) {
        toast({
          variant: "destructive",
          title: "Room Names Mismatch",
          description:
            "Match room names in both lists first. Editor is locked until names match.",
        });
        setRoomMismatchDialog({
          measurementId,
          selectionId: String(measurement.selectionId),
          measurementData: measurement,
          selectionData: selection,
          measurementRoomMap,
          selectionRoomMap,
          saving: false,
        });
        return;
      }

      router.push(
        `/dashboard/customers/${customerId}/${dealId}/measurement/${measurementId}/edit`,
      );
    } catch (error) {
      console.error("Failed to validate rooms before opening editor:", error);
      toast({
        variant: "destructive",
        title: "Failed To Open Editor",
        description: "Could not validate selection/measurement rooms.",
      });
    }
  };

  const handleDownloadPdf = async () => {
    const elementToCapture = document.getElementById("measurement-preview-content");
    if (!elementToCapture) return;

    setPdfLoading(true);
    try {
      const canvas = await html2canvas(elementToCapture, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;

      pdf.addImage(imgData, "PNG", imgX, 0, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`Measurement-${deal?.dealId || "details"}.pdf`);
    } catch (error) {
      console.error("Failed to generate PDF", error);
      toast({
        variant: "destructive",
        title: "PDF Generation Failed",
        description: "Could not generate the measurement PDF.",
      });
    } finally {
      setPdfLoading(false);
    }
  };

  const roomMismatchReadyToProceed = roomMismatchDialog
    ? !hasBlankRoomNames(roomMismatchDialog.measurementRoomMap) &&
      !hasBlankRoomNames(roomMismatchDialog.selectionRoomMap) &&
      areStrictRoomSetsEqual(
        roomMismatchDialog.measurementRoomMap,
        roomMismatchDialog.selectionRoomMap,
      )
    : false;

  return (
    <div className="space-y-4">
      {role !== "installer" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Measurement History</CardTitle>
          </CardHeader>
          <CardContent>
            {measurements.length > 0 ? (
              <div className="space-y-3">
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Doer</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Selection ID</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {measurements.map((measurement, index) => {
                        const { isEditing, tempSelection } = getEditState(measurement.id);
                        return (
                          <TableRow key={measurement.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>{measurement.typeOf || "-"}</TableCell>
                            <TableCell>{measurement.doerName || "-"}</TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div>{measurement.createdBy}</div>
                                <div className="text-muted-foreground">
                                  {measurement.createdAt
                                    ? format(new Date(measurement.createdAt), "dd/MM/yy")
                                    : "-"}
                                </div>
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
                                <div className="flex items-center gap-2">
                                  {!isEditing ? (
                                    <>
                                      <span className="text-sm text-muted-foreground">None</span>
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-7 w-7"
                                        onClick={() => handleEdit(measurement.id)}
                                      >
                                        <PlusCircleIcon className="h-4 w-4" />
                                      </Button>
                                    </>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={tempSelection}
                                        onChange={(event) =>
                                          handleChange(measurement.id, event.target.value)
                                        }
                                        className="h-8 w-[120px]"
                                        placeholder="Enter ID"
                                      />
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-7 w-7 text-green-600"
                                        onClick={() => handleSave(measurement.id)}
                                      >
                                        <SquareCheckBig className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-7 w-7 text-red-500"
                                        onClick={() => handleCancel(measurement.id)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenMeasurementEditor(measurement.id)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleViewPdf(measurement.id)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 md:hidden">
                  {measurements.map((measurement) => (
                    <Card key={measurement.id}>
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold">
                              {measurement.typeOf || "Measurement"}
                            </p>
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
                            <span>
                              {measurement.createdAt
                                ? format(new Date(measurement.createdAt), "dd/MM/yy")
                                : "-"}
                            </span>
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
                            onClick={() => handleOpenMeasurementEditor(measurement.id)}
                          >
                            <Pencil className="mr-1 h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => handleViewPdf(measurement.id)}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <GanttChartSquare className="mx-auto mb-2 h-12 w-12 opacity-50" />
                <p>No measurements have been logged for this deal yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {role === "installer" ? (
        <MeasurementForm customerId={customerId} dealId={dealId} onRefresh={onRefresh} />
      ) : null}

      <Dialog
        open={!!roomMismatchDialog}
        onOpenChange={(open) =>
          !open && !roomMismatchDialog?.saving && setRoomMismatchDialog(null)
        }
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Room Name Matching Required</DialogTitle>
            <DialogDescription>
              Selection and Measurement room names must match exactly. Update both
              sides below, then continue.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Measurement Rooms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {roomMismatchDialog
                  ? Object.keys(roomMismatchDialog.measurementRoomMap).map((roomKey) => (
                      <div key={`measurement-${roomKey}`} className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Original: {roomLabelFromKey(roomKey)}
                        </p>
                        <Input
                          value={roomMismatchDialog.measurementRoomMap[roomKey]}
                          onChange={(event) =>
                            handleMismatchDialogRoomChange(
                              "measurement",
                              roomKey,
                              event.target.value,
                            )
                          }
                          placeholder="Enter room name"
                        />
                      </div>
                    ))
                  : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Selection Rooms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {roomMismatchDialog
                  ? Object.keys(roomMismatchDialog.selectionRoomMap).map((roomKey) => (
                      <div key={`selection-${roomKey}`} className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Original: {roomLabelFromKey(roomKey)}
                        </p>
                        <Input
                          value={roomMismatchDialog.selectionRoomMap[roomKey]}
                          onChange={(event) =>
                            handleMismatchDialogRoomChange(
                              "selection",
                              roomKey,
                              event.target.value,
                            )
                          }
                          placeholder="Enter room name"
                        />
                      </div>
                    ))
                  : null}
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="gap-2">
            {!roomMismatchReadyToProceed ? (
              <p className="mr-auto text-sm text-destructive">
                Room sets still do not match exactly. Editor will remain locked.
              </p>
            ) : null}
            <Button
              variant="outline"
              onClick={() => setRoomMismatchDialog(null)}
              disabled={!!roomMismatchDialog?.saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplyRoomAlignmentAndOpenEditor}
              disabled={!roomMismatchReadyToProceed || !!roomMismatchDialog?.saving}
            >
              {roomMismatchDialog?.saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Match & Open Editor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingMeasurement} onOpenChange={() => setViewingMeasurement(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Measurement Preview</DialogTitle>
            <DialogDescription>
              Review the measurement details before downloading the PDF.
            </DialogDescription>
          </DialogHeader>
          <div id="measurement-preview-content">
            {viewingMeasurement && customer && deal ? (
              <MeasurementPreviewDialog
                open={!!viewingMeasurement}
                onOpenChange={() => setViewingMeasurement(null)}
                data={{
                  customerName: customer.name,
                  dealId: deal.dealId,
                  doerName: viewingMeasurement.doerName,
                  rooms: viewingMeasurement.rooms || [],
                }}
                onSave={() => {}}
                saving={false}
                saveStep="idle"
              />
            ) : null}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setViewingMeasurement(null)}>
              Close
            </Button>
            <Button onClick={handleDownloadPdf} disabled={pdfLoading}>
              {pdfLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CrmActivitySkeleton() {
  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

type CpdTabProps = {
  customer: Customer;
  salesmen: User[];
  deal: Deal;
  onRefresh: () => void;
  quotations: Quotation[];
  cpds: Cpd[];
};

export function CpdTab({
  customer,
  salesmen,
  deal,
  onRefresh,
  quotations,
  cpds,
}: CpdTabProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCpd, setSelectedCpd] = useState<Cpd | null>(null);
  const [customerCpd, setCustomerCpd] = useState<Cpd | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    onRefresh();
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsRefreshing(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Saved CPDs</CardTitle>
              <CardDescription>
                Previously saved Customer Product Details for this deal.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {cpds.length > 0 ? (
            <div className="space-y-3">
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CPD ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Representative</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cpds.map((cpd) => {
                      const isQuotationCreated = quotations.some(
                        (quotation) => quotation.cpdId === cpd.id,
                      );
                      return (
                        <TableRow key={cpd.id}>
                          <TableCell
                            className="cursor-pointer font-medium"
                            onClick={() => setSelectedCpd(cpd)}
                          >
                            {cpd.cpdId}
                          </TableCell>
                          <TableCell>
                            {cpd.date ? format(new Date(cpd.date), "PPP") : "N/A"}
                          </TableCell>
                          <TableCell>{cpd.createdBy}</TableCell>
                          <TableCell>
                            {salesmen.find((salesman) => salesman.id === cpd.representative)
                              ?.name || "N/A"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setCustomerCpd(cpd)}
                              >
                                Customer CPD
                              </Button>
                              {isQuotationCreated ? (
                                <Badge variant="secondary">Quotation Created</Badge>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {cpds.map((cpd) => {
                  const isQuotationCreated = quotations.some(
                    (quotation) => quotation.cpdId === cpd.id,
                  );
                  return (
                    <Card key={cpd.id}>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p
                              className="cursor-pointer text-sm font-semibold"
                              onClick={() => setSelectedCpd(cpd)}
                            >
                              {cpd.cpdId}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {cpd.date ? format(new Date(cpd.date), "dd/MM/yyyy") : "N/A"}
                            </p>
                          </div>
                          {isQuotationCreated ? (
                            <Badge variant="secondary" className="text-xs">
                              Quotation Created
                            </Badge>
                          ) : null}
                        </div>
                        <Separator />
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Created By:</span>
                            <span>{cpd.createdBy}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Representative:</span>
                            <span>
                              {salesmen.find((salesman) => salesman.id === cpd.representative)
                                ?.name || "N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => setCustomerCpd(cpd)}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <FileText className="mx-auto mb-2 h-12 w-12 opacity-50" />
              <p>No CPDs saved for this deal yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedCpd} onOpenChange={() => setSelectedCpd(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>CPD Details: {selectedCpd?.cpdId}</DialogTitle>
            <DialogDescription>
              A printable view of the Customer Product Details.
            </DialogDescription>
          </DialogHeader>
          {selectedCpd ? (
            <PrintableCpd
              cpd={selectedCpd}
              customer={customer}
              deal={deal}
              salesmen={salesmen}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!customerCpd} onOpenChange={() => setCustomerCpd(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer CPD: {customerCpd?.cpdId}</DialogTitle>
            <DialogDescription>
              A simplified, printable view of the Customer Product Details.
            </DialogDescription>
          </DialogHeader>
          {customerCpd ? (
            <PrintableCustomerCpd
              cpd={customerCpd}
              customer={customer}
              deal={deal}
              salesmen={salesmen}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
