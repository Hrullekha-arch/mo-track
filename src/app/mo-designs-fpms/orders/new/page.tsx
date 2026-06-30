import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import NumberField from "@/components/FormFields/NumberField";
import TextAreaField from "@/components/FormFields/TextAreaField";
import TextField from "@/components/FormFields/TextField";

export default function MoDesignsNewOrderPage() {
  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <ClipboardList className="h-5 w-5" />
            Step 1: Dimensions Input Form
          </CardTitle>
          <CardDescription>
            Customer comes first, the form is filled, customer demand is captured, and bed measurement is taken.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Customer Name" placeholder="Enter customer name" />
            <TextField label="Phone Number" placeholder="Enter phone number" />
            <TextField label="Bed Type" placeholder="King Bed / Queen Bed" />
            <TextField label="Room Name" placeholder="Master Bedroom / Kids Room" />
            <NumberField label="Width (inches)" placeholder="78" />
            <NumberField label="Length (inches)" placeholder="72" />
            <NumberField label="Height (inches)" placeholder="42" />
            <NumberField label="Headboard (inches)" placeholder="48" />
            <TextField label="Storage Type" placeholder="Hydraulic / Drawer / Box" />
            <div className="md:col-span-2">
              <TextAreaField
                label="Customer Demand"
                placeholder="Write the customer demand, finish, storage requirement, side table, style note..."
              />
            </div>
            <div className="md:col-span-2">
              <Button>Submit Intake Draft</Button>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border bg-slate-50 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Process Preview</div>
            <PreviewRow title="1. Form Filled" body="Customer demand gets registered immediately." />
            <PreviewRow title="2. Bed Measurement" body="Dimensions and storage details stay attached to the order." />
            <PreviewRow title="3. Drawing Queue" body="Bed drawing and then furniture drawing are generated next." />
            <PreviewRow title="4. SM Checkpoint" body="Furniture drawing moves to approval or rejection." />
            <PreviewRow title="5. Barcode and BOM" body="After approval, barcode is generated and BOM waits for stock." />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{body}</div>
    </div>
  );
}
