import { NextRequest, NextResponse } from "next/server";

import {
  getZohoItemById,
  searchZohoItems,
  type ZohoItem,
} from "@/lib/zoho-books";

type AvailabilityLookup = {
  key?: string;
  bcn?: string;
  name?: string;
  zohoItemId?: string;
};

const availabilityCache = new Map<
  string,
  { expiresAt: number; item: { zohoItemId: string | null; availableQty: number | null } }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;

const normalizeCode = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const finiteNumberOrNull = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function selectExactItem(
  candidates: ZohoItem[],
  lookup: AvailabilityLookup
): ZohoItem | null {
  const requestedId = String(lookup.zohoItemId || "").trim();
  if (requestedId) {
    const byId = candidates.find((item) => item.id === requestedId);
    if (byId) return byId;
  }

  const bcn = normalizeCode(lookup.bcn);
  if (bcn) {
    const bySku = candidates.find((item) => normalizeCode(item.sku) === bcn);
    if (bySku) return bySku;
  }

  const name = normalizeCode(lookup.name);
  if (name) {
    const byName = candidates.find((item) => normalizeCode(item.name) === name);
    if (byName) return byName;
  }

  return null;
}

async function resolveAvailability(lookup: AvailabilityLookup) {
  const cacheKey = String(lookup.zohoItemId || normalizeCode(lookup.bcn) || lookup.key || "");
  const cached = availabilityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.item;

  const query = String(lookup.bcn || lookup.name || "").trim();
  if (!query) return { zohoItemId: null, availableQty: null };

  const requestedId = String(lookup.zohoItemId || "").trim();
  const directItem = requestedId ? await getZohoItemById(requestedId) : null;
  const candidates = directItem
    ? [directItem]
    : await searchZohoItems(query, { usage: "sales", limit: 20 });
  const item = directItem || selectExactItem(candidates, lookup);
  const detailedItem = directItem || (item ? await getZohoItemById(item.id) : null);
  const resolvedItem = detailedItem || item;
  const resolved = resolvedItem
    ? {
        zohoItemId: resolvedItem.id,
        availableQty: finiteNumberOrNull(
          resolvedItem.availableStock ??
            resolvedItem.actualAvailableStock ??
            resolvedItem.stockOnHand
        ),
      }
    : { zohoItemId: null, availableQty: null };

  availabilityCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    item: resolved,
  });
  return resolved;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const lookups = Array.isArray(body?.items)
      ? (body.items as AvailabilityLookup[]).slice(0, 50)
      : [];

    const results: Array<{
      key: string;
      zohoItemId: string | null;
      availableQty: number | null;
    }> = [];

    for (let index = 0; index < lookups.length; index += 4) {
      const batch = lookups.slice(index, index + 4);
      const resolved = await Promise.all(
        batch.map(async (lookup) => {
          try {
            const availability = await resolveAvailability(lookup);
            return {
              key: String(lookup.key || lookup.bcn || ""),
              ...availability,
            };
          } catch (error) {
            console.error(`Zoho availability lookup failed for ${lookup.bcn || lookup.key}:`, error);
            return {
              key: String(lookup.key || lookup.bcn || ""),
              zohoItemId: null,
              availableQty: null,
            };
          }
        })
      );
      results.push(...resolved);
    }

    return NextResponse.json({ items: results });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to fetch Zoho availability." },
      { status: 500 }
    );
  }
}
