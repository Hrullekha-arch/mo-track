// =============================================================================
// PMS API Client — Centralized fetch wrapper with retry + timeout
//
// Problem: Raw fetch calls scattered everywhere with basic try/catch.
// No retry on transient failures, no timeout, no abort.
//
// Solution: Single wrapper used by all PMS API calls.
// =============================================================================

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

type PmsApiOptions = {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
};

type PmsApiResult<T = any> = {
  ok: boolean;
  data: T;
  status: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Make a POST request to a PMS API endpoint with retry and timeout.
 */
export const pmsApiFetch = async <T = any>(
  url: string,
  body: Record<string, any>,
  options: PmsApiOptions = {}
): Promise<PmsApiResult<T>> => {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries = MAX_RETRIES, signal } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Create per-attempt abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // If caller provided a signal, chain it
    if (signal) {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        return { ok: true, data: data as T, status: response.status };
      }

      // Don't retry client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        return { ok: false, data: data as T, status: response.status };
      }

      // Server error — retry
      lastError = new Error(data?.message || `Server error: ${response.status}`);
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Abort = don't retry
      if (error?.name === "AbortError") {
        throw new Error(signal?.aborted ? "Request cancelled" : "Request timed out");
      }

      lastError = error;
    }

    // Wait before retry (skip wait on last attempt)
    if (attempt < retries) {
      await sleep(RETRY_DELAY_MS * (attempt + 1)); // linear backoff
    }
  }

  throw lastError || new Error("PMS API request failed after retries");
};

// ---------------------------------------------------------------------------
// Typed PMS API calls
// ---------------------------------------------------------------------------

type CreateOrderResult = { success: boolean; message?: string; jobIds?: string[] };
type AutopilotResult = { success: boolean; planned?: number; message?: string };
type AutoAdvanceResult = { success: boolean; advanced?: number };
type SyncWorkSheetResult = { success: boolean };

export const pmsApi = {
  createOrder: (body: { orderId: string; productId: string; qty: number }, opts?: PmsApiOptions) =>
    pmsApiFetch<CreateOrderResult>("/api/pms/createOrder", body, opts),

  runAutopilot: (body: { orderId?: string; includePlanned?: boolean }, opts?: PmsApiOptions) =>
    pmsApiFetch<AutopilotResult>("/api/pms/runAutopilot", body, opts),

  autoAdvance: (opts?: PmsApiOptions) =>
    pmsApiFetch<AutoAdvanceResult>("/api/pms/autoAdvance", {}, opts),

  syncWorkSheet: (rows: string[][], opts?: PmsApiOptions) =>
    pmsApiFetch<SyncWorkSheetResult>("/api/pms/syncWorkSheet", { rows }, opts),
};