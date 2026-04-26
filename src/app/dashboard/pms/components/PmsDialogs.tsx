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
              {ctx.createJobDialog.row?.requiresEmbellishment
                ? "This PMS product includes Additional VAS work in routing, so complete the form first and PMS will start right after."
                : "This PMS product can start directly. Open the form only when Additional VAS work is required."}
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
              submitLabel={
                ctx.createJobDialog.row?.requiresEmbellishment
                  ? "Complete Additional VAS Form & Start PMS"
                  : "Start PMS"
              }
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
            <DialogTitle>
              {ctx.manualDoneDialog.row?.isFinalStep
                ? "Manual Final Step Completion"
                : ctx.manualDoneDialog.row?.isManualCompletionStep
                ? "Manual Finish Step Completion"
                : "Confirm Step Done"}
            </DialogTitle>
            <DialogDescription>
              {ctx.manualDoneDialog.row?.isFinalStep
                ? "Confirm final-step completion after Q&Q, Final Complete Kitting, and Packaging are ready."
                : ctx.manualDoneDialog.row?.isManualCompletionStep
                ? "This finish step must be marked done manually before PMS moves to the next finish step."
                : "Confirm this step is done and verify the next assigned tailor/person before continuing."}
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
                  <span className="text-muted-foreground">SM Name:</span>{" "}
                  <span className="font-medium">{ctx.manualDoneDialog.row.smName || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">VAS:</span>{" "}
                  <span className="font-medium">{ctx.manualDoneDialog.row.vasName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Current Person:</span>{" "}
                  <span className="font-medium">{ctx.manualDoneDialog.row.person || "TBD"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">This Step:</span>{" "}
                  <span className="font-medium">
                    {ctx.manualDoneDialog.row.stepNo || "-"} / {ctx.manualDoneDialog.row.totalSteps} -{" "}
                    {ctx.manualDoneDialog.row.process || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Qty:</span>{" "}
                  <span className="font-medium">{ctx.manualDoneDialog.row.qty || 0}</span>
                </div>
              </div>

              {ctx.manualDoneDialog.row.nextProcess && (
                <div className="rounded-lg border bg-blue-50/60 p-3 text-sm">
                  <div className="font-medium text-blue-700">Second Step</div>
                  <div className="mt-2 space-y-1 text-slate-700">
                    <div>
                      <span className="text-muted-foreground">Step:</span>{" "}
                      <span className="font-medium">
                        {ctx.manualDoneDialog.row.stepNo
                          ? `${Number(ctx.manualDoneDialog.row.stepNo) + 1} / ${ctx.manualDoneDialog.row.totalSteps} - ${ctx.manualDoneDialog.row.nextProcess}`
                          : ctx.manualDoneDialog.row.nextProcess}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tailor / Person:</span>{" "}
                      <span className="font-medium">{ctx.manualDoneDialog.row.nextPerson || "TBD"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Machine:</span>{" "}
                      <span className="font-medium">{ctx.manualDoneDialog.row.nextMachine || "TBD"}</span>
                    </div>
                  </div>
                </div>
              )}

              {ctx.manualDoneDialog.row.isFinalStep ? (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-sm font-medium">Ready Checklist</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">Q&amp;Q Ready</Badge>
                    <Badge variant="outline">Final Complete Kitting Ready</Badge>
                    <Badge variant="outline">Packaging Ready</Badge>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border bg-amber-50/70 p-3 text-sm text-amber-800">
                  {ctx.manualDoneDialog.row.isManualCompletionStep
                    ? "After you click done, PMS will move this work to the next finish step."
                    : "After you click done, PMS will move this work to the person shown above."}
                </div>
              )}

              {ctx.manualDoneDialog.row.isFinalStep && (
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
              )}

              {ctx.manualDoneDialog.row.isFinalStep && ctx.manualDoneAllQtyReady === "no" && (
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
              {ctx.manualDoneDialog.row?.isFinalStep
                ? "Save & Mark Done"
                : ctx.manualDoneDialog.row?.nextPerson
                ? `Done & Send to ${ctx.manualDoneDialog.row.nextPerson}`
                : "Done & Continue"}
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
