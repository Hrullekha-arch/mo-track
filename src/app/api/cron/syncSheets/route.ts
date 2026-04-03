import { NextResponse } from "next/server";
import { POST as syncOrders } from "@/app/api/orders/syncOrderSheet/route";
import { POST as syncCustomerRevenue } from "@/app/api/orders/syncCustomerRevenueSheet/route";
import { POST as syncVisits } from "@/app/api/visits/syncVisitSheet/route";
import { POST as syncPms } from "@/app/api/pms/syncWorkSheet/route";
import { POST as syncWalkin } from "@/app/api/walkin/syncWalkinSheet/route";

type SyncTaskResult = {
  ok: boolean;
  status: number;
  durationMs: number;
  data: any;
  error?: string;
};

const isAuthorized = (request: Request) => {
  if (process.env.NODE_ENV !== "production") return true;
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const provided =
    url.searchParams.get("secret") ||
    request.headers.get("x-cron-secret") ||
    "";
  const vercelHeader = request.headers.get("x-vercel-cron");
  const isVercelCron = vercelHeader === "1" || vercelHeader === "true";

  if (!secret) {
    return isVercelCron;
  }
  return provided === secret || isVercelCron;
};

const runTask = async (task: () => Promise<Response>): Promise<SyncTaskResult> => {
  const startedAt = Date.now();
  try {
    const response = await task();
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      data,
      error: response.ok ? undefined : (data as any)?.message || `HTTP ${response.status}`,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 500,
      durationMs: Date.now() - startedAt,
      data: {},
      error: error?.message || "Unknown sync error",
    };
  }
};

const runSync = async () => {
  const pmsRequest = new Request("http://localhost/api/pms/syncWorkSheet", { method: "POST" });
  const [orders, visits, walkin, customerRevenue, pms] = await Promise.all([
    runTask(() => syncOrders()),
    runTask(() => syncVisits()),
    runTask(() => syncWalkin()),
    runTask(() => syncCustomerRevenue()),
    runTask(() => syncPms(pmsRequest)),
  ]);

  return {
    orders,
    visits,
    walkin,
    customerRevenue,
    pms,
  };
};

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  try {
    const results = await runSync();
    const failed = Object.entries(results)
      .filter(([, value]) => !(value as SyncTaskResult).ok)
      .map(([name, value]) => ({
        name,
        error: (value as SyncTaskResult).error || "Unknown error",
      }));

    return NextResponse.json({
      success: failed.length === 0,
      partial: failed.length > 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      failed,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Sync failed." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
