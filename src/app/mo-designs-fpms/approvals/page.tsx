import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import BarcodePrinter from "@/components/BarcodePrinter";
import { getApprovalQueue } from "@/actions/approval";

export default async function MoDesignsApprovalsPage() {
  const queue = await getApprovalQueue();

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Step 2: SM Canvas Drawing Checkpoint</CardTitle>
          <CardDescription>
            Review the bed drawing and furniture drawing. If `SM` confirms the furniture drawing, barcode is printed.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="space-y-4">
        {queue.map((order) => (
          <Card key={order.id} className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>{order.orderNo} - {order.customerName}</CardTitle>
                  <CardDescription>{order.customerDemand}</CardDescription>
                </div>
                <Badge variant="outline">{order.approvalStatus}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-[1fr_280px]">
              <div className="grid gap-3 md:grid-cols-2">
                <ApprovalBox title="Bed Drawing" value={`${order.bedDrawing.drawingNo} / ${order.bedDrawing.status}`} />
                <ApprovalBox
                  title="Furniture Drawing"
                  value={`${order.furnitureDrawing.drawingNo} / ${order.furnitureDrawing.status}`}
                />
              </div>
              <div className="space-y-3">
                {order.barcode ? (
                  <BarcodePrinter value={order.barcode} title="Generated Barcode" />
                ) : (
                  <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
                    Barcode is generated only after furniture drawing confirmation.
                  </div>
                )}
                <div className="flex gap-2">
                  <Button>Confirm</Button>
                  <Button variant="outline">Reject</Button>
                </div>
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
