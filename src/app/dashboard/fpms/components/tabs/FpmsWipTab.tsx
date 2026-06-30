"use client";

import { AlertTriangle, CheckCircle2, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { wipRows } from "../../fpmsData";
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
  product: string;
  measurement: string;
  drawingNo: string;
  drawingStatus: "pending" | "approved" | "rejected";
  barcode: string;
  smOwner: string;
  materialReady: boolean;
  bomStatus: "locked" | "started";
};

type Props = {
  orderFlows: OrderFlowRow[];
};

export function FpmsWipTab({ orderFlows }: Props) {
  const startedCount = orderFlows.filter((row) => row.bomStatus === "started").length;

  return (
    <TabsContent value="wip" className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className={`${PMS_SECTION_CARD_CLASS} border-amber-200 bg-amber-50/60`}>
          <CardContent className="flex items-center gap-3 p-4">
            <PackageCheck className="h-9 w-9 text-amber-600" />
            <div>
              <div className="text-xl font-semibold text-amber-950">{startedCount || wipRows.length}</div>
              <div className="text-sm text-amber-900">BOM started / live items</div>
            </div>
          </CardContent>
        </Card>
        <Card className={`${PMS_SECTION_CARD_CLASS} border-rose-200 bg-rose-50/60`}>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-9 w-9 text-rose-600" />
            <div>
              <div className="text-xl font-semibold text-rose-950">
                {wipRows.filter((row) => row.state === "Delayed").length}
              </div>
              <div className="text-sm text-rose-900">Delay alerts</div>
            </div>
          </CardContent>
        </Card>
        <Card className={`${PMS_SECTION_CARD_CLASS} border-emerald-200 bg-emerald-50/60`}>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            <div>
              <div className="text-xl font-semibold text-emerald-950">{startedCount}</div>
              <div className="text-sm text-emerald-900">Auto released to BOM</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={PMS_SECTION_CARD_CLASS}>
        <CardHeader className={PMS_CARD_HEADER_CLASS}>
          <CardTitle className={`flex items-center gap-2 ${PMS_CARD_TITLE_CLASS}`}>
            <PackageCheck className="h-5 w-5 text-sky-600" />
            Pre-Production Gate Status
          </CardTitle>
          <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
            Workshop work should start only after the drawing is confirmed, barcode is created, and BOM is started.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-3">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Order</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Drawing</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Barcode</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Items available</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>BOM gate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderFlows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.orderNo}</TableCell>
                    <TableCell>{row.drawingStatus}</TableCell>
                    <TableCell>{row.barcode || "Pending"}</TableCell>
                    <TableCell>{row.materialReady ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.bomStatus === "started"
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }
                      >
                        {row.bomStatus === "started"
                          ? "Production can run"
                          : "Blocked"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className={PMS_SECTION_CARD_CLASS}>
        <CardHeader className={PMS_CARD_HEADER_CLASS}>
          <CardTitle className={`flex items-center gap-2 ${PMS_CARD_TITLE_CLASS}`}>
            <PackageCheck className="h-5 w-5 text-violet-600" />
            Work-in-Progress Monitor
          </CardTitle>
          <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
            Use stage check-ins and delay alerts to know what is moving and what needs intervention.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-3">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Order</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Product</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Current stage</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Age</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Allowed time</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wipRows.map((row) => (
                  <TableRow key={row.orderNo}>
                    <TableCell className="font-medium">{row.orderNo}</TableCell>
                    <TableCell>{row.product}</TableCell>
                    <TableCell>{row.currentStage}</TableCell>
                    <TableCell>{row.age}</TableCell>
                    <TableCell>{row.limit}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.state === "Delayed"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }
                      >
                        {row.state}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
