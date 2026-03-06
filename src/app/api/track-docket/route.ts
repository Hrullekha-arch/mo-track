import { NextRequest, NextResponse } from "next/server";

const SM_BASE =
  "https://yana.smexpresslogistics.com/IYANA/webTrackYourConsignmentAction.do";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface TrackingEvent {
  index: number;
  message: string;
  date: string; // e.g. "06/03/2026"
  time: string; // e.g. "01:33 PM"
}

export interface DocketTrackingResult {
  docketNo: string;
  currentStatus: string | null;
  receivedBy: string | null;
  receivedOn: string | null;
  events: TrackingEvent[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Strip all HTML tags and decode basic entities */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * The detail table rows look like:
 *   <td class="normaltext">Label </td>
 *   <td class="normaltext">:</td>
 *   <td class="normaldata">VALUE</td>
 *
 * Grab the normaldata cell that immediately follows the matching label.
 */
function extractDetailValue(html: string, label: string): string | null {
  const re = new RegExp(
    `class=['"]normaltext['"][^>]*>\\s*${label}[^<]*<\\/td>\\s*` +
      `<td[^>]*>[^<]*<\\/td>\\s*` + // colon cell
      `<td[^>]*class=['"]normaldata['"][^>]*>([^<]*)<\\/td>`,
    "i"
  );
  const m = html.match(re);
  if (!m) return null;
  const val = stripTags(m[1]);
  return val === "-" || val === "" ? null : val;
}

/**
 * Parse the tracking event rows from the .dtable tbody.
 * Each row: <td>index</td> <td>message</td> <td>date time</td>
 */
function extractEvents(html: string): TrackingEvent[] {
  const events: TrackingEvent[] = [];

  // Isolate the tbody of the dtable
  const tbodyMatch = html.match(
    /<table[^>]+class=['"]dtable['"][^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i
  );
  if (!tbodyMatch) return events;

  const tbody = tbodyMatch[1];
  const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      stripTags(c[1])
    );

    // Expect exactly 3 cells: index, message, datetime
    if (cells.length !== 3) continue;
    const [idxRaw, message, datetimeRaw] = cells;

    const idx = parseInt(idxRaw, 10);
    if (isNaN(idx) || !message) continue;

    // datetimeRaw e.g. "06/03/2026 01:33 PM"
    const dtParts = datetimeRaw.trim().split(/\s+/);
    const date = dtParts[0] ?? "";
    const time = dtParts.slice(1).join(" "); // "01:33 PM"

    events.push({ index: idx, message, date, time });
  }

  return events;
}

// ── Route Handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const docketNo = searchParams.get("docketNo")?.trim();

  if (!docketNo) {
    return NextResponse.json(
      { error: "Missing required query param: docketNo" },
      { status: 400 }
    );
  }

  const targetURL =
    `${SM_BASE}?reqCode=showTrackYourCosignmentPage` +
    `&searchType=AWBNO&searchValue=${encodeURIComponent(docketNo)}`;

  let html: string;
  try {
    const res = await fetch(targetURL, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream responded with ${res.status}` },
        { status: 502 }
      );
    }

    html = await res.text();
  } catch (err: any) {
    console.error("[track-docket] fetch error:", err);
    return NextResponse.json(
      { error: "Failed to reach tracking service" },
      { status: 502 }
    );
  }

  const result: DocketTrackingResult = {
    docketNo,
    currentStatus: extractDetailValue(html, "Current Status"),
    receivedBy: extractDetailValue(html, "Received By"),
    receivedOn: extractDetailValue(html, "Received On"),
    events: extractEvents(html),
  };

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}