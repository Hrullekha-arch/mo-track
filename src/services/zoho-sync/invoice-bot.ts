import { getZohoInvoiceBotSettings, recordZohoInvoiceBotRun } from "@/lib/zoho-sync/bot-settings";
import { syncInvoiceById, syncPendingInvoices } from "./invoice-sync";
import type { ZohoSyncRunOptions } from "./queue-sync";

export async function runZohoInvoiceBot(
  options?: ZohoSyncRunOptions & { invoiceId?: string }
) {
  const settings = await getZohoInvoiceBotSettings();
  if (!settings.enabled) {
    await recordZohoInvoiceBotRun({ status: "disabled" });
    return {
      enabled: false,
      result: { processed: 0, synced: 0, failed: 0, skipped: 0, errors: [] },
    };
  }

  try {
    const result = options?.invoiceId
      ? await syncInvoiceById(options.invoiceId, options)
      : await syncPendingInvoices(options);
    await recordZohoInvoiceBotRun({
      status: result.failed > 0 ? "partial" : "success",
      summary: {
        processed: result.processed,
        synced: result.synced,
        failed: result.failed,
        skipped: result.skipped,
      },
    });
    return { enabled: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zoho invoice bot failed.";
    await recordZohoInvoiceBotRun({ status: "failed", error: message });
    throw error;
  }
}
