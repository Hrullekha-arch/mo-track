import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrderBomLines, getProductionOrder } from "@/lib/my-production-fpms-data";

export default async function BomReleasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = getProductionOrder(id);

  if (!order) notFound();

  const lines = getOrderBomLines(id);
  const allItemsAvailable = lines.length > 0 && lines.every((line) => line.available);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Step 3: BOM Form - {order.orderNo}</CardTitle>
          <CardDescription>
            BOM process starts only if all items are available and the furniture drawing has already been approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Info label="Furniture Drawing" value={`${order.furnitureDrawing.drawingNo} / ${order.furnitureDrawing.status}`} />
          <Info label="Barcode" value={order.barcode || "Not generated"} />
          <Info label="Release Status" value={allItemsAvailable ? "BOM can start" : "BOM blocked"} />
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Material Availability</CardTitle>
          <CardDescription>Every required line must be available before production can start.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line) => (
            <div key={line.id} className="flex flex-col gap-2 rounded-xl border bg-white p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-medium text-slate-900">{line.material}</div>
                <div className="text-sm text-slate-600">{line.code} - {line.requiredQty} - {line.location}</div>
              </div>
              <Badge variant="outline">{line.available ? "Available" : "Waiting Stock"}</Badge>
            </div>
          ))}

          <Button disabled={!allItemsAvailable || order.furnitureDrawing.status !== "approved"}>
            {allItemsAvailable && order.furnitureDrawing.status === "approved"
              ? "Release BOM to Production"
              : "Waiting for approval or stock"}
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
