import { getZohoToken, invalidateZohoTokenCache } from "./auth";

const ZOHO_BOOKS_BASE_URL =
  process.env.ZOHO_BOOKS_BASE_URL?.replace(/\/$/, "") || "https://www.zohoapis.in/books/v3";

const asText = (value: unknown) => String(value ?? "").trim();

export function getZohoOrganizationId() {
  const organizationId = asText(process.env.ZOHO_ORG_ID);
  if (!organizationId) throw new Error("Missing ZOHO_ORG_ID.");
  return organizationId;
}

export function buildZohoBooksUrl(path: string, query?: URLSearchParams) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const params = query || new URLSearchParams();
  if (!params.has("organization_id")) {
    params.set("organization_id", getZohoOrganizationId());
  }
  return `${ZOHO_BOOKS_BASE_URL}${normalizedPath}?${params.toString()}`;
}

export async function zohoBooksRequest<T = any>(
  path: string,
  init: RequestInit,
  query?: URLSearchParams,
  retryUnauthorized = true
): Promise<T> {
  const token = await getZohoToken();
  if (!token) throw new Error("Unable to authenticate with Zoho.");

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Zoho-oauthtoken ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildZohoBooksUrl(path, query), {
    ...init,
    headers,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && retryUnauthorized) {
    invalidateZohoTokenCache();
    return zohoBooksRequest<T>(path, init, query, false);
  }

  if (!response.ok || (typeof data?.code === "number" && data.code !== 0)) {
    throw new Error(asText(data?.message) || `Zoho request failed with ${response.status}.`);
  }

  return data as T;
}

