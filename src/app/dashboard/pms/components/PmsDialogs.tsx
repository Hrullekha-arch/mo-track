import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  Eye,
  FileJson,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";

type PmsDialogsProps = {
  vm: any;
};

export function PmsDialogs({ vm }: PmsDialogsProps) {
  const {
    createJobDialog,
    createJobTotals,
    creatingJobKey,
    deleteDialog,
    deletingPlanKey,
    downtimes,
    handleCloseCreateJobDialog,
    handleCloseManualDoneDialog,
    handleCreateJobDialogFieldChange,
    handleDeleteDowntime,
    handleDeleteMachine,
    handleDeletePerson,
    handleDeleteProduct,
    handleImport,
    handleImportPreview,
    handleResetAndRerunAutopilot,
    handleSubmitCreateJobs,
    handleSubmitManualDone,
    importState,
    machines,
    manualDoneAllQtyReady,
    manualDoneDialog,
    manualDoneReason,
    manualDoneRemainingQty,
    manualDoneSaving,
    plans,
    priorityUpdatingOrderId,
    resetAutopilotDialogOpen,
    resettingAutopilot,
    routing,
    runningAutopilot,
    runningPriorityReplan,
    setCreateJobDialog,
    setDeleteDialog,
    setImportState,
    setManualDoneAllQtyReady,
    setManualDoneDialog,
    setManualDoneReason,
    setManualDoneRemainingQty,
    setResetAutopilotDialogOpen,
    skills,
  } = vm;

  return (
    <>

        {/* Import Dialog */}
        <Dialog open={importState.open} onOpenChange={(open) => setImportState((prev) => ({ ...prev, open }))}>
          <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                Import {importState.tab.charAt(0).toUpperCase() + importState.tab.slice(1)} Data
              </DialogTitle>
              <DialogDescription>
                Paste JSON data to import. This will create or update records in Firestore.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 space-y-4 overflow-hidden">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="import-json">JSON Data</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleImportPreview}
                    disabled={!importState.text}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Preview
                  </Button>
                </div>
                <Textarea
                  id="import-json"
                  value={importState.text}
                  onChange={(e) => setImportState((prev) => ({ ...prev, text: e.target.value }))}
                  placeholder={`{"${importState.tab}":[{"id":"...","name":"..."}]}`}
                  className="font-mono text-xs min-h-[200px]"
                />
              </div>

              {importState.preview.length > 0 && (
                <div className="space-y-2">
                  <Label>Preview (first 5 items)</Label>
                  <ScrollArea className="h-[200px] rounded-lg border bg-muted/50 p-4">
                    <pre className="text-xs">
                      {JSON.stringify(importState.preview, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p className="font-medium">Expected Format:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      {importState.tab === "routing" && (
                        <>
                          <li>Products: {`{"products":[{"id":"P1","name":"Product A","category":"Cat1"}]}`}</li>
                          <li>Routing: {`{"routing":[{"productId":"P1","stepNo":1,"process":"Assembly","cycleMinutes":10,"ops":2}]}`}</li>
                        </>
                      )}
                      {importState.tab === "machines" && (
                        <li>{`{"machines":[{"id":"M1","name":"Machine 1","process":"Cutting","shiftMinutes":480,"active":true}]}`}</li>
                      )}
                      {importState.tab === "skills" && (
                        <>
                          <li>People: {`{"people":[{"id":"PR1","name":"John Doe","role":"Operator"}]}`}</li>
                          <li>Machines: {`{"machines":[...]}`}</li>
                          <li>Skills: {`{"skills":[{"machineId":"M1","personId":"PR1","category":"Cat1","allowed":true}]}`}</li>
                        </>
                      )}
                      {importState.tab === "downtime" && (
                        <li>{`{"downtimes":[{"machineId":"M1","from":"2024-01-01T08:00","to":"2024-01-01T16:00","reason":"Maintenance"}]}`}</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setImportState((prev) => ({ ...prev, open: false, text: "", preview: [] }))}
                disabled={importState.loading}
              >
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={importState.loading || !importState.text}>
                {importState.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Upload className="mr-2 h-4 w-4" />
                Import Data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={createJobDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseCreateJobDialog();
            }
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create PMS Jobs</DialogTitle>
              <DialogDescription>
                Review the VAS item and enable the Embelshment work condition when hand work is required.
              </DialogDescription>
            </DialogHeader>

            {createJobDialog.row && (
              <div className="space-y-5">
                <div className="grid gap-3 rounded-lg border p-4 text-sm md:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Order:</span>{" "}
                    <span className="font-medium">{createJobDialog.row.orderNo}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Customer:</span>{" "}
                    <span className="font-medium">{createJobDialog.row.customer}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">VAS:</span>{" "}
                    <span className="font-medium">{createJobDialog.row.vasName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Qty:</span>{" "}
                    <span className="font-medium">{createJobDialog.row.qty}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-muted-foreground">PMS Product:</span>{" "}
                    <span className="font-medium">
                      {createJobDialog.row.matchedProductName || createJobDialog.row.matchedProductId}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-1">
                    <div className="font-medium">Embelshment work</div>
                    <p className="text-sm text-muted-foreground">
                      Turn this on to capture embellishment details and override PMS time.
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

                {createJobDialog.row.matchedProductId && !createJobDialog.row.hasRouting && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    Routing is not created for this PMS product yet.
                    {role === "admin" ? " Create routing first, then create jobs." : " Ask admin to create routing first."}
                  </div>
                )}

                {createJobDialog.embellishmentEnabled && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Customer&apos;s Name</Label>
                        <Input
                          value={createJobDialog.form.customerName}
                          onChange={(e) =>
                            handleCreateJobDialogFieldChange("customerName", e.target.value)
                          }
                          placeholder="Enter customer name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Customer Phone Number</Label>
                        <Input
                          value={createJobDialog.form.customerPhone}
                          onChange={(e) =>
                            handleCreateJobDialogFieldChange("customerPhone", e.target.value)
                          }
                          placeholder="Enter phone number"
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
                          placeholder="Enter number of windows"
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
                          placeholder="Enter number of panel"
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
                          placeholder="Enter embellishment barcode"
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
                          placeholder="Enter steaching per panel in min"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Hand Work Time (min)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={createJobDialog.form.handWorkTime}
                          onChange={(e) =>
                            handleCreateJobDialogFieldChange("handWorkTime", e.target.value)
                          }
                          placeholder="Enter hand work time in min"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm md:grid-cols-4">
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
                        <div className="text-lg font-semibold">
                          {createJobTotals.chargeAmount}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {createJobTotals.totalHours} hr x {createJobTotals.hourlyCharge}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCloseCreateJobDialog}
                disabled={Boolean(createJobDialog.row && creatingJobKey === createJobDialog.row.key)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitCreateJobs}
                disabled={Boolean(
                  createJobDialog.row &&
                    (creatingJobKey === createJobDialog.row.key ||
                      createJobDialog.row.hasJobsForProduct ||
                      !createJobDialog.row.hasRouting)
                )}
              >
                {createJobDialog.row && creatingJobKey === createJobDialog.row.key && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save & Create Jobs
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={manualDoneDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseManualDoneDialog();
            } else if (!manualDoneDialog.open) {
              setManualDoneDialog((prev) => ({ ...prev, open: true }));
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Manual Final Step Completion</DialogTitle>
              <DialogDescription>
                Confirm final-step completion after Q&amp;Q, Final Complete Kitting, and Packaging are ready.
              </DialogDescription>
            </DialogHeader>

            {manualDoneDialog.row && (
              <div className="space-y-4">
                <div className="rounded-lg border p-3 text-sm space-y-1">
                  <div>
                    <span className="text-muted-foreground">Order:</span>{" "}
                    <span className="font-medium">{manualDoneDialog.row.orderNo}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Customer:</span>{" "}
                    <span className="font-medium">{manualDoneDialog.row.customer}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">VAS:</span>{" "}
                    <span className="font-medium">{manualDoneDialog.row.vasName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Step:</span>{" "}
                    <span className="font-medium">
                      {manualDoneDialog.row.stepNo || "-"} / {manualDoneDialog.row.totalSteps}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Qty:</span>{" "}
                    <span className="font-medium">{manualDoneDialog.row.qty || 0}</span>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-sm font-medium">Ready Checklist</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">Q&amp;Q Ready</Badge>
                    <Badge variant="outline">Final Complete Kitting Ready</Badge>
                    <Badge variant="outline">Packaging Ready</Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Are all your steps ready?</Label>
                  <Select
                    value={manualDoneAllQtyReady}
                    onValueChange={(value) =>
                      setManualDoneAllQtyReady(value === "no" ? "no" : "yes")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select readiness" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes, all steps are ready</SelectItem>
                      <SelectItem value="no">No, some step or qty is pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {manualDoneAllQtyReady === "no" && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Remaining Qty</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={manualDoneRemainingQty}
                        onChange={(e) => setManualDoneRemainingQty(e.target.value)}
                        placeholder="Enter remaining qty"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Reason for Pending Step / Remaining Qty</Label>
                      <Textarea
                        value={manualDoneReason}
                        onChange={(e) => setManualDoneReason(e.target.value)}
                        placeholder="Enter which step is pending or why qty is remaining"
                        className="min-h-[90px]"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCloseManualDoneDialog}
                disabled={manualDoneSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmitManualDone} disabled={manualDoneSaving}>
                {manualDoneSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save & Mark Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Confirm Deletion
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{deleteDialog.name}</strong>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const { type, id } = deleteDialog;
                  if (type === "product") await handleDeleteProduct(id);
                  if (type === "machine") await handleDeleteMachine(id);
                  if (type === "person") await handleDeletePerson(id);
                  if (type === "downtime") await handleDeleteDowntime(id);
                  setDeleteDialog({ open: false, type: "product", id: "", name: "" });
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={resetAutopilotDialogOpen}
          onOpenChange={(open) => setResetAutopilotDialogOpen(open)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Reset and Rerun Autopilot?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will delete all PMS jobs and plans, recreate jobs for every VAS item with a PMS
                product match, and run autopilot to rebuild the plan. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={
                  resettingAutopilot ||
                  runningAutopilot ||
                  runningPriorityReplan ||
                  Boolean(priorityUpdatingOrderId) ||
                  Boolean(deletingPlanKey)
                }
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleResetAndRerunAutopilot}
                disabled={
                  resettingAutopilot ||
                  runningAutopilot ||
                  runningPriorityReplan ||
                  Boolean(priorityUpdatingOrderId) ||
                  Boolean(deletingPlanKey)
                }
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {resettingAutopilot && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset & Rerun
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

    </>
  );
}
