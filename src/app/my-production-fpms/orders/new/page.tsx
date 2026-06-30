"use client";

import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewProductionOrderPage() {
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    customerDemand: "",
    bedType: "",
    roomName: "",
    width: "",
    length: "",
    height: "",
    headboard: "",
    storageType: "",
  });

  const preview = useMemo(
    () => ({
      process: "Customer Form Filled -> Bed Measurement Taken -> Drawing Queue Ready",
      drawingHint: form.bedType ? `${form.bedType} drawing will be generated next.` : "Select bed type to prepare drawing.",
    }),
    [form.bedType]
  );

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <ClipboardList className="h-5 w-5" />
            Step 1: Customer Form & Bed Measurements
          </CardTitle>
          <CardDescription>
            First the customer comes, the form is filled, the customer demand is captured, and the bed measurement
            is taken. After this, the drawing flow starts.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Customer Name">
              <Input value={form.customerName} onChange={(e) => update("customerName", e.target.value)} />
            </Field>
            <Field label="Phone Number">
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </Field>
            <Field label="Bed Type">
              <Input value={form.bedType} onChange={(e) => update("bedType", e.target.value)} placeholder="King Bed / Queen Bed" />
            </Field>
            <Field label="Room Name">
              <Input value={form.roomName} onChange={(e) => update("roomName", e.target.value)} />
            </Field>
            <Field label="Width (inches)">
              <Input value={form.width} onChange={(e) => update("width", e.target.value)} />
            </Field>
            <Field label="Length (inches)">
              <Input value={form.length} onChange={(e) => update("length", e.target.value)} />
            </Field>
            <Field label="Height (inches)">
              <Input value={form.height} onChange={(e) => update("height", e.target.value)} />
            </Field>
            <Field label="Headboard (inches)">
              <Input value={form.headboard} onChange={(e) => update("headboard", e.target.value)} />
            </Field>
            <Field label="Storage Type">
              <Input value={form.storageType} onChange={(e) => update("storageType", e.target.value)} placeholder="Hydraulic / Drawer / Box" />
            </Field>
            <div className="md:col-span-2">
              <Field label="Customer Demand">
                <Textarea
                  value={form.customerDemand}
                  onChange={(e) => update("customerDemand", e.target.value)}
                  placeholder="Demand on customer side, finish, storage, side table, material preference..."
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Button>Create Intake Draft</Button>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border bg-slate-50 p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Live Preview</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">
                {form.customerName || "Customer name will appear here"}
              </div>
            </div>
            <PreviewRow label="Demand" value={form.customerDemand || "Customer demand not entered yet"} />
            <PreviewRow label="Measurement" value={`${form.width || "-"} x ${form.length || "-"} x ${form.height || "-"} in`} />
            <PreviewRow label="Storage" value={form.storageType || "Not selected"} />
            <PreviewRow label="Process" value={preview.process} />
            <div className="rounded-xl border bg-white p-4 text-sm text-slate-700">{preview.drawingHint}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm text-slate-800">{value}</div>
    </div>
  );
}
