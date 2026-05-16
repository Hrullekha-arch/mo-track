import { google } from "googleapis";

const DEFAULT_SHEET_ID = "1EpfQfhfNA0AKSLoPVRsi62fsBwU4GbIoVHgCBBZs69Y";
const DEFAULT_SHEET_NAME = "IMS";
const IST_TIMEZONE = "Asia/Kolkata";
const DEFAULT_CACHE_TTL_MS = 2 * 60 * 1000;

type ImsSnapshot = {
  dateHeader: string;
  hasDateColumn: boolean;
  qtyByBcn: Map<string, number | null>;
};

type CacheEntry = {
  key: string;
  expiresAt: number;
  snapshot: ImsSnapshot;
};

let cacheEntry: CacheEntry | null = null;
let inflightKey: string | null = null;
let inflightPromise: Promise<ImsSnapshot> | null = null;

const formatDateForSheetHeader = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

const normalizeBcn = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const parseQuantity = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .trim();

  if (!normalized) return null;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const getCacheTtlMs = (): number => {
  const value = Number(process.env.IMS_SHEET_CACHE_TTL_MS ?? DEFAULT_CACHE_TTL_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_CACHE_TTL_MS;
};

const getSheetsClient = async () => {
  const serviceAccountKey =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountKey) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVICE_ACCOUNT_KEY."
    );
  }

  const credentials = JSON.parse(serviceAccountKey);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
};

const loadSnapshot = async (
  spreadsheetId: string,
  sheetName: string
): Promise<ImsSnapshot> => {
  const dateHeader = formatDateForSheetHeader(new Date());
  const key = `${spreadsheetId}::${sheetName}::${dateHeader}`;
  const now = Date.now();

  if (cacheEntry && cacheEntry.key === key && cacheEntry.expiresAt > now) {
    return cacheEntry.snapshot;
  }

  if (inflightPromise && inflightKey === key) {
    return inflightPromise;
  }

  inflightKey = key;
  inflightPromise = (async () => {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
    });

    const rows = (response.data.values ?? []) as string[][];
    const headerRow = rows[0] ?? [];
    const dateColumnIndex = headerRow.findIndex(
      (column) => String(column ?? "").trim() === dateHeader
    );

    const qtyByBcn = new Map<string, number | null>();
    if (dateColumnIndex >= 0) {
      for (const row of rows.slice(1)) {
        const rawBcn = row?.[0];
        const bcnKey = normalizeBcn(rawBcn);
        if (!bcnKey || qtyByBcn.has(bcnKey)) continue;
        qtyByBcn.set(bcnKey, parseQuantity(row?.[dateColumnIndex]));
      }
    }

    const snapshot: ImsSnapshot = {
      dateHeader,
      hasDateColumn: dateColumnIndex >= 0,
      qtyByBcn,
    };

    cacheEntry = {
      key,
      expiresAt: now + getCacheTtlMs(),
      snapshot,
    };

    return snapshot;
  })();

  try {
    return await inflightPromise;
  } finally {
    if (inflightKey === key) {
      inflightKey = null;
      inflightPromise = null;
    }
  }
};

export async function lookupImsByBcn(rawBcn: string) {
  const bcn = String(rawBcn ?? "").trim();
  const spreadsheetId = process.env.IMS_SHEET_ID || DEFAULT_SHEET_ID;
  const sheetName = process.env.IMS_SHEET_NAME || DEFAULT_SHEET_NAME;
  const snapshot = await loadSnapshot(spreadsheetId, sheetName);
  const key = normalizeBcn(bcn);
  const found = key ? snapshot.qtyByBcn.has(key) : false;

  return {
    bcn,
    qty: found ? snapshot.qtyByBcn.get(key) ?? null : null,
    date: snapshot.dateHeader,
    found,
    hasDateColumn: snapshot.hasDateColumn,
  };
}

export async function lookupImsByBcns(rawBcns: unknown[]) {
  const spreadsheetId = process.env.IMS_SHEET_ID || DEFAULT_SHEET_ID;
  const sheetName = process.env.IMS_SHEET_NAME || DEFAULT_SHEET_NAME;
  const snapshot = await loadSnapshot(spreadsheetId, sheetName);

  const deduped: Array<{ bcn: string; key: string }> = [];
  const seen = new Set<string>();

  for (const value of rawBcns) {
    const bcn = String(value ?? "").trim();
    const key = normalizeBcn(bcn);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push({ bcn, key });
  }

  const items = deduped.map(({ bcn, key }) => {
    const found = snapshot.qtyByBcn.has(key);
    return {
      bcn,
      qty: found ? snapshot.qtyByBcn.get(key) ?? null : null,
      found,
    };
  });

  return {
    date: snapshot.dateHeader,
    hasDateColumn: snapshot.hasDateColumn,
    items,
  };
}
