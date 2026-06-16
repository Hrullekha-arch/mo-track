import { adminDb } from "./firebase-admin";

let inMemoryToken: string | null = null;
let inMemoryExpiry = 0;

const isDev = process.env.NODE_ENV === "development";

export function invalidateZohoTokenCache() {
  inMemoryToken = null;
  inMemoryExpiry = 0;
}

async function getRefreshToken(): Promise<string | null> {
  if (isDev) {
    if (!process.env.ZOHO_REFRESH_TOKEN) {
      console.error("[Zoho] Missing ZOHO_REFRESH_TOKEN in env.");
      return null;
    }
    return process.env.ZOHO_REFRESH_TOKEN;
  }

  const doc = await adminDb.collection("zohoTokenDetails").doc("config").get();
  const refreshToken = doc.data()?.refreshToken ?? null;
  if (!refreshToken) {
    console.error("[Zoho] No refreshToken found in Firestore zohoTokenDetails/config.");
  }
  return refreshToken;
}

export async function getZohoToken(): Promise<string | null> {
  const now = Date.now();

  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET) {
    console.error("[Zoho] Missing ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET in env.");
    return null;
  }

  try {
    const tokenRef = adminDb.collection("zohoTokenDetails").doc("main");

    if (inMemoryToken && now < inMemoryExpiry) {
      return inMemoryToken;
    }

    const snapshot = await tokenRef.get();
    if (snapshot.exists) {
      const data = snapshot.data()!;
      if (data.expiresAt > now) {
        inMemoryToken = data.accessToken;
        inMemoryExpiry = data.expiresAt;
        return data.accessToken;
      }
    }

    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    const res = await fetch("https://accounts.zoho.in/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.ZOHO_CLIENT_ID!,
        client_secret: process.env.ZOHO_CLIENT_SECRET!,
        grant_type: "refresh_token",
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.access_token) {
      console.error("[Zoho] Token refresh failed:", data);
      if (data.error === "invalid_code") {
        console.error(
          "[Zoho] Invalid refresh token. Update",
          isDev ? ".env ZOHO_REFRESH_TOKEN." : "Firestore zohoTokenDetails/config."
        );
      }
      return null;
    }

    const expiresIn = Number(data.expires_in || 3600);
    const expiresAt = now + Math.max(expiresIn - 300, 60) * 1000;

    await tokenRef.set({
      accessToken: data.access_token,
      expiresAt,
      expiresIn,
      createdAt: snapshot.exists ? snapshot.data()?.createdAt ?? now : now,
      updatedAt: now,
    });

    inMemoryToken = data.access_token;
    inMemoryExpiry = expiresAt;

    return data.access_token;
  } catch (error: any) {
    console.error("[Zoho] Token system error:", error?.message || error);
    return null;
  }
}
