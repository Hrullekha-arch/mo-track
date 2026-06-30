import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import BarcodeGenerator from "@/components/BarcodeGenerator";
import { productionOrders } from "@/lib/my-production-fpms-data";

export default function ApprovalGatePage() {
  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Step 2: SM Approval Gate</CardTitle>
          <CardDescription>
            Review the bed drawing and furniture drawing here. If `SM` confirms, the barcode is generated.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="space-y-4">
        {productionOrders.map((order) => (
          <Card key={order.id} className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>{order.orderNo} - {order.customerName}</CardTitle>
                  <CardDescription>{order.customerDemand}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{order.bedDrawing.status}</Badge>
                  <Badge variant="outline">{order.furnitureDrawing.status}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-[1fr_280px]">
              <div className="grid gap-3 md:grid-cols-2">
                <ApprovalBox title="Bed Drawing" value={order.bedDrawing.drawingNo} />
                <ApprovalBox title="Furniture Drawing" value={order.furnitureDrawing.drawingNo} />
                <ApprovalBox title="Bed Measurement" value={`${order.measurement.width} x ${order.measurement.length} x ${order.measurement.height} in`} />
                <ApprovalBox title="Storage Type" value={order.measurement.storageType} />
              </div>
              <div className="space-y-3">
                {order.barcode ? (
                  <BarcodeGenerator value={order.barcode} label="Generated Barcode" />
                ) : (
                  <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
                    Barcode is blocked until drawing is confirmed by `SM`.
                  </div>
                )}
                <div className="flex gap-2">
                  <Button>Confirm</Button>
                  <Button variant="outline">Reject</Button>
                </div>
                <Button asChild variant="secondary" className="w-full">
                  <Link href={`/my-production-fpms/orders/${order.id}`}>Open Order Profile</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ApprovalBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</div>
      <div className="mt-2 text-sm text-slate-800">{value}</div>
    </div>
  );
}
