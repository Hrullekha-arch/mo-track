import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrderBomLines, getProductionOrder } from "@/lib/my-production-fpms-data";
import BarcodeGenerator from "@/components/BarcodeGenerator";

export default async function ProductionOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = getProductionOrder(id);

  if (!order) notFound();

  const bomLines = getOrderBomLines(order.id);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{order.orderNo} - {order.customerName}</CardTitle>
          <CardDescription>
            Customer requirement, measurement, drawing, barcode, and BOM gate in one profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4 md:grid-cols-2">
            <Detail label="Customer Demand" value={order.customerDemand} />
            <Detail label="Bed Type" value={order.bedType} />
            <Detail label="Room" value={order.roomName} />
            <Detail label="Phone" value={order.phone} />
            <Detail
              label="Bed Measurement"
              value={`${order.measurement.width} x ${order.measurement.length} x ${order.measurement.height} in`}
            />
            <Detail label="Headboard" value={`${order.measurement.headboard} in`} />
            <Detail label="Bed Drawing" value={order.bedDrawing.drawingNo} />
            <Detail label="Furniture Drawing" value={order.furnitureDrawing.drawingNo} />
          </div>

          <div className="space-y-4 rounded-2xl border bg-slate-50 p-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{order.approvalStatus}</Badge>
              <Badge variant="outline">{order.bomStatus}</Badge>
              <Badge variant="outline">{order.workshopStatus}</Badge>
            </div>
            {order.barcode ? (
              <BarcodeGenerator value={order.barcode} label="Approved Order Barcode" />
            ) : (
              <div className="rounded-xl border bg-white p-4 text-sm text-slate-700">
                Barcode will be generated after `SM` confirms the furniture drawing.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>BOM Availability Snapshot</CardTitle>
          <CardDescription>This order moves to production only after all items are available.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {bomLines.length === 0 ? (
            <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">No BOM lines available yet.</div>
          ) : (
            bomLines.map((line) => (
              <div key={line.id} className="flex flex-col gap-2 rounded-xl border bg-white p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium text-slate-900">{line.material}</div>
                  <div className="text-sm text-slate-600">{line.requiredQty} - {line.location}</div>
                </div>
                <Badge variant="outline">{line.available ? "Available" : "Waiting"}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm text-slate-800">{value}</div>
    </div>
  );
}
