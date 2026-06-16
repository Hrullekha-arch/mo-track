import { syncPendingInvoices } from "./invoice-sync";
import { syncPendingProducts } from "./product-sync";
import { syncPendingPurchases } from "./purchase-sync";
import { mergeSyncResults, type ZohoSyncRunOptions } from "./queue-sync";
import { syncPendingStock } from "./stock-sync";

export async function retryFailedZohoSync(options?: ZohoSyncRunOptions) {
  const retryOptions = { ...options, includeFailed: true };
  return mergeSyncResults([
    await syncPendingProducts(retryOptions),
    await syncPendingPurchases(retryOptions),
    await syncPendingInvoices(retryOptions),
    await syncPendingStock(retryOptions),
  ]);
}

