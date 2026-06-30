import BarcodeScanner from "@/components/BarcodeScanner";
import { productionOrders } from "@/lib/my-production-fpms-data";

export default function WorkshopScanPage() {
  const knownBarcodes = productionOrders
    .map((order) => order.barcode)
    .filter((barcode): barcode is string => Boolean(barcode));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Step 4: Workshop Barcode Scan</h2>
        <p className="mt-1 text-sm text-slate-600">
          Workshop team scans the approved barcode to open the released job on the floor.
        </p>
      </div>
      <BarcodeScanner knownBarcodes={knownBarcodes} />
    </div>
  );
}
