import { NextResponse } from "next/server";
import { POST as syncOrders } from "@/app/api/orders/syncOrderSheet/route";
import { POST as syncVisits } from "@/app/api/visits/syncVisitSheet/route";
import { POST as syncPms } from "@/app/api/pms/syncWorkSheet/route";
import { POST as syncWalkin } from "@/app/api/walkin/syncWalkinSheet/route";

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

const runSync = async () => {
  const orderResponse = await syncOrders();
  const orderJson = await orderResponse.json().catch(() => ({}));

  const visitResponse = await syncVisits();
  const visitJson = await visitResponse.json().catch(() => ({}));

  const walkinResponse = await syncWalkin();
  const walkinJson = await walkinResponse.json().catch(() => ({}));

  const pmsRequest = new Request("http://localhost/api/pms/syncWorkSheet", { method: "POST" });
  const pmsResponse = await syncPms(pmsRequest);
  const pmsJson = await pmsResponse.json().catch(() => ({}));

  return {
    orders: orderJson,
    visits: visitJson,
    walkin: walkinJson,
    pms: pmsJson,
  };
};

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  try {
    const results = await runSync();
    return NextResponse.json({ success: true, startedAt, results });
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
