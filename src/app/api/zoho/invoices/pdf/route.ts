import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getZohoToken, invalidateZohoTokenCache } from "@/lib/zoho";

export const dynamic = "force-dynamic";

const ZOHO_BOOKS_BASE_URL =
  process.env.ZOHO_BOOKS_BASE_URL?.replace(/\/$/, "") || "https://www.zohoapis.in/books/v3";

const asText = (value: unknown) => String(value ?? "").trim();

const getOrgId = () => {
  const orgId = asText(process.env.ZOHO_ORG_ID);
  if (!orgId) throw new Error("Missing ZOHO_ORG_ID.");
  return orgId;
};

const buildUrlWithQuery = (path: string, query: URLSearchParams) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${ZOHO_BOOKS_BASE_URL}${normalizedPath}?${query.toString()}`;
};

const parsePrintFlag = (value: unknown) => {
  const normalized = asText(value).toLowerCase();
  if (!normalized) return false;
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const getErrorMessageFromRaw = async (response: Response): Promise<string> => {
  const fallback = `Zoho request failed with ${response.status}.`;
  const contentType = asText(response.headers.get("content-type")).toLowerCase();

  if (contentType.includes("application/json")) {
    const json = await response.json().catch(() => ({}));
    return asText((json as any)?.message) || fallback;
  }

  const raw = asText(await response.text().catch(() => ""));
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    return asText(parsed?.message) || fallback;
  } catch {
    return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
  }
};

async function callZohoRaw(
  url: string,
  init: RequestInit,
  options?: { retryUnauthorized?: boolean }
): Promise<Response> {
  const token = await getZohoToken();
  if (!token) throw new Error("Unable to authenticate with Zoho.");

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Zoho-oauthtoken ${token}`);

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (response.status === 401 && options?.retryUnauthorized !== false) {
    invalidateZohoTokenCache();
    return callZohoRaw(url, init, { retryUnauthorized: false });
  }

  if (!response.ok) {
    const reason = await getErrorMessageFromRaw(response);
    throw new Error(reason);
  }

  return response;
}

type ResolvedInvoiceMeta = {
  zohoInvoiceId?: string;
  zohoInvoiceNo?: string;
};

const resolveFromInvoiceDoc = async (invoiceDocId: string): Promise<ResolvedInvoiceMeta> => {
  const snap = await adminDb.collection("invoices").doc(invoiceDocId).get();
  if (!snap.exists) return {};

  const invoice = snap.data() as any;
  return {
    zohoInvoiceId: asText(invoice?.zohoInvoiceId) || undefined,
    zohoInvoiceNo:
      asText(invoice?.zohoInvoiceNo || invoice?.tallyVoucherNo || invoice?.invoiceNo) || undefined,
  };
};

const resolveZohoInvoiceByNumber = async (
  invoiceNumber: string
): Promise<{ invoiceId: string; invoiceNumber: string }> => {
  const target = asText(invoiceNumber).toUpperCase();
  if (!target) throw new Error("Invoice number is required.");

  let fuzzyMatch: { invoiceId: string; invoiceNumber: string } | null = null;

  for (let page = 1; page <= 15; page += 1) {
    const query = new URLSearchParams({
      organization_id: getOrgId(),
      per_page: "200",
      page: String(page),
      sort_column: "date",
      search_text: target,
    });
    const url = buildUrlWithQuery("/invoices", query);
    const response = await callZohoRaw(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => ({} as any));

    if (typeof data?.code === "number" && data.code !== 0) {
      const reason = asText(data?.message) || "Unable to list invoices in Zoho.";
      throw new Error(reason);
    }

    const invoices = Array.isArray(data?.invoices) ? data.invoices : [];
    for (const row of invoices) {
      const currentNo = asText(row?.invoice_number);
      const currentId = asText(row?.invoice_id);
      if (!currentNo || !currentId) continue;

      if (currentNo.toUpperCase() === target) {
        return { invoiceId: currentId, invoiceNumber: currentNo };
      }

      if (!fuzzyMatch && currentNo.toUpperCase().includes(target)) {
        fuzzyMatch = { invoiceId: currentId, invoiceNumber: currentNo };
      }
    }

    if (!data?.page_context?.has_more_page) break;
  }

  if (fuzzyMatch) return fuzzyMatch;
  throw new Error(`Zoho invoice "${invoiceNumber}" was not found.`);
};

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams;
    const invoiceDocId = asText(query.get("invoiceDocId"));
    let zohoInvoiceId = asText(query.get("invoiceId") || query.get("zohoInvoiceId"));
    let zohoInvoiceNo = asText(query.get("invoiceNo") || query.get("zohoInvoiceNo"));
    const print = parsePrintFlag(query.get("print"));

    if (invoiceDocId) {
      const fromDoc = await resolveFromInvoiceDoc(invoiceDocId);
      if (!zohoInvoiceId && fromDoc.zohoInvoiceId) zohoInvoiceId = fromDoc.zohoInvoiceId;
      if (!zohoInvoiceNo && fromDoc.zohoInvoiceNo) zohoInvoiceNo = fromDoc.zohoInvoiceNo;
    }

    if (!zohoInvoiceId && zohoInvoiceNo) {
      const resolved = await resolveZohoInvoiceByNumber(zohoInvoiceNo);
      zohoInvoiceId = resolved.invoiceId;
      zohoInvoiceNo = resolved.invoiceNumber;
    }

    if (!zohoInvoiceId) {
      return NextResponse.json(
        {
          error:
            "Missing Zoho invoice id. Pass invoiceId/zohoInvoiceId or invoiceDocId with saved zohoInvoiceId.",
        },
        { status: 400 }
      );
    }

    const pdfQuery = new URLSearchParams({
      organization_id: getOrgId(),
      accept: "pdf",
      print: print ? "true" : "false",
    });
    const pdfUrl = buildUrlWithQuery(
      `/invoices/${encodeURIComponent(zohoInvoiceId)}`,
      pdfQuery
    );

    const response = await callZohoRaw(pdfUrl, {
      method: "GET",
      headers: { Accept: "application/pdf" },
    });

    const contentType =
      asText(response.headers.get("content-type")) || "application/pdf";
    if (contentType.toLowerCase().includes("application/json")) {
      const body = await response.json().catch(() => ({}));
      const reason = asText((body as any)?.message) || "Zoho returned JSON instead of PDF.";
      throw new Error(reason);
    }

    const fallbackNo = zohoInvoiceNo || zohoInvoiceId;
    const safeNumber = fallbackNo.replace(/[^a-zA-Z0-9_.-]+/g, "_");
    const fileName = `zoho-invoice-${safeNumber}.pdf`;

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to fetch Zoho invoice PDF." },
      { status: 500 }
    );
  }
}

