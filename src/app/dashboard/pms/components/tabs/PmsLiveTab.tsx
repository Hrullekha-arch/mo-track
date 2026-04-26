import { useMemo, useState } from "react";
import { AlertCircle, CalendarDays, Check, Loader2, Plus, Printer, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getOptionalDisplayText } from "../../utils/pmsHelpers";
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

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function PmsLiveTab({ ctx }: Props) {
  const [nextDayPlanOpen, setNextDayPlanOpen] = useState(false);
  const disabledActions =
    ctx.runningAutopilot ||
    ctx.runningPriorityReplan ||
    ctx.resettingAutopilot ||
    Boolean(ctx.priorityUpdatingOrderId) ||
    Boolean(ctx.deletingPlanKey);
  const sortedProducts = useMemo(
    () =>
      [...ctx.products].sort((left: any, right: any) =>
        String(left?.name || "").localeCompare(String(right?.name || ""))
      ),
    [ctx.products]
  );
  const productOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: "__AUTO__", label: "Auto Match" },
      ...sortedProducts.map((product: any) => ({
        value: product.id,
        label: product.name,
      })),
    ],
    [sortedProducts]
  );
  const tomorrowLabel = useMemo(
    () =>
      new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    []
  );

  const handlePrintNextDayPlan = () => {
    if (typeof window === "undefined") return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rowsHtml =
      ctx.nextDayPlanRows.length > 0
        ? ctx.nextDayPlanRows
            .map(
              (row: any) => `
                <tr>
                  <td>${escapeHtml(row.orderNo)}</td>
                  <td>${escapeHtml(row.customer)}</td>
                  <td>${escapeHtml(row.vasName)}</td>
                  <td>${escapeHtml(row.qty)}</td>
                  <td>${escapeHtml(row.process)}</td>
                  <td>${escapeHtml(row.person)}</td>
                  <td>${escapeHtml(row.machine)}</td>
                  <td>${escapeHtml(formatPmsDateTime(row.plannedStart))}</td>
                  <td>${escapeHtml(formatPmsDateTime(row.plannedEnd))}</td>
                </tr>
              `
            )
            .join("")
        : `<tr><td colspan="9" style="text-align:center;padding:24px;">No plan scheduled for ${escapeHtml(tomorrowLabel)}.</td></tr>`;

    printWindow.document.write(`
      <html>
        <head>
          <title>PMS Next Day Plan - ${escapeHtml(tomorrowLabel)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            p { margin: 0 0 20px; color: #4b5563; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #d1d5db; padding: 10px 8px; font-size: 12px; text-align: left; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>PMS Next Day Plan</h1>
          <p>Plan date: ${escapeHtml(tomorrowLabel)}</p>
          <table>
            <thead>
              <tr>
                <th>Order No</th>
                <th>Customer</th>
                <th>VAS Item</th>
                <th>Qty</th>
                <th>Step</th>
                <th>Person</th>
                <th>Machine</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <TabsContent value="live" className="space-y-4">
      <Card className={PMS_SECTION_CARD_CLASS}>
        <CardHeader className={PMS_CARD_HEADER_CLASS}>
          <CardTitle className={PMS_CARD_TITLE_CLASS}>Live VAS Tracker</CardTitle>
          <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
            Real-time view of VAS work, current processing, and upcoming steps with ETA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4 pt-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Total: {ctx.liveStats.totalItems}</Badge>
              <Badge className="bg-emerald-600 hover:bg-emerald-600">
                In Progress: {ctx.liveStats.inProgress}
              </Badge>
              <Badge className="bg-blue-600 hover:bg-blue-600">Planned: {ctx.liveStats.planned}</Badge>
              <Badge className="bg-amber-500 hover:bg-amber-500">Waiting: {ctx.liveStats.waiting}</Badge>
              <Badge className="bg-red-600 hover:bg-red-600">Emergency: {ctx.liveStats.emergency}</Badge>
              <Badge variant="outline">Done: {ctx.liveStats.done}</Badge>
            </div>
            <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-[420px] lg:max-w-[760px] lg:flex-1 lg:items-end">
              <div className="relative w-full lg:max-w-[340px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="w-full pl-9"
                  placeholder="Search order id / name / BCN / barcode..."
                  value={ctx.vasSearch}
                  onChange={(event) => ctx.setVasSearch(event.target.value)}
                />
              </div>
              <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
              <Button size="sm" variant="outline" onClick={() => setNextDayPlanOpen(true)}>
                <CalendarDays className="mr-2 h-4 w-4" />
                Next Day Plan
              </Button>
              <Button size="sm" variant="outline" onClick={ctx.handleRunAutopilot} disabled={disabledActions}>
                {ctx.runningAutopilot && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Run Autopilot
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={ctx.handleRunPriorityReplan}
                disabled={disabledActions}
              >
                {ctx.runningPriorityReplan && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Priority Replan
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => ctx.setResetAutopilotDialogOpen(true)}
                disabled={disabledActions}
              >
                {ctx.resettingAutopilot && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset & Rerun
              </Button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Order No</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Customer</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>VAS Item</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Qty</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>PMS Product</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Status</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Priority</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Current Step</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Machine</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Person</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Production Start</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Production Complete</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Not Scheduled Reason</TableHead>
                  <TableHead className={`${PMS_TABLE_HEAD_CLASS} w-[92px] text-center`}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ctx.liveVasRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="h-24 text-center text-muted-foreground">
                      No VAS items are active right now.
                    </TableCell>
                  </TableRow>
                ) : (
                  ctx.liveVasRows.map((row: any) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.orderNo}</TableCell>
                      <TableCell>{row.customer}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{row.vasName}</div>
                          <div className="flex flex-wrap items-center gap-2">
                            {getOptionalDisplayText(row.group) && (
                              <div className="text-xs text-muted-foreground">
                                {getOptionalDisplayText(row.group)}
                              </div>
                            )}
                            {row.requiresEmbellishment && !row.embellishment?.enabled && (
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                Additional VAS required
                              </Badge>
                            )}
                            {row.embellishment?.enabled && (
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                Additional VAS ready
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{row.qty}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {ctx.role === "admin" ? (
                            <Combobox
                              options={productOptions}
                              value={
                                row.matchedProductId &&
                                sortedProducts.some((product: any) => product.id === row.matchedProductId)
                                  ? row.matchedProductId
                                  : "__AUTO__"
                              }
                              placeholder="Auto Match"
                              searchPlaceholder="Search PMS product..."
                              emptyPlaceholder="No PMS product found."
                              disabled={ctx.updatingLiveRowKey === row.key || disabledActions}
                              onSelect={(value) => ctx.handleAssignLiveVasProduct(row, value || "__AUTO__")}
                              className="h-8 w-[220px] text-xs"
                              inputClassName="h-8 text-xs"
                              contentClassName="p-0"
                            />
                          ) : (
                            <div className="font-medium">{row.matchedProductName || "No match"}</div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-xs text-muted-foreground">
                              {row.matchedProductName || "Create PMS product"}
                            </div>
                            {row.hasProductOverride && (
                              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                                Override
                              </Badge>
                            )}
                            {ctx.updatingLiveRowKey === row.key && (
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                Updating
                              </Badge>
                            )}
                          </div>
                          {row.matchedProductId && !row.hasRouting && (
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-amber-600">Routing not created yet</div>
                              {ctx.role === "admin" && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => ctx.handleOpenRoutingSetup(row.matchedProductId)}
                                >
                                  Create Routing
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            row.status === "IN_PROGRESS" && "bg-emerald-600 hover:bg-emerald-600",
                            row.status === "PLANNED" && "bg-blue-600 hover:bg-blue-600",
                            row.status === "WAITING" && "bg-amber-500 hover:bg-amber-500",
                            row.status === "DONE" && "bg-slate-500 hover:bg-slate-500"
                          )}
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={row.isEmergency ? "destructive" : "secondary"}
                          className={cn(
                            row.isEmergency && "animate-pulse",
                            !row.isEmergency &&
                              row.orderPriority <= 0 &&
                              "bg-orange-100 text-orange-700 hover:bg-orange-100",
                            !row.isEmergency &&
                              row.orderPriority > 0 &&
                              "bg-slate-100 text-slate-700 hover:bg-slate-100"
                          )}
                        >
                          {row.priorityLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.currentProcess}</TableCell>
                      <TableCell>{row.machineName}</TableCell>
                      <TableCell>{row.personName}</TableCell>
                      <TableCell>{formatPmsDateTime(row.plannedStart)}</TableCell>
                      <TableCell>{formatPmsDateTime(row.eta)}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>{row.noPlanReason || "-"}</div>
                          {row.matchedProductId && !row.hasRouting && ctx.role === "admin" && (
                            <div className="text-xs text-amber-600">
                              Admin suggestion: create routing for this product.
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="w-[92px] text-center">
                        <div className="flex justify-center gap-2 whitespace-nowrap">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant={row.hasJobsForProduct ? "secondary" : "outline"}
                                className="h-9 w-9 shrink-0"
                                aria-label={row.hasJobsForProduct ? "Jobs created" : "Create jobs"}
                                disabled={
                                  ctx.creatingJobKey === row.key ||
                                  row.hasJobsForProduct ||
                                  !row.matchedProductId ||
                                  !row.hasRouting ||
                                  disabledActions
                                }
                                onClick={() => ctx.handleOpenCreateJobDialog(row)}
                              >
                                {ctx.creatingJobKey === row.key ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : row.hasJobsForProduct ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Plus className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {row.hasJobsForProduct
                                ? "Jobs Created"
                                : row.requiresEmbellishment
                                ? "Open Additional VAS Form"
                                : "Start PMS"}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant={row.isEmergency ? "outline" : "destructive"}
                                className="h-9 w-9 shrink-0"
                                aria-label={row.isEmergency ? "Clear emergency" : "Mark emergency"}
                                disabled={
                                  ctx.priorityUpdatingOrderId === row.orderId || disabledActions
                                }
                                onClick={() =>
                                  ctx.handleSetOrderEmergencyPriority(row.orderId, !row.isEmergency)
                                }
                              >
                                {ctx.priorityUpdatingOrderId === row.orderId ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : row.isEmergency ? (
                                  <X className="h-4 w-4" />
                                ) : (
                                  <AlertCircle className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {row.isEmergency ? "Clear Emergency" : "Mark Emergency"}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={nextDayPlanOpen} onOpenChange={setNextDayPlanOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-6xl flex-col">
          <DialogHeader>
            <DialogTitle>Next Day Plan</DialogTitle>
            <DialogDescription>
              Planned PMS work for {tomorrowLabel}. Admin can review this list and print it for production.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 rounded-md border">
            <div className="min-w-[920px]">
              <Table>
                <TableHeader>
                  <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Order No</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Customer</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>VAS Item</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Qty</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Step</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Person</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Machine</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>Start</TableHead>
                    <TableHead className={PMS_TABLE_HEAD_CLASS}>End</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ctx.nextDayPlanRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                        No plan is scheduled for {tomorrowLabel}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ctx.nextDayPlanRows.map((row: any) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.orderNo}</TableCell>
                        <TableCell>{row.customer}</TableCell>
                        <TableCell>{row.vasName}</TableCell>
                        <TableCell>{row.qty}</TableCell>
                        <TableCell>{row.process}</TableCell>
                        <TableCell>{row.person}</TableCell>
                        <TableCell>{row.machine}</TableCell>
                        <TableCell>{formatPmsDateTime(row.plannedStart)}</TableCell>
                        <TableCell>{formatPmsDateTime(row.plannedEnd)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNextDayPlanOpen(false)}>
              Close
            </Button>
            <Button onClick={handlePrintNextDayPlan}>
              <Printer className="mr-2 h-4 w-4" />
              Print Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TabsContent>
  );
}
