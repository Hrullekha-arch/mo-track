import { NextResponse } from "next/server";
import { getStockPaginated } from "@/lib/server/stock";

const STOCK_API_TIMEOUT_MS = 9000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lastDocId = searchParams.get("lastDocId") || undefined;
  const includeCount = searchParams.get("includeCount") === "true";

  const result = await Promise.race([
    getStockPaginated(lastDocId, { includeCount }),
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            items: [],
            lastDocId: null,
            totalCount: 0,
            timedOut: true,
          }),
        STOCK_API_TIMEOUT_MS
      )
    ),
  ]);

  return NextResponse.json(result);
}
