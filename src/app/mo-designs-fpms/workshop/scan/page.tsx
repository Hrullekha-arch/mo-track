import { getOrders } from "@/actions/order";
import { getMachineResources, getPeopleResources, getRoutingConfiguration } from "@/actions/resource";
import ScannerLayer from "@/components/ScannerLayer";

export default async function MoDesignsWorkshopScanPage() {
  const orders = await getOrders();
  const people = await getPeopleResources();
  const machines = await getMachineResources();
  const routes = await getRoutingConfiguration();
  const knownOrders = orders
    .filter((order) => Boolean(order.barcode))
    .map((order) => ({
      orderId: order.id,
      barcode: order.barcode as string,
      orderNo: order.orderNo,
      customerName: order.customerName,
      product: order.bedType,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Step 4: Live Tracking Scanner Module</h2>
        <p className="mt-1 text-sm text-slate-600">
          Once the barcode is generated and BOM is released, workshop uses this scanner layer to mount the live job.
        </p>
      </div>
      <ScannerLayer knownOrders={knownOrders} people={people} machines={machines} routes={routes} />
    </div>
  );
}
