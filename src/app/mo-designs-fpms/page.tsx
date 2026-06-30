import Link from "next/link";
import { ArrowRight, Boxes, ClipboardCheck, ScanLine, Users, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrderOverview, getOrders } from "@/actions/order";

const flowSteps = [
  "Customer comes and requirement form is filled",
  "Bed measurement is taken",
  "Bed drawing and furniture drawing are generated",
  "SM approves or rejects the furniture drawing",
  "Barcode is generated after confirmation",
  "BOM releases only when every item is available",
  "Workshop starts through barcode scan",
];

export default async function MoDesignsFpmsHomePage() {
  const overview = await getOrderOverview();
  const orders = await getOrders();

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-3xl">Master KPI Analytical Workspace</CardTitle>
          <CardDescription>
            Track customer demand intake, drawing approval, barcode release, BOM readiness, and workshop start.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Orders" value={String(overview.totalOrders)} />
          <MetricCard label="Pending Approvals" value={String(overview.pendingApprovals)} />
          <MetricCard label="BOM Released" value={String(overview.bomReleased)} />
          <MetricCard label="Workshop Live" value={String(overview.workshopLive)} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Demand to Workshop Process</CardTitle>
            <CardDescription>
              This workspace starts from customer demand, not from machine scheduling.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {flowSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-3 rounded-xl border bg-slate-50 px-4 py-3">
                <Badge variant="outline">{`Step ${index + 1}`}</Badge>
                <div className="flex-1 text-sm text-slate-700">{step}</div>
                {index < flowSteps.length - 1 ? <ArrowRight className="h-4 w-4 text-slate-400" /> : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Functional Sections</CardTitle>
            <CardDescription>
              Open each module directly to work on intake, approvals, BOM, resources, or scanning.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <QuickLink href="/mo-designs-fpms/orders/new" icon={ClipboardCheck} title="Dimensions Input Form" />
            <QuickLink href="/mo-designs-fpms/approvals" icon={ClipboardCheck} title="SM Drawing Checkpoint" />
            <QuickLink href="/mo-designs-fpms/bom/mdf-1001" icon={Boxes} title="Material Matching Terminal" />
            <QuickLink href="/mo-designs-fpms/workshop/scan" icon={ScanLine} title="Live Tracking Scanner" />
            <QuickLink href="/mo-designs-fpms/resources/people" icon={Users} title="Worker Entries Registry" />
            <QuickLink href="/mo-designs-fpms/resources/machinery" icon={Wrench} title="Machine Option Builder" />
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Live Orders</CardTitle>
          <CardDescription>These order profiles move through measurement, drawing, approval, BOM, and workshop.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/mo-designs-fpms/orders/${order.id}`}
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
