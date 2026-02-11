import { NextResponse } from "next/server";
import { getStockPaginated } from "@/lib/server/stock";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lastDocId = searchParams.get("lastDocId") || undefined;

  const result = await getStockPaginated(lastDocId);

  return NextResponse.json(result);
}
