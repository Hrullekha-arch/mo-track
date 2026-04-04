import { AlertCircle, Eye, FileJson, Loader2, Trash2, Upload } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmbellishmentEditor } from "./EmbellishmentEditor";

type Props = { ctx: any };

export function PmsDialogs({ ctx }: Props) {
  return (
    <>
      <Dialog
        open={ctx.importState.open}
        onOpenChange={(open) => ctx.setImportState((prev: any) => ({ ...prev, open }))}
      >
        <DialogContent className="flex max-h-[80vh] max-w-3xl flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5" />
              Import {ctx.importState.tab.charAt(0).toUpperCase() + ctx.importState.tab.slice(1)} Data
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
                  onClick={ctx.handleImportPreview}
                  disabled={!ctx.importState.text}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Preview
                </Button>
              </div>
              <Textarea
                id="import-json"
                value={ctx.importState.text}
                onChange={(event) =>
                  ctx.setImportState((prev: any) => ({ ...prev, text: event.target.value }))
                }
                placeholder={`{"${ctx.importState.tab}":[{"id":"...","name":"..."}]}`}
                className="min-h-[200px] font-mono text-xs"
              />
            </div>

            {ctx.importState.preview.length > 0 && (
              <div className="space-y-2">
                <Label>Preview (first 5 items)</Label>
                <ScrollArea className="h-[200px] rounded-lg border bg-muted/50 p-4">
                  <pre className="text-xs">{JSON.stringify(ctx.importState.preview, null, 2)}</pre>
                </ScrollArea>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                ctx.setImportState((prev: any) => ({ ...prev, open: false, text: "", preview: [] }))
              }
              disabled={ctx.importState.loading}
            >
              Cancel
            </Button>
            <Button onClick={ctx.handleImport} disabled={ctx.importState.loading || !ctx.importState.text}>
              {ctx.importState.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Upload className="mr-2 h-4 w-4" />
              Import Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={ctx.createJobDialog.open}
        onOpenChange={(open) => {
          if (!open) ctx.handleCloseCreateJobDialog();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create PMS Jobs</DialogTitle>
            <DialogDescription>
              Review the VAS item and enable the Embelshment work condition when hand work is required.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {ctx.createJobDialog.row && (
              <div className="grid gap-3 rounded-lg border p-4 text-sm md:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Order:</span>{" "}
                  <span className="font-medium">{ctx.createJobDialog.row.orderNo}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Customer:</span>{" "}
                  <span className="font-medium">{ctx.createJobDialog.row.customer}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">VAS:</span>{" "}
                  <span className="font-medium">{ctx.createJobDialog.row.vasName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Qty:</span>{" "}
                  <span className="font-medium">{ctx.createJobDialog.row.qty}</span>
                </div>
                <div className="md:col-span-2">
                  <span className="text-muted-foreground">PMS Product:</span>{" "}
                  <span className="font-medium">
                    {ctx.createJobDialog.row.matchedProductName || ctx.createJobDialog.row.matchedProductId}
                  </span>
                </div>
              </div>
            )}

            <EmbellishmentEditor
              role={ctx.role}
              createJobDialog={ctx.createJobDialog}
              setCreateJobDialog={ctx.setCreateJobDialog}
              createJobTotals={ctx.createJobTotals}
              creatingJobKey={ctx.creatingJobKey}
              onFieldChange={ctx.handleCreateJobDialogFieldChange}
              onSubmit={ctx.handleSubmitCreateJobs}
              showSaveDetailsButton={false}
              submitLabel="Save & Create Jobs"
              emptyMessage="Select a VAS item to continue."
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={ctx.handleCloseCreateJobDialog}
              disabled={Boolean(
                ctx.createJobDialog.row && ctx.creatingJobKey === ctx.createJobDialog.row.key
              )}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={ctx.manualDoneDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            ctx.handleCloseManualDoneDialog();
          } else if (!ctx.manualDoneDialog.open) {
            ctx.setManualDoneDialog((prev: any) => ({ ...prev, open: true }));
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

          {ctx.manualDoneDialog.row && (
            <div className="space-y-4">
              <div className="space-y-1 rounded-lg border p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Order:</span>{" "}
                  <span className="font-medium">{ctx.manualDoneDialog.row.orderNo}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Customer:</span>{" "}
                  <span className="font-medium">{ctx.manualDoneDialog.row.customer}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">VAS:</span>{" "}
                  <span className="font-medium">{ctx.manualDoneDialog.row.vasName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Step:</span>{" "}
                  <span className="font-medium">
                    {ctx.manualDoneDialog.row.stepNo || "-"} / {ctx.manualDoneDialog.row.totalSteps}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Qty:</span>{" "}
                  <span className="font-medium">{ctx.manualDoneDialog.row.qty || 0}</span>
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
                  value={ctx.manualDoneAllQtyReady}
                  onValueChange={(value) => ctx.setManualDoneAllQtyReady(value === "no" ? "no" : "yes")}
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

              {ctx.manualDoneAllQtyReady === "no" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Remaining Qty</Label>
                    <Textarea
                      value={ctx.manualDoneRemainingQty}
                      onChange={(event) => ctx.setManualDoneRemainingQty(event.target.value)}
                      className="min-h-[50px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reason for Pending Step / Remaining Qty</Label>
                    <Textarea
                      value={ctx.manualDoneReason}
                      onChange={(event) => ctx.setManualDoneReason(event.target.value)}
                      placeholder="Enter which step is pending or why qty is remaining"
                      className="min-h-[90px]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={ctx.handleCloseManualDoneDialog} disabled={ctx.manualDoneSaving}>
              Cancel
            </Button>
            <Button onClick={ctx.handleSubmitManualDone} disabled={ctx.manualDoneSaving}>
              {ctx.manualDoneSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save & Mark Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={ctx.deleteDialog.open}
        onOpenChange={(open) => ctx.setDeleteDialog((prev: any) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Confirm Deletion
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{ctx.deleteDialog.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const { type, id } = ctx.deleteDialog;
                if (type === "product") await ctx.handleDeleteProduct(id);
                if (type === "machine") await ctx.handleDeleteMachine(id);
                if (type === "person") await ctx.handleDeletePerson(id);
                if (type === "downtime") await ctx.handleDeleteDowntime(id);
                ctx.closeDeleteDialog();
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
        open={ctx.resetAutopilotDialogOpen}
        onOpenChange={(open) => ctx.setResetAutopilotDialogOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Reset and Rerun Autopilot?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all PMS jobs and plans, recreate jobs for every VAS item with a PMS product match, and run autopilot to rebuild the plan. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={
                ctx.resettingAutopilot ||
                ctx.runningAutopilot ||
                ctx.runningPriorityReplan ||
                Boolean(ctx.priorityUpdatingOrderId) ||
                Boolean(ctx.deletingPlanKey)
              }
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={ctx.handleResetAndRerunAutopilot}
              disabled={
                ctx.resettingAutopilot ||
                ctx.runningAutopilot ||
                ctx.runningPriorityReplan ||
                Boolean(ctx.priorityUpdatingOrderId) ||
                Boolean(ctx.deletingPlanKey)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {ctx.resettingAutopilot && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset & Rerun
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
