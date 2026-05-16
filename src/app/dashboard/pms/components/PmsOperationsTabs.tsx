import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Check,
  Clock,
  Loader2,
  Package,
  Search,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  EMBELLISHMENT_HOURLY_CHARGE,
  formatDateTime,
  getQueueDelayLabel,
} from "../pmsCore";

type PmsOperationsTabsProps = {
  vm: any;
};

export function PmsOperationsTabs({ vm }: PmsOperationsTabsProps) {
  const {
    createJobDialog,
    createJobTotals,
    creatingJobKey,
    deletingPlanKey,
    embellishmentSearch,
    filteredEmbellishmentRows,
    filteredWorkDetailRows,
    filteredWorkStatusRows,
    handleCreateJobDialogFieldChange,
    handleDeletePlannedWork,
    handleOpenCreateJobDialog,
    handleOpenManualDoneDialog,
    handleOpenRoutingSetup,
    handleRunAutopilot,
    handleRunPriorityReplan,
    handleSaveEmbellishmentDetails,
    handleSelectEmbellishmentRow,
    handleSetOrderEmergencyPriority,
    handleSubmitCreateJobs,
    jobs,
    liveStats,
    liveVasRows,
    manualDoneSaving,
    orders,
    priorityUpdatingOrderId,
    resettingAutopilot,
    role,
    routing,
    runningAutopilot,
    runningPriorityReplan,
    setCreateJobDialog,
    setEmbellishmentSearch,
    setResetAutopilotDialogOpen,
    setStatusSearch,
    setVasSearch,
    setWorkDetailSearch,
    statusSearch,
    vasSearch,
    workDetailSearch,
    workStatusSummary,
  } = vm;

  return (
    <>
          <TabsContent value="live" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Live VAS Tracker</CardTitle>
                <CardDescription>
                  Real-time view of VAS work, current processing, and upcoming steps with ETA.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">Total: {liveStats.totalItems}</Badge>
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">In Progress: {liveStats.inProgress}</Badge>
                    <Badge className="bg-blue-600 hover:bg-blue-600">Planned: {liveStats.planned}</Badge>
                    <Badge className="bg-amber-500 hover:bg-amber-500">Waiting: {liveStats.waiting}</Badge>
                    <Badge className="bg-red-600 hover:bg-red-600">Emergency: {liveStats.emergency}</Badge>
                    <Badge variant="outline">Done: {liveStats.done}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      className="w-full md:w-64"
                      placeholder="Search order id / name / BCN / barcode..."
                      value={vasSearch}
                      onChange={(event) => setVasSearch(event.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRunAutopilot}
                      disabled={
                        runningAutopilot ||
                        runningPriorityReplan ||
                        resettingAutopilot ||
                        Boolean(priorityUpdatingOrderId) ||
                        Boolean(deletingPlanKey)
                      }
                    >
                      {runningAutopilot && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Run Autopilot
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleRunPriorityReplan}
                      disabled={
                        runningAutopilot ||
                        runningPriorityReplan ||
                        resettingAutopilot ||
                        Boolean(priorityUpdatingOrderId) ||
                        Boolean(deletingPlanKey)
                      }
                    >
                      {runningPriorityReplan && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Priority Replan
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setResetAutopilotDialogOpen(true)}
                      disabled={
                        runningAutopilot ||
                        runningPriorityReplan ||
                        resettingAutopilot ||
                        Boolean(priorityUpdatingOrderId) ||
                        Boolean(deletingPlanKey)
                      }
                    >
                      {resettingAutopilot && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Reset & Rerun
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order No</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>VAS Item</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>PMS Product</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Current Step</TableHead>
                        <TableHead>Machine</TableHead>
                        <TableHead>Person</TableHead>
                        <TableHead>Production Start</TableHead>
                        <TableHead>Production Complete</TableHead>
                        <TableHead>Not Scheduled Reason</TableHead>
                        <TableHead className="min-w-[260px] text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {liveVasRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={14} className="h-24 text-center text-muted-foreground">
                            No VAS items are active right now.
                          </TableCell>
                        </TableRow>
                      ) : (
                        liveVasRows.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="font-medium">{row.orderNo}</TableCell>
                            <TableCell>{row.customer}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{row.vasName}</div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-xs text-muted-foreground">{row.group}</div>
                                  {row.embellishment?.enabled && (
                                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                      Embelshment work
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{row.qty}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{row.matchedProductName || "No match"}</div>
                                {!row.matchedProductName && (
                                  <div className="text-xs text-muted-foreground">Create PMS product</div>
                                )}
                                {row.matchedProductId && !row.hasRouting && (
                                  <div className="space-y-1">
                                    <div className="text-xs font-medium text-amber-600">
                                      Routing not created yet
                                    </div>
                                    {role === "admin" && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => handleOpenRoutingSetup(row.matchedProductId)}
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
                            <TableCell>{formatDateTime(row.plannedStart)}</TableCell>
                            <TableCell>{formatDateTime(row.eta)}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div>{row.noPlanReason || "-"}</div>
                                {row.matchedProductId && !row.hasRouting && role === "admin" && (
                                  <div className="text-xs text-amber-600">
                                    Admin suggestion: create routing for this product.
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2 whitespace-nowrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="shrink-0 whitespace-nowrap"
                                  disabled={
                                    creatingJobKey === row.key ||
                                    row.hasJobsForProduct ||
                                    !row.matchedProductId ||
                                    !row.hasRouting ||
                                    !row.invoiceReady ||
                                    resettingAutopilot ||
                                    runningAutopilot ||
                                    runningPriorityReplan ||
                                    Boolean(deletingPlanKey)
                                  }
                                  onClick={() => handleOpenCreateJobDialog(row)}
                                >
                                  {row.hasJobsForProduct
                                    ? "Jobs Created"
                                    : creatingJobKey === row.key
                                    ? "Creating..."
                                    : row.embellishment?.enabled
                                    ? "Create Jobs"
                                    : "Create Jobs"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant={row.isEmergency ? "outline" : "destructive"}
                                  className="min-w-[150px] shrink-0 whitespace-nowrap"
                                  disabled={
                                    priorityUpdatingOrderId === row.orderId ||
                                    runningAutopilot ||
                                    runningPriorityReplan ||
                                    resettingAutopilot ||
                                    Boolean(deletingPlanKey)
                                  }
                                  onClick={() =>
                                    handleSetOrderEmergencyPriority(row.orderId, !row.isEmergency)
                                  }
                                >
                                  {priorityUpdatingOrderId === row.orderId && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  )}
                                  {row.isEmergency ? "Clear Emergency" : "Mark Emergency"}
                                </Button>
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
          </TabsContent>

          <TabsContent value="status" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Work Status</CardTitle>
                <CardDescription>
                  Dashboard summary of active PMS orders, step progress, and Embelshment readiness.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    className="w-full md:w-80"
                    placeholder="Search order id / name / BCN / barcode..."
                    value={statusSearch}
                    onChange={(event) => setStatusSearch(event.target.value)}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
                  <Card className="border-slate-300 bg-slate-900 text-white">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center justify-between">
                        <Package className="h-5 w-5 text-slate-200" />
                        <div className="text-4xl font-bold">{workStatusSummary.totalOrders}</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold">Total Orders</div>
                        <div className="text-sm text-slate-300">all active orders</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center justify-between">
                        <Clock className="h-5 w-5 text-amber-500" />
                        <div className="text-4xl font-bold text-amber-600">{workStatusSummary.pending}</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-amber-700">Pending</div>
                        <div className="text-sm text-amber-600">waiting to start</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-emerald-200 bg-emerald-50">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center justify-between">
                        <TrendingUp className="h-5 w-5 text-emerald-500" />
                        <div className="text-4xl font-bold text-emerald-600">
                          {workStatusSummary.machineRunning}
                        </div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-emerald-700">Machine Running</div>
                        <div className="text-sm text-emerald-600">in production now</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-blue-200 bg-blue-50">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center justify-between">
                        <Check className="h-5 w-5 text-blue-500" />
                        <div className="text-4xl font-bold text-blue-600">{workStatusSummary.qcPending}</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-blue-700">Qc Pending</div>
                        <div className="text-sm text-blue-600">awaiting quality check</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-orange-200 bg-orange-50">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center justify-between">
                        <Package className="h-5 w-5 text-orange-500" />
                        <div className="text-4xl font-bold text-orange-600">
                          {workStatusSummary.dispatchReady}
                        </div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-orange-700">Dispatch ready</div>
                        <div className="text-sm text-orange-600">ready to ship</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-green-200 bg-green-50">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center justify-between">
                        <Check className="h-5 w-5 text-green-500" />
                        <div className="text-4xl font-bold text-green-600">
                          {workStatusSummary.completed}
                        </div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-green-700">Completed</div>
                        <div className="text-sm text-green-600">fully completed</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-fuchsia-200 bg-fuchsia-50">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center justify-between">
                        <Check className="h-5 w-5 text-fuchsia-500" />
                        <div className="text-4xl font-bold text-fuchsia-600">
                          {workStatusSummary.embellishment}
                        </div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-fuchsia-700">Embelshment</div>
                        <div className="text-sm text-fuchsia-600">work enabled</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>VAS Item</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Job Statuses</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Last Update</TableHead>
                        <TableHead>Embelshment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWorkStatusRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                            No PMS work status rows found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredWorkStatusRows.map((row) => (
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
                              <div className="flex flex-wrap gap-2">
                                {row.jobStatuses.map((status) => (
                                  <Badge key={`${row.key}-${status}`} variant="outline">
                                    {status}
                                  </Badge>
                                ))}
                              </div>
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
                            <TableCell>{formatDateTime(row.lastUpdate)}</TableCell>
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

          <TabsContent value="embellishment" className="space-y-4">
            <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Embelshment Dashboard</CardTitle>
                  <CardDescription>
                    Select a VAS item and fill the Embelshment work form directly from the PMS dashboard.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      className="w-full md:w-80"
                      placeholder="Search order id / name / BCN / barcode..."
                      value={embellishmentSearch}
                      onChange={(event) => setEmbellishmentSearch(event.target.value)}
                    />
                  </div>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order No</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>VAS Item</TableHead>
                          <TableHead>PMS Product</TableHead>
                          <TableHead>Status</TableHead>
                        <TableHead className="min-w-[260px] text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEmbellishmentRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                              No VAS items available for Embelshment work.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredEmbellishmentRows.map((row) => {
                            const isSelected = createJobDialog.row?.key === row.key;
                            return (
                              <TableRow
                                key={`embellishment-${row.key}`}
                                className={cn(isSelected && "bg-primary/5")}
                              >
                                <TableCell className="font-medium">{row.orderNo}</TableCell>
                                <TableCell>{row.customer}</TableCell>
                                <TableCell>
                                  <div className="space-y-1">
                                    <div className="font-medium">{row.vasName}</div>
                                    <div className="text-xs text-muted-foreground">{row.group}</div>
                                  </div>
                                </TableCell>
                                <TableCell>{row.matchedProductName || "No match"}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant="secondary">{row.status}</Badge>
                                    {row.embellishment?.enabled && (
                                      <Badge variant="outline">Filled</Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant={isSelected ? "secondary" : "outline"}
                                    onClick={() => handleSelectEmbellishmentRow(row)}
                                    disabled={!row.matchedProductId}
                                  >
                                    {isSelected ? "Selected" : "Open Form"}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Embelshment Form</CardTitle>
                  <CardDescription>
                    {createJobDialog.row
                      ? `Fill the form for ${createJobDialog.row.vasName} and save it on the dashboard.`
                      : "Select a VAS item from the left side to open the form."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {createJobDialog.row ? (
                    <>
                      <div className="grid gap-3 rounded-lg border p-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Order:</span>{" "}
                          <span className="font-medium">{createJobDialog.row.orderNo}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Customer:</span>{" "}
                          <span className="font-medium">{createJobDialog.row.customer}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">PMS Product:</span>{" "}
                          <span className="font-medium">
                            {createJobDialog.row.matchedProductName || createJobDialog.row.matchedProductId}
                          </span>
                        </div>
                      </div>

                      {createJobDialog.row.matchedProductId && !createJobDialog.row.hasRouting && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                          Routing is not created for this PMS product yet.
                          {role === "admin" ? " Create routing first, then create jobs." : " Ask admin to create routing first."}
                        </div>
                      )}

                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-1">
                          <div className="font-medium">Embelshment work</div>
                          <p className="text-sm text-muted-foreground">
                            Enable this condition to fill the dashboard form.
                          </p>
                        </div>
                        <Switch
                          checked={createJobDialog.embellishmentEnabled}
                          onCheckedChange={(checked) =>
                            setCreateJobDialog((prev) => ({
                              ...prev,
                              embellishmentEnabled: checked,
                              form:
                                checked && prev.row
                                  ? buildEmbellishmentForm(prev.row, prev.row.embellishment)
                                  : prev.form,
                            }))
                          }
                        />
                      </div>

                      {createJobDialog.embellishmentEnabled ? (
                        <>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Customer&apos;s Name</Label>
                              <Input
                                value={createJobDialog.form.customerName}
                                onChange={(e) =>
                                  handleCreateJobDialogFieldChange("customerName", e.target.value)
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Customer Phone Number</Label>
                              <Input
                                value={createJobDialog.form.customerPhone}
                                onChange={(e) =>
                                  handleCreateJobDialogFieldChange("customerPhone", e.target.value)
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Number of Windows</Label>
                              <Input
                                type="number"
                                min="0"
                                value={createJobDialog.form.numberOfWindows}
                                onChange={(e) =>
                                  handleCreateJobDialogFieldChange("numberOfWindows", e.target.value)
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Number of Panel</Label>
                              <Input
                                type="number"
                                min="0"
                                value={createJobDialog.form.numberOfPanels}
                                onChange={(e) =>
                                  handleCreateJobDialogFieldChange("numberOfPanels", e.target.value)
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Embelshment Barcode</Label>
                              <Input
                                value={createJobDialog.form.embellishmentBarcode}
                                onChange={(e) =>
                                  handleCreateJobDialogFieldChange(
                                    "embellishmentBarcode",
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Steaching Per Panel (min)</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={createJobDialog.form.stitchingPerPanel}
                                onChange={(e) =>
                                  handleCreateJobDialogFieldChange("stitchingPerPanel", e.target.value)
                                }
                              />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <Label>Hand Work Time (min)</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={createJobDialog.form.handWorkTime}
                                onChange={(e) =>
                                  handleCreateJobDialogFieldChange("handWorkTime", e.target.value)
                                }
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm md:grid-cols-2">
                            <div>
                              <div className="text-muted-foreground">Total Time (min)</div>
                              <div className="text-lg font-semibold">{createJobTotals.totalMinutes} min</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Total Hours</div>
                              <div className="text-lg font-semibold">{createJobTotals.totalHours} hr</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">1 Hour Charge</div>
                              <div className="text-lg font-semibold">{createJobTotals.hourlyCharge}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Charge Amount</div>
                              <div className="text-lg font-semibold">{createJobTotals.chargeAmount}</div>
                              <div className="text-xs text-muted-foreground">
                                {createJobTotals.totalHours} hr x {createJobTotals.hourlyCharge}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={handleSaveEmbellishmentDetails}
                              disabled={creatingJobKey === createJobDialog.row.key}
                            >
                              {creatingJobKey === createJobDialog.row.key && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              )}
                              Save Details
                            </Button>
                            <Button
                              onClick={handleSubmitCreateJobs}
                              disabled={
                                creatingJobKey === createJobDialog.row.key ||
                                createJobDialog.row.hasJobsForProduct ||
                                !createJobDialog.row.hasRouting
                              }
                            >
                              {creatingJobKey === createJobDialog.row.key && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              )}
                              {createJobDialog.row.hasJobsForProduct ? "Jobs Created" : "Save & Create Jobs"}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                          Turn on <span className="font-medium text-foreground">Embelshment work</span> to show the form fields here.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                      Choose a VAS item from the dashboard list to open the Embelshment form.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* WORK DETAIL TAB */}
          <TabsContent value="work" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Work Detail</CardTitle>
                <CardDescription>
                  Planned work queue by person, VAS item, and routing roadmap.
                  Planned start time indicates the first available machine/person slot as per queue.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">Planned: {filteredWorkDetailRows.length}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      className="w-full md:w-80"
                      placeholder="Search order id / name / BCN / barcode..."
                      value={workDetailSearch}
                      onChange={(event) => setWorkDetailSearch(event.target.value)}
                    />
                  </div>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order No</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>VAS Item</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Current Step</TableHead>
                        <TableHead>Next Step</TableHead>
                        <TableHead>Person</TableHead>
                        <TableHead>Machine</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWorkDetailRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                            No planned work yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredWorkDetailRows.map((row) => {
                          const canDeletePlan =
                            (row.resetJobIds.length > 0 || row.resetPlanDocIds.length > 0) &&
                            row.status !== "IN_PROGRESS";
                          const canManualDone =
                            row.requiresManualDone &&
                            row.status === "IN_PROGRESS" &&
                            Boolean(row.currentJobId);
                          const manualDoneLabel = canManualDone
                            ? "Manual Done"
                            : "Manual Done only after Cutting / Packaging";
                          return (
                            <Fragment key={row.key}>
                              <TableRow>
                                <TableCell className="font-medium">{row.orderNo}</TableCell>
                                <TableCell>{row.customer}</TableCell>
                                <TableCell>
                                  <div className="space-y-1">
                                    <div className="font-medium">{row.vasName}</div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="text-xs text-muted-foreground">{row.vasGroup}</div>
                                      {row.embellishment?.enabled && (
                                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                          Embelshment work
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
                                      Start: {formatDateTime(row.plannedStart)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      End: {formatDateTime(row.plannedEnd)}
                                    </div>
                                    {row.status === "PLANNED" && (
                                      <div className="text-[11px] font-medium text-amber-600">
                                        {getQueueDelayLabel(row.plannedStart)}
                                      </div>
                                    )}
                                    {row.blockedByLabel && (
                                      <div
                                        className="text-[11px] text-muted-foreground"
                                        title={row.blockedByLabel}
                                      >
                                        {row.blockedByLabel}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="space-y-1">
                                    <div className="font-medium">{row.nextProcess || "-"}</div>
                                    <div className="text-xs text-muted-foreground">
                                      Start: {formatDateTime(row.nextPlannedStart)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      End: {formatDateTime(row.nextPlannedEnd)}
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
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className={cn(
                                        canManualDone
                                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                          : "bg-slate-400 text-white hover:bg-slate-400"
                                      )}
                                      disabled={
                                        !canManualDone ||
                                        manualDoneSaving ||
                                        deletingPlanKey === row.key ||
                                        runningAutopilot ||
                                        runningPriorityReplan ||
                                        resettingAutopilot ||
                                        Boolean(priorityUpdatingOrderId)
                                      }
                                      onClick={() => handleOpenManualDoneDialog(row)}
                                    >
                                      <Check className="mr-2 h-4 w-4" />
                                      {manualDoneLabel}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      disabled={
                                        !canDeletePlan ||
                                        deletingPlanKey === row.key ||
                                        runningAutopilot ||
                                        runningPriorityReplan ||
                                        resettingAutopilot ||
                                        Boolean(priorityUpdatingOrderId)
                                      }
                                      onClick={() => handleDeletePlannedWork(row)}
                                    >
                                      {deletingPlanKey === row.key ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <>
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          Delete Plan
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell colSpan={10} className="bg-muted/30">
                                  <div className="space-y-3">
                                    <div className="text-xs text-muted-foreground">
                                      Routing roadmap for {row.productName}
                                    </div>
                                    {row.embellishment?.enabled && (
                                      <div className="rounded-lg border bg-white p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                          <div className="text-sm font-medium">Embelshment Details</div>
                                          <Badge variant="outline">Configured</Badge>
                                        </div>
                                        <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                                          <div>
                                            <div className="text-muted-foreground">Customer</div>
                                            <div className="font-medium">
                                              {row.embellishment.customerName || row.customer}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-muted-foreground">Phone</div>
                                            <div className="font-medium">
                                              {row.embellishment.customerPhone || "-"}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-muted-foreground">Windows</div>
                                            <div className="font-medium">
                                              {row.embellishment.numberOfWindows || 0}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-muted-foreground">Panels</div>
                                            <div className="font-medium">
                                              {row.embellishment.numberOfPanels || 0}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-muted-foreground">Barcode</div>
                                            <div className="font-medium">
                                              {row.embellishment.embellishmentBarcode || "-"}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-muted-foreground">Steaching / Panel (min)</div>
                                            <div className="font-medium">
                                              {row.embellishment.stitchingPerPanel || 0} min
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-muted-foreground">Hand Work Time (min)</div>
                                            <div className="font-medium">
                                              {row.embellishment.handWorkTime || 0} min
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-muted-foreground">Total Time (min)</div>
                                            <div className="font-medium">
                                              {row.embellishment.totalTime || 0} min
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-muted-foreground">Total Hours</div>
                                            <div className="font-medium">
                                              {row.embellishment.totalHours || 0} hr
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-muted-foreground">1 Hour Charge</div>
                                            <div className="font-medium">
                                              {row.embellishment.hourlyCharge || EMBELLISHMENT_HOURLY_CHARGE}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-muted-foreground">Charge Amount</div>
                                            <div className="font-medium">
                                              {row.embellishment.chargeAmount || 0}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    {row.routingSteps.length === 0 ? (
                                      <div className="text-sm text-muted-foreground">
                                        No routing steps found for this product.
                                      </div>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <div className="flex items-center gap-2 min-w-max">
                                          {row.routingSteps.map((step, index) => {
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
                                            const stepStart = formatDateTime(
                                              isDone
                                                ? stepPlan?.actualStart || stepPlan?.plannedStart
                                                : stepPlan?.plannedStart
                                            );
                                            const stepEnd = formatDateTime(
                                              isDone
                                                ? stepPlan?.actualEnd || stepPlan?.plannedEnd
                                                : stepPlan?.plannedEnd
                                            );
                                            const stepPerson = stepPlan?.personName;
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
                                                        "h-9 w-9 rounded-full border flex items-center justify-center text-xs font-semibold",
                                                        tone
                                                      )}
                                                    >
                                                      {isDone ? <Check className="h-4 w-4" /> : step.stepNo}
                                                    </div>
                                                    <div className="mt-1 text-[11px] text-muted-foreground max-w-[80px] text-center">
                                                      {step.process}
                                                    </div>
                                                    <div className="mt-1 text-[10px] text-muted-foreground leading-tight text-center">
                                                      <div className={cn(isDone && "font-semibold text-green-700")}>
                                                        {isDone ? "Completed" : rawStepStatus || "PENDING"}
                                                      </div>
                                                      <div>Start: {stepStart}</div>
                                                      <div>End: {stepEnd}</div>
                                                      <div>Person: {stepPerson || "-"}</div>
                                                    </div>
                                                  </div>
                                                  {index < row.routingSteps.length - 1 && (
                                                    <div
                                                      className={cn(
                                                        "h-[2px] w-12 mx-2 rounded-full",
                                                        connectorTone
                                                      )}
                                                    />
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

          {/* ROUTING TAB */}

    </>
  );
}
