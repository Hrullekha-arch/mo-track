"use client";

import { ArrowRight, Boxes, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { bomRows, routingFlow } from "../../fpmsData";
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
  onMaterialReady: (id: string) => void;
};

export function FpmsBomRecipeTab({ orderFlows, onMaterialReady }: Props) {
  return (
    <TabsContent value="bom" className="space-y-4">
      <Card className={PMS_SECTION_CARD_CLASS}>
        <CardHeader className={PMS_CARD_HEADER_CLASS}>
          <CardTitle className={`flex items-center gap-2 ${PMS_CARD_TITLE_CLASS}`}>
            <Boxes className="h-5 w-5 text-sky-600" />
            BOM Release Gate
          </CardTitle>
          <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
            Use this BOM form only after the customer requirement form is filled, the furniture drawing is
            approved by `SM`, and all required items are available.
            Once both are complete, BOM starts automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-3">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Order</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Furniture drawing</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Barcode</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Customer demand</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Material status</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>BOM status</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderFlows.map((row) => {
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.orderNo}</div>
                        <div className="text-xs text-slate-500">{row.product}</div>
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
                          {row.furnitureDrawingNo} / {row.drawingStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.barcode || <span className="text-sm text-slate-500">Not generated</span>}
                      </TableCell>
                      <TableCell>{row.customerDemand}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            row.materialReady
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-50 text-slate-700"
                          }
                        >
                          {row.materialReady ? "All items available" : "Waiting material"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            row.bomStatus === "started"
                              ? "border-sky-200 bg-sky-50 text-sky-700"
                              : "border-slate-200 bg-slate-50 text-slate-700"
                          }
                        >
                          {row.bomStatus === "started" ? "started automatically" : "locked"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onMaterialReady(row.id)}
                            disabled={row.materialReady || row.drawingStatus !== "approved"}
                          >
                            Items Available
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className={PMS_SECTION_CARD_CLASS}>
          <CardHeader className={PMS_CARD_HEADER_CLASS}>
            <CardTitle className={`flex items-center gap-2 ${PMS_CARD_TITLE_CLASS}`}>
              <Boxes className="h-5 w-5 text-amber-600" />
              Material Matrix
            </CardTitle>
            <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
              Raw materials linked to one finished item with required quantity and stage ownership.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Material</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Qty per unit</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Stage</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bomRows.map((row) => (
                    <TableRow key={`${row.material}-${row.stage}`}>
                      <TableCell className="font-medium">{row.material}</TableCell>
                      <TableCell>{row.qty}</TableCell>
                      <TableCell>{row.stage}</TableCell>
                      <TableCell>{row.notes}</TableCell>
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
              <Workflow className="h-5 w-5 text-emerald-600" />
              Process Routing
            </CardTitle>
            <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
              Each product follows a fixed production path before it reaches finished goods.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              {routingFlow.map((step, index) => (
                <div key={step} className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-xs sm:text-sm">
                    {step}
                  </Badge>
                  {index < routingFlow.length - 1 ? (
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  ) : null}
                </div>
              ))}
            </div>

            <div className="rounded-lg border bg-slate-50/75 p-4">
              <div className="text-sm font-medium text-slate-900">Recipe flow</div>
              <div className="mt-2 text-sm text-slate-600">
                Carpentry -&gt; Painting / Polishing -&gt; Upholstery -&gt; QC &amp; Packing
              </div>
            </div>

            <div className="rounded-lg border bg-emerald-50/60 p-4 text-sm text-emerald-900">
              Routing is the backbone for scheduling, WIP movement, QC approval, and ready-date planning.
              Once the furniture drawing is approved and material is available, the BOM form opens into
              production automatically.
            </div>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
