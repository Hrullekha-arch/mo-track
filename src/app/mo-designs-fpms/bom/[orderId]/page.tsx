import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBomByOrderId, releaseBom } from "@/actions/bom";
import { getOrderById } from "@/actions/order";

export default async function MoDesignsBomPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await getOrderById(orderId);

  if (!order) notFound();

  const lines = await getBomByOrderId(orderId);
  const release = await releaseBom(orderId);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Step 3: Material Matching Terminal</CardTitle>
          <CardDescription>
            BOM is released only after the furniture drawing is approved and every required material is available.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Info label="Order" value={order.orderNo} />
          <Info label="Furniture Drawing" value={`${order.furnitureDrawing.drawingNo} / ${order.furnitureDrawing.status}`} />
          <Info label="BOM Gate" value={release.released ? "Released" : "Blocked"} />
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Material Checkpoints</CardTitle>
          <CardDescription>Every line below must turn available before production can start.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line) => (
            <div key={line.id} className="flex flex-col gap-2 rounded-xl border bg-white p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-medium text-slate-900">{line.material}</div>
                <div className="text-sm text-slate-600">{line.code} - {line.requiredQty} - {line.location}</div>
              </div>
              <Badge variant="outline">{line.available ? "Available" : "Waiting"}</Badge>
            </div>
          ))}
          <Button disabled={!release.released}>
            {release.released ? "BOM Released to Production" : "Waiting for all materials"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm text-slate-800">{value}</div>
    </div>
  );
}
