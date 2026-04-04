import { Check, Clock, Package, Search, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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

export function PmsWorkStatusTab({ ctx }: Props) {
  return (
    <TabsContent value="status" className="space-y-4">
      <Card className={PMS_SECTION_CARD_CLASS}>
        <CardHeader className={PMS_CARD_HEADER_CLASS}>
          <CardTitle className={PMS_CARD_TITLE_CLASS}>Work Status</CardTitle>
          <CardDescription className={PMS_CARD_DESCRIPTION_CLASS}>
            Dashboard summary of active PMS orders, step progress, and Embelshment readiness.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              className="w-full md:w-80"
              placeholder="Search order id / name / BCN / barcode..."
              value={ctx.statusSearch}
              onChange={(event) => ctx.setStatusSearch(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
            <StatusCard icon={Package} value={ctx.workStatusSummary.totalOrders} title="Total Orders" subtitle="all active orders" className="border-slate-300 bg-slate-900 text-white" valueClassName="text-white" subtitleClassName="text-slate-300" />
            <StatusCard icon={Clock} value={ctx.workStatusSummary.pending} title="Pending" subtitle="waiting to start" className="border-amber-200 bg-amber-50" valueClassName="text-amber-600" titleClassName="text-amber-700" subtitleClassName="text-amber-600" iconClassName="text-amber-500" />
            <StatusCard icon={TrendingUp} value={ctx.workStatusSummary.machineRunning} title="Machine Running" subtitle="in production now" className="border-emerald-200 bg-emerald-50" valueClassName="text-emerald-600" titleClassName="text-emerald-700" subtitleClassName="text-emerald-600" iconClassName="text-emerald-500" />
            <StatusCard icon={Check} value={ctx.workStatusSummary.qcPending} title="Qc Pending" subtitle="awaiting quality check" className="border-blue-200 bg-blue-50" valueClassName="text-blue-600" titleClassName="text-blue-700" subtitleClassName="text-blue-600" iconClassName="text-blue-500" />
            <StatusCard icon={Package} value={ctx.workStatusSummary.dispatchReady} title="Dispatch ready" subtitle="ready to ship" className="border-orange-200 bg-orange-50" valueClassName="text-orange-600" titleClassName="text-orange-700" subtitleClassName="text-orange-600" iconClassName="text-orange-500" />
            <StatusCard icon={Check} value={ctx.workStatusSummary.completed} title="Completed" subtitle="fully completed" className="border-green-200 bg-green-50" valueClassName="text-green-600" titleClassName="text-green-700" subtitleClassName="text-green-600" iconClassName="text-green-500" />
            <StatusCard icon={Check} value={ctx.workStatusSummary.embellishment} title="Embelshment" subtitle="work enabled" className="border-fuchsia-200 bg-fuchsia-50" valueClassName="text-fuchsia-600" titleClassName="text-fuchsia-700" subtitleClassName="text-fuchsia-600" iconClassName="text-fuchsia-500" />
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className={PMS_TABLE_HEADER_ROW_CLASS}>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Order</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Customer</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>VAS Item</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Stage</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Job Statuses</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Progress</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Last Update</TableHead>
                  <TableHead className={PMS_TABLE_HEAD_CLASS}>Embelshment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ctx.filteredWorkStatusRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No PMS work status rows found.
                    </TableCell>
                  </TableRow>
                ) : (
                  ctx.filteredWorkStatusRows.map((row: any) => (
                    <TableRow key={`status-${row.key}`}>
                      <TableCell className="font-medium">{row.orderNo}</TableCell>
                      <TableCell>{row.customer}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{row.vasName}</div>
                          <div className="text-xs text-muted-foreground">{row.productName}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            row.stage === "Machine Running" &&
                              "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
                            row.stage === "Pending" &&
                              "bg-amber-100 text-amber-700 hover:bg-amber-100",
                            row.stage === "Completed" &&
                              "bg-green-100 text-green-700 hover:bg-green-100"
                          )}
                        >
                          {row.stage}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.currentJobStatusItem ? (
                          <div className="flex flex-wrap gap-2">
                            <Badge
                              key={row.currentJobStatusItem.key}
                              variant="outline"
                              className={cn(
                                "h-auto min-w-[132px] flex-col items-start gap-0.5 px-3 py-2 text-left",
                                row.currentJobStatusItem.status === "IN_PROGRESS" &&
                                  "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
                                row.currentJobStatusItem.status === "PLANNED" &&
                                  "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-50",
                                row.currentJobStatusItem.status === "WAITING" &&
                                  "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-50",
                                row.currentJobStatusItem.status === "DONE" &&
                                  "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-50"
                              )}
                            >
                              <span className="text-[10px] font-medium leading-tight text-slate-500">
                                {row.currentJobStatusItem.stepLabel}
                              </span>
                              <span className="text-[11px] font-semibold leading-tight">
                                {row.currentJobStatusItem.status}
                              </span>
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No step</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground">
                            {row.doneSteps}/{row.totalSteps} steps
                          </div>
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${row.progressPercent}%` }}
                            />
                          </div>
                          <div className="text-sm font-medium text-emerald-600">
                            {row.progressPercent}%
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{formatPmsDateTime(row.lastUpdate)}</TableCell>
                      <TableCell>
                        {row.embellishment?.enabled ? (
                          <div className="space-y-1">
                            <Badge variant="outline" className="border-fuchsia-300 text-fuchsia-700">
                              Embelshment work
                            </Badge>
                            <div className="text-xs text-muted-foreground">
                              Total Time: {row.embellishment.totalTime || 0} min
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function StatusCard({
  icon: Icon,
  value,
  title,
  subtitle,
  className,
  valueClassName,
  titleClassName,
  subtitleClassName,
  iconClassName,
}: any) {
  return (
    <Card className={className}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <Icon className={`h-5 w-5 ${iconClassName || "text-slate-200"}`} />
          <div className={`text-4xl font-bold ${valueClassName || ""}`}>{value}</div>
        </div>
        <div>
          <div className={`text-lg font-semibold ${titleClassName || ""}`}>{title}</div>
          <div className={`text-sm ${subtitleClassName || ""}`}>{subtitle}</div>
        </div>
      </CardContent>
    </Card>
  );
}
