import Link from "next/link";
import { ArrowRight, Boxes, ClipboardCheck, QrCode, ScanLine } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { productionOrders, productionOverview } from "@/lib/my-production-fpms-data";

const steps = [
  "Customer comes and form is filled",
  "Bed measurement is taken",
  "Bed drawing and furniture drawing are created",
  "SM confirms or rejects drawing",
  "Barcode is generated after confirm",
  "BOM releases only when all items are available",
];

export default function ProductionFpmsHomePage() {
  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-3xl">Production FPMS Overview</CardTitle>
          <CardDescription>
            Separate production flow for customer demand, bed measurement, drawings, SM approval, barcode,
            BOM release, and workshop scan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Orders" value={String(productionOverview.totalOrders)} />
          <MetricCard label="Pending Approvals" value={String(productionOverview.pendingApprovals)} />
          <MetricCard label="BOM Released" value={String(productionOverview.bomReleased)} />
          <MetricCard label="Barcode Ready" value={String(productionOverview.workshopReady)} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Process Flow</CardTitle>
            <CardDescription>The first customer starts the process. After that every stage unlocks the next one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.map((step, index) => (
              <div key={step} className="flex items-center gap-3 rounded-xl border bg-slate-50 px-4 py-3">
                <Badge variant="outline">{`Step ${index + 1}`}</Badge>
                <div className="flex-1 text-sm text-slate-700">{step}</div>
                {index < steps.length - 1 ? <ArrowRight className="h-4 w-4 text-slate-400" /> : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Quick Links</CardTitle>
            <CardDescription>Start with a fresh order intake or review pending drawings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <QuickLink href="/my-production-fpms/orders/new" icon={ClipboardCheck} title="New Order Intake" />
            <QuickLink href="/my-production-fpms/approvals" icon={QrCode} title="SM Approval Gate" />
            <QuickLink href="/my-production-fpms/bom/ord-1001" icon={Boxes} title="BOM Release Form" />
            <QuickLink href="/my-production-fpms/workshop/scan" icon={ScanLine} title="Workshop Barcode Scan" />
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
          <CardDescription>Mock orders connected to this scaffold so every page opens with usable data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {productionOrders.map((order) => (
            <Link
              key={order.id}
              href={`/my-production-fpms/orders/${order.id}`}
              className="block rounded-xl border bg-white px-4 py-4 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold text-slate-950">{order.orderNo}</div>
                  <div className="text-sm text-slate-600">{order.customerName} - {order.customerDemand}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{order.approvalStatus}</Badge>
                  <Badge variant="outline">{order.bomStatus}</Badge>
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
}: {
  href: string;
  icon: typeof ClipboardCheck;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
    >
      <span className="flex items-center gap-3">
        <Icon className="h-4 w-4" />
        {title}
      </span>
      <ArrowRight className="h-4 w-4 text-slate-400" />
    </Link>
  );
}
