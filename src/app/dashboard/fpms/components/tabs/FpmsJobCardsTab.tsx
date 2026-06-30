"use client";

import { BadgeCheck, CalendarClock, Clock3, ScanLine, Workflow, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { jobCardRows, schedulingRows } from "../../fpmsData";
import {
  PMS_CARD_DESCRIPTION_CLASS,
  PMS_CARD_HEADER_CLASS,
  PMS_CARD_TITLE_CLASS,
  PMS_SECTION_CARD_CLASS,
  PMS_TABLE_HEAD_CLASS,
  PMS_TABLE_HEADER_ROW_CLASS,
} from "@/app/dashboard/pms/utils/pmsStyles";

type OrderFlowRow = {
  id: string;
  orderNo: string;
  customer: string;
  customerDemand: string;
  formStatus: string;
  product: string;
  measurement: string;
  bedDrawingNo: string;
  furnitureDrawingNo: string;
  drawingStatus: "pending" | "approved" | "rejected";
  barcode: string;
  smOwner: string;
  materialReady: boolean;
  bomStatus: "locked" | "started";
};

type Props = {
  orderFlows: OrderFlowRow[];
  onApproveDrawing: (id: string) => void;
  onRejectDrawing: (id: string) => void;
};

export function FpmsJobCardsTab({ orderFlows, onApproveDrawing, onRejectDrawing }: Props) {
  const getProcessStage = (row: OrderFlowRow) => {
    if (row.bomStatus === "started") return "BOM Started";
    if (row.materialReady && row.drawingStatus === "approved") return "Material Ready";
    if (row.drawingStatus === "approved") return "Barcode Generated";
    if (row.drawingStatus === "rejected") return "Drawing Rework";
    if (row.formStatus === "filled") return "Drawing Preparation";
    return "Order Process Started";
  };

  return (
    <TabsContent value="job-cards" className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Step 1</div>
            <div className="mt-2 text-sm font-semibold text-slate-950">Order Received</div>
            <div className="mt-1 text-sm text-slate-600">Customer comes first and the order enters the FPMS flow.</div>
          </CardContent>
        </Card>
        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Step 2</div>
            <div className="mt-2 text-sm font-semibold text-slate-950">Customer Form Filled</div>
            <div className="mt-1 text-sm text-slate-600">Customer demand and requirement form are captured first.</div>
          </CardContent>
        </Card>
        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Step 3</div>
            <div className="mt-2 text-sm font-semibold text-slate-950">Bed Measurement</div>
            <div className="mt-1 text-sm text-slate-600">Bed measurement is taken and linked to the order.</div>
          </CardContent>
        </Card>
        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Step 4</div>
            <div className="mt-2 text-sm font-semibold text-slate-950">Drawing Generated</div>
            <div className="mt-1 text-sm text-slate-600">Bed drawing is made first, then furniture drawing is prepared.</div>
          </CardContent>
        </Card>
        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Step 5</div>
            <div className="mt-2 text-sm font-semibold text-slate-950">SM Confirm / Reject</div>
            <div className="mt-1 text-sm text-slate-600">If `SM` confirms the furniture drawing, barcode is created automatically.</div>
          </CardContent>
        </Card>
        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Step 6</div>
            <div className="mt-2 text-sm font-semibold text-slate-950">BOM Auto Start</div>
            <div className="mt-1 text-sm text-slate-600">BOM starts only when all required items are available.</div>
          </CardContent>
        </Card>
      </div>

      <Card className={PMS_SECTION_CARD_CLASS}>
        <CardHeader className={PMS_CARD_HEADER_CLASS}>
          <CardTitle className={`flex items-center gap-2 ${PMS_CARD_TITLE_CLASS}`}>
            <ScanLine className="h-5 w-5 text-violet-600" />
            Order Intake to Drawing Approval
          </CardTitle>
          <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
            The moment the customer order comes in, the process starts. Customer form is filled, demand is noted,
            bed measurement is taken, bed and furniture drawings are generated, then `SM` confirms or rejects it.
            Barcode is generated only after confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-3">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Order</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Process stage</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Form</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Customer demand</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Customer</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Bed measurement</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Bed drawing</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Furniture drawing</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>SM status</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Barcode</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderFlows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.orderNo}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.bomStatus === "started"
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : row.drawingStatus === "approved"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : row.drawingStatus === "rejected"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                        }
                      >
                        {getProcessStage(row)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                        {row.formStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.customerDemand}</TableCell>
                    <TableCell>
                      <div>{row.customer}</div>
                      <div className="text-xs text-slate-500">{row.product}</div>
                    </TableCell>
                    <TableCell>{row.measurement}</TableCell>
                    <TableCell>
                      <div>{row.bedDrawingNo}</div>
                      <div className="text-xs text-slate-500">Bed drawing</div>
                    </TableCell>
                    <TableCell>
                      <div>{row.furnitureDrawingNo}</div>
                      <div className="text-xs text-slate-500">Furniture drawing</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.drawingStatus === "approved"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : row.drawingStatus === "rejected"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                        }
                      >
                        {row.drawingStatus === "approved"
                          ? `Confirmed by ${row.smOwner}`
                          : row.drawingStatus === "rejected"
                            ? `Rejected by ${row.smOwner}`
                            : `Waiting for ${row.smOwner}`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.barcode ? (
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                          {row.barcode}
                        </Badge>
                      ) : (
                        <span className="text-sm text-slate-500">Blocked until confirm</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="gap-1"
                          onClick={() => onApproveDrawing(row.id)}
                          disabled={row.drawingStatus === "approved"}
                        >
                          <BadgeCheck className="h-4 w-4" />
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => onRejectDrawing(row.id)}
                          disabled={row.drawingStatus === "rejected"}
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {schedulingRows.map((row) => (
          <Card key={row.stage} className={PMS_SECTION_CARD_CLASS}>
            <CardHeader className={PMS_CARD_HEADER_CLASS}>
              <CardTitle className={`flex items-center gap-2 text-base ${PMS_CARD_TITLE_CLASS}`}>
                <Clock3 className="h-4 w-4 text-amber-600" />
                {row.stage}
              </CardTitle>
              <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>{row.dependency}</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-3">
              <div className="text-2xl font-semibold text-slate-950">{row.duration}</div>
              <p className="mt-1 text-sm text-slate-500">standard stage duration</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className={PMS_SECTION_CARD_CLASS}>
        <CardHeader className={PMS_CARD_HEADER_CLASS}>
          <CardTitle className={`flex items-center gap-2 ${PMS_CARD_TITLE_CLASS}`}>
            <Workflow className="h-5 w-5 text-sky-600" />
            Job Card Scheduler
          </CardTitle>
          <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
            Order-ready planning view based on queue dependency, start date, and committed ready date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-4 pt-3">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Job card</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Order</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Product</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Start date</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Ready date</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Queue note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobCardRows.map((row) => (
                  <TableRow key={row.jobCard}>
                    <TableCell className="font-medium">{row.jobCard}</TableCell>
                    <TableCell>{row.orderNo}</TableCell>
                    <TableCell>{row.product}</TableCell>
                    <TableCell>{row.startDate}</TableCell>
                    <TableCell>{row.readyDate}</TableCell>
                    <TableCell>{row.currentQueue}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-slate-50/75 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <CalendarClock className="h-4 w-4 text-emerald-600" />
                Delivery date logic
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Ready Date = Start Date + stage durations + drying or handling buffer time.
              </p>
            </div>
            <div className="rounded-lg border bg-amber-50/70 p-4">
              <div className="text-sm font-medium text-amber-900">Queue-aware planning</div>
              <p className="mt-2 text-sm text-amber-800">
                If a machine or artisan is busy, the next available slot becomes the automatic stage start.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
