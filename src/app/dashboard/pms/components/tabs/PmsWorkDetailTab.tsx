import { Fragment } from "react";
import { Check, Edit2, Eye, EyeOff, Loader2, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  EMBELLISHMENT_HOURLY_CHARGE,
  formatInr,
  getOptionalDisplayText,
  getQueueDelayLabel,
} from "../../utils/pmsHelpers";
import { formatPmsDateTime } from "../../utils/pmsDateFormat";
import {
  PMS_CARD_DESCRIPTION_CLASS,
  PMS_CARD_HEADER_CLASS,
  PMS_CARD_TITLE_CLASS,
  PMS_SECTION_CARD_CLASS,
  PMS_TABLE_HEAD_CLASS,
  PMS_TABLE_HEADER_ROW_CLASS,
} from "../../utils/pmsStyles";

type Props = {
  ctx: any;
};

export function PmsWorkDetailTab({ ctx }: Props) {
  return (
    <TabsContent value="work" className="space-y-4">
      <Card className={PMS_SECTION_CARD_CLASS}>
        <CardHeader className={PMS_CARD_HEADER_CLASS}>
          <CardTitle className={PMS_CARD_TITLE_CLASS}>Work Detail</CardTitle>
          <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
            Planned work queue by person, VAS item, and routing roadmap. Planned start time indicates the first available machine/person slot as per queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Planned: {ctx.filteredWorkDetailRows.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                className="w-full md:w-80"
                placeholder="Search order id / name / BCN / barcode..."
                value={ctx.workDetailSearch}
                onChange={(event) => ctx.setWorkDetailSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Order No</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Customer</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>VAS Item</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Qty</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Current Step</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Next Step</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Person</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Machine</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Status</TableHead>
                  <TableHead className={`${PMS_TABLE_HEAD_CLASS} text-right`}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ctx.filteredWorkDetailRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                      No planned work yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  ctx.filteredWorkDetailRows.map((row: any) => {
                    const canDeletePlan =
                      (row.resetJobIds.length > 0 || row.resetPlanDocIds.length > 0) &&
                      row.status !== "IN_PROGRESS";
                    const canManualDone =
                      row.requiresManualDone &&
                      row.status === "IN_PROGRESS" &&
                      Boolean(row.currentJobId);
                    const manualDoneTooltip = canManualDone
                      ? "Manual Done"
                      : "Manual Done is only available for the two checkpoint steps: after Cutting and before Q&Q.";
                    const isExpanded = Boolean(ctx.expandedWorkRows?.[row.key]);

                    return (
                      <Fragment key={row.key}>
                        <TableRow key={row.key}>
                          <TableCell className="font-medium">{row.orderNo}</TableCell>
                          <TableCell>{row.customer}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{row.vasName}</div>
                              <div className="flex flex-wrap items-center gap-2">
                                {getOptionalDisplayText(row.vasGroup) && (
                                  <div className="text-xs text-muted-foreground">
                                    {getOptionalDisplayText(row.vasGroup)}
                                  </div>
                                )}
                                {row.embellishment?.enabled && (
                                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                    Additional VAS work
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{row.qty}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{row.process}</div>
                              <div className="text-xs text-muted-foreground">
                                Start: {formatPmsDateTime(row.plannedStart)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                End: {formatPmsDateTime(row.plannedEnd)}
                              </div>
                              {row.status === "PLANNED" && (
                                <div className="text-[11px] font-medium text-amber-600">
                                  {getQueueDelayLabel(row.plannedStart)}
                                </div>
                              )}
                              {row.blockedByLabel && (
                                <div className="text-[11px] text-muted-foreground" title={row.blockedByLabel}>
                                  {row.blockedByLabel}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{row.nextProcess || "-"}</div>
                              <div className="text-xs text-muted-foreground">
                                Start: {formatPmsDateTime(row.nextPlannedStart)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                End: {formatPmsDateTime(row.nextPlannedEnd)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Person: {row.nextPerson || "-"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{row.person || "TBD"}</TableCell>
                          <TableCell>{row.machine || "TBD"}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                row.status === "IN_PROGRESS" && "border-emerald-500 text-emerald-600",
                                row.status === "PLANNED" && "border-blue-500 text-blue-600",
                                row.status === "WAITING" && "border-amber-500 text-amber-600",
                                row.status === "DONE" &&
                                  "border-green-500 bg-green-400 text-green-950"
                              )}
                            >
                              {row.status === "DONE" ? "Completed" : row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-9 w-9 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-700"
                                    onClick={() =>
                                      ctx.setExpandedWorkRows((prev: Record<string, boolean>) => ({
                                        ...prev,
                                        [row.key]: !prev[row.key],
                                      }))
                                    }
                                    aria-label={isExpanded ? "Hide" : "View"}
                                  >
                                    {isExpanded ? (
                                      <EyeOff className="h-4 w-4" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{isExpanded ? "Hide" : "View"}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Button
                                      size="icon"
                                      variant="secondary"
                                      className={cn(
                                        "h-9 w-9 text-white",
                                        canManualDone
                                          ? "bg-emerald-600 hover:bg-emerald-700"
                                          : "bg-slate-400 hover:bg-slate-400"
                                      )}
                                      disabled={
                                        !canManualDone ||
                                        ctx.manualDoneSaving ||
                                        ctx.deletingPlanKey === row.key ||
                                        ctx.runningAutopilot ||
                                        ctx.runningPriorityReplan ||
                                        ctx.resettingAutopilot ||
                                        Boolean(ctx.priorityUpdatingOrderId)
                                      }
                                      onClick={() => ctx.handleOpenManualDoneDialog(row)}
                                      aria-label={manualDoneTooltip}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-64 text-center">
                                  {manualDoneTooltip}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="destructive"
                                    className="h-9 w-9 border border-rose-200 bg-rose-200 text-white hover:bg-rose-300"
                                    disabled={
                                      !canDeletePlan ||
                                      ctx.deletingPlanKey === row.key ||
                                      ctx.runningAutopilot ||
                                      ctx.runningPriorityReplan ||
                                      ctx.resettingAutopilot ||
                                      Boolean(ctx.priorityUpdatingOrderId)
                                    }
                                    onClick={() => ctx.handleDeletePlannedWork(row)}
                                    aria-label="Delete plan"
                                  >
                                    {ctx.deletingPlanKey === row.key ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete Plan</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${row.key}-details`}>
                            <TableCell colSpan={10} className="bg-muted/30">
                              <div className="space-y-3">
                                <div className="text-xs text-muted-foreground">
                                  Routing roadmap for {row.productName}
                                </div>
                                {row.embellishment?.enabled && (
                                  <div className="rounded-lg border bg-white p-4">
                                    <div className="mb-3 flex items-center justify-between">
                                      <div className="text-sm font-medium">Additional VAS Details</div>
                                      <div className="flex items-center gap-2">
                                        {ctx.canManagePms && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                size="icon"
                                                variant="outline"
                                                className="h-8 w-8"
                                                onClick={() => ctx.handleEditWorkDetailEmbellishment(row)}
                                                aria-label="Edit Additional VAS"
                                              >
                                                <Edit2 className="h-4 w-4" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Edit Additional VAS</TooltipContent>
                                          </Tooltip>
                                        )}
                                        <Badge variant="outline">Configured</Badge>
                                      </div>
                                    </div>
                                    <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                                      <WorkMetric label="Customer" value={row.embellishment.customerName || row.customer} />
                                      <WorkMetric label="Phone" value={row.embellishment.customerPhone || "-"} />
                                      <WorkMetric label="Windows" value={row.embellishment.numberOfWindows || 0} />
                                      <WorkMetric label="Panels" value={row.embellishment.numberOfPanels || 0} />
                                      <WorkMetric label="Barcode" value={row.embellishment.embellishmentBarcode || "-"} />
                                      <WorkMetric label="Stitching / Panel (min)" value={`${row.embellishment.stitchingPerPanel || 0} min`} />
                                      <WorkMetric label="Design Time (min)" value={`${row.embellishment.designTime || 0} min`} />
                                      <WorkMetric label="Hand Work Time (min)" value={`${row.embellishment.handWorkTime || 0} min`} />
                                      <WorkMetric label="Total Time (min)" value={`${row.embellishment.totalTime || 0} min`} />
                                      <WorkMetric label="Total Hours" value={`${row.embellishment.totalHours || 0} hr`} />
                                      <WorkMetric
                                        label="1 Hour Charge"
                                        value={formatInr(
                                          row.embellishment.hourlyCharge || EMBELLISHMENT_HOURLY_CHARGE
                                        )}
                                      />
                                      <WorkMetric
                                        label="Charge Amount"
                                        value={formatInr(row.embellishment.chargeAmount || 0)}
                                      />
                                    </div>
                                  </div>
                                )}
                                {row.routingSteps.length === 0 ? (
                                  <div className="text-sm text-muted-foreground">
                                    No routing steps found for this product.
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <div className="flex min-w-max items-center gap-2">
                                      {row.routingSteps.map((step: any, index: number) => {
                                        const currentStep = row.currentStepNo ?? 0;
                                        const stepPlan = row.stepPlanMap.get(step.stepNo);
                                        const rawStepStatus = String(
                                          stepPlan?.status ||
                                            (currentStep && step.stepNo < currentStep ? "DONE" : "")
                                        )
                                          .trim()
                                          .toUpperCase();
                                        const isDone = rawStepStatus === "DONE";
                                        const isInProgress = rawStepStatus === "IN_PROGRESS";
                                        const isCurrent = currentStep && step.stepNo === currentStep;
                                        const tone = isDone
                                          ? "bg-green-400 border-green-500 text-green-950"
                                          : isInProgress
                                          ? "bg-emerald-100 border-emerald-600 text-emerald-700"
                                          : isCurrent
                                          ? "bg-blue-50 border-blue-500 text-blue-700"
                                          : "bg-white border-muted-foreground/40 text-muted-foreground";
                                        const connectorTone = isDone
                                          ? "bg-green-500"
                                          : isInProgress || isCurrent
                                          ? "bg-blue-400"
                                          : "bg-muted-foreground/30";

                                        return (
                                          <div key={`${row.key}-${step.stepNo}`} className="flex items-center">
                                            <div className="flex flex-col items-center">
                                              <div
                                                className={cn(
                                                  "flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold",
                                                  tone
                                                )}
                                              >
                                                {isDone ? <Check className="h-4 w-4" /> : step.stepNo}
                                              </div>
                                              <div className="mt-1 max-w-[80px] text-center text-[11px] text-muted-foreground">
                                                {step.process}
                                              </div>
                                              <div className="mt-1 text-center text-[10px] leading-tight text-muted-foreground">
                                                <div className={cn(isDone && "font-semibold text-green-700")}>
                                                  {isDone ? "Completed" : rawStepStatus || "PENDING"}
                                                </div>
                                                <div>
                                                  Start:{" "}
                                                  {formatPmsDateTime(
                                                    isDone
                                                      ? stepPlan?.actualStart || stepPlan?.plannedStart
                                                      : stepPlan?.plannedStart
                                                  )}
                                                </div>
                                                <div>
                                                  End:{" "}
                                                  {formatPmsDateTime(
                                                    isDone
                                                      ? stepPlan?.actualEnd || stepPlan?.plannedEnd
                                                      : stepPlan?.plannedEnd
                                                  )}
                                                </div>
                                                <div>Person: {stepPlan?.personName || "-"}</div>
                                                <div>Machine: {stepPlan?.machineName || "-"}</div>
                                                {rawStepStatus === "WAITING" && !stepPlan?.personName && stepPlan?.noPlanReason && (
                                                  <div className="mt-0.5 text-[9px] text-amber-600">
                                                    {stepPlan.noPlanReason}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                            {index < row.routingSteps.length - 1 && (
                                              <div className={cn("mx-2 h-[2px] w-12 rounded-full", connectorTone)} />
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function WorkMetric({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
