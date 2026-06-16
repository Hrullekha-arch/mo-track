import "server-only";

import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const ZOHO_BOT_CONTROLLER_ROLES = new Set([
  "admin",
  "it",
  "data analytics",
]);

const normalizeRole = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const readBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
};

export async function authenticateApiUser(request: Request) {
  const token = readBearerToken(request);
  if (!token) return null;

  const decoded = await adminAuth.verifyIdToken(token);
  const userSnapshot = await adminDb.collection("users").doc(decoded.uid).get();
  if (!userSnapshot.exists) return null;

  const user = userSnapshot.data() || {};
  return {
    id: decoded.uid,
    name: String(user.name || decoded.name || "").trim(),
    email: String(user.email || decoded.email || "").trim(),
    role: String(user.role || "").trim(),
  };
}

export function canControlZohoInvoiceBot(role: unknown) {
  return ZOHO_BOT_CONTROLLER_ROLES.has(normalizeRole(role));
}

export function isAuthorizedCronRequest(request: Request) {
  if (process.env.NODE_ENV !== "production") return true;

  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const provided =
    url.searchParams.get("secret") ||
    request.headers.get("x-cron-secret") ||
    "";
  const vercelHeader = request.headers.get("x-vercel-cron");
  const isVercelCron = vercelHeader === "1" || vercelHeader === "true";

  return secret ? provided === secret || isVercelCron : isVercelCron;
}
