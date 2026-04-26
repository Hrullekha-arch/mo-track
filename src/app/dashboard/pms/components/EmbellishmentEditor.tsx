import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { buildEmbellishmentForm, formatInr } from "../utils/pmsHelpers";

type Props = {
  role?: string | null;
  createJobDialog: any;
  setCreateJobDialog: any;
  createJobTotals: any;
  creatingJobKey: string | null;
  onFieldChange: (field: string, value: string) => void;
  onSaveDetails?: () => void;
  onSubmit: () => void;
  showSaveDetailsButton?: boolean;
  saveDetailsLabel?: string;
  submitLabel?: string;
  emptyMessage?: string;
};

export function EmbellishmentEditor({
  role,
  createJobDialog,
  setCreateJobDialog,
  createJobTotals,
  creatingJobKey,
  onFieldChange,
  onSaveDetails,
  onSubmit,
  showSaveDetailsButton = true,
  saveDetailsLabel = "Save Details",
  submitLabel = "Save & Create Jobs",
  emptyMessage = "Choose a VAS item from the dashboard list to open the Additional VAS form.",
}: Props) {
  if (!createJobDialog.row) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const row = createJobDialog.row;
  const isSaving = creatingJobKey === row.key;
  const embellishmentRequired = Boolean(row.requiresEmbellishment);
  const embellishmentEnabled = embellishmentRequired || createJobDialog.embellishmentEnabled;

  return (
    <>
      <div className="grid gap-3 rounded-lg border p-4 text-sm">
        <div>
          <span className="text-muted-foreground">Order:</span>{" "}
          <span className="font-medium">{row.orderNo}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Customer:</span>{" "}
          <span className="font-medium">{row.customer}</span>
        </div>
        <div>
          <span className="text-muted-foreground">PMS Product:</span>{" "}
          <span className="font-medium">
            {row.matchedProductName || row.matchedProductId}
          </span>
        </div>
      </div>

      {row.matchedProductId && !row.hasRouting && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          Routing is not created for this PMS product yet.
          {role === "admin"
            ? " Create routing first, then create jobs."
            : " Ask admin to create routing first."}
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-1">
          <div className="font-medium">Additional VAS work</div>
          <p className="text-sm text-muted-foreground">
            {embellishmentRequired
              ? "This product includes an Additional VAS step in routing, so PMS will start after this form is completed."
              : "Turn this on only when hand work is required before PMS starts."}
          </p>
        </div>
        <Switch
          checked={embellishmentEnabled}
          disabled={embellishmentRequired}
          onCheckedChange={(checked) =>
            setCreateJobDialog((prev: any) => ({
              ...prev,
              embellishmentEnabled: checked,
              form: checked && prev.row ? buildEmbellishmentForm(prev.row, prev.row.embellishment) : prev.form,
            }))
          }
        />
      </div>

      {embellishmentEnabled ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Customer&apos;s Name</Label>
              <Input
                value={createJobDialog.form.customerName}
                onChange={(event) => onFieldChange("customerName", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Customer Phone Number</Label>
              <Input
                value={createJobDialog.form.customerPhone}
                onChange={(event) => onFieldChange("customerPhone", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Number of Windows</Label>
              <Input
                type="number"
                min="0"
                value={createJobDialog.form.numberOfWindows}
                onChange={(event) => onFieldChange("numberOfWindows", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Number of Panels</Label>
              <Input
                type="number"
                min="0"
                value={createJobDialog.form.numberOfPanels}
                onChange={(event) => onFieldChange("numberOfPanels", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Additional VAS Barcode</Label>
              <Input
                value={createJobDialog.form.embellishmentBarcode}
                onChange={(event) => onFieldChange("embellishmentBarcode", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Stitching Per Panel (min)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={createJobDialog.form.stitchingPerPanel}
                onChange={(event) => onFieldChange("stitchingPerPanel", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Design Time (min)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={createJobDialog.form.designTime}
                onChange={(event) => onFieldChange("designTime", event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Hand Work Time (min)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={createJobDialog.form.handWorkTime}
                onChange={(event) => onFieldChange("handWorkTime", event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>1 Hour Charge</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={createJobDialog.form.hourlyCharge}
                onChange={(event) => onFieldChange("hourlyCharge", event.target.value)}
                disabled={role !== "admin"}
              />
              {role !== "admin" && (
                <div className="text-xs text-muted-foreground">
                  Only admin can edit the hourly charge.
                </div>
              )}
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
              <div className="text-lg font-semibold">{formatInr(createJobTotals.hourlyCharge)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Charge Amount</div>
              <div className="text-lg font-semibold">{formatInr(createJobTotals.chargeAmount)}</div>
              <div className="text-xs text-muted-foreground">
                {createJobTotals.totalHours} hr x {formatInr(createJobTotals.hourlyCharge)}
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Charge updates automatically when panels, stitching time, design time, or hand work time changes.
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {showSaveDetailsButton && onSaveDetails && (
              <Button variant="outline" onClick={onSaveDetails} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saveDetailsLabel}
              </Button>
            )}
            <Button
              onClick={onSubmit}
              disabled={isSaving || row.hasJobsForProduct || !row.hasRouting}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {row.hasJobsForProduct ? "Jobs Created" : submitLabel}
            </Button>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Turn on <span className="font-medium text-foreground">Additional VAS work</span> to show the form fields here.
        </div>
      )}
    </>
  );
}
