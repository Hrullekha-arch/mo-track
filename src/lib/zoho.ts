import { adminDb } from "./firebase-admin";

let inMemoryToken: string | null = null;
let inMemoryExpiry = 0;

const isDev = process.env.NODE_ENV === "development";

async function getRefreshToken(): Promise<string | null> {
  if (isDev) {
    if (!process.env.ZOHO_REFRESH_TOKEN) {
      console.error("❌ [DEV] Missing ZOHO_REFRESH_TOKEN in .env");
      return null;
    }
    return process.env.ZOHO_REFRESH_TOKEN;
  }

  // Production: read from Firestore
  const doc = await adminDb.collection("zohoTokenDetails").doc("config").get();
  const refreshToken = doc.data()?.refreshToken ?? null;
  if (!refreshToken) {
    console.error("❌ [PROD] No refreshToken found in Firestore zohoTokenDetails/config");
  }
  return refreshToken;
}

export async function getZohoToken(): Promise<string | null> {
  const now = Date.now();

  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET) {
    console.error("❌ Missing ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET in ENV");
    return null;
  }

  try {
    const tokenRef = adminDb.collection("zohoTokenDetails").doc("main");

    // 1. In-memory cache
    if (inMemoryToken && now < inMemoryExpiry) {
      console.log("⚡ Using in-memory token");
      return inMemoryToken;
    }

    // 2. Firestore cache
    const snapshot = await tokenRef.get();
    if (snapshot.exists) {
      const data = snapshot.data()!;
      if (data.expiresAt > now) {
        console.log("⚡ Using Firestore cached token");
        inMemoryToken = data.accessToken;
        inMemoryExpiry = data.expiresAt;
        return data.accessToken;
      }
      console.log("⏳ Firestore token expired — refreshing");
    }

    // 3. Get refresh token from the right source
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    console.log(`🔄 Fetching new Zoho token [${isDev ? "DEV/env" : "PROD/db"}]...`);

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
      console.error("❌ Zoho token error:", data);
      if (data.error === "invalid_code") {
        console.error("🚨 Invalid refresh token — regenerate from Zoho and update", isDev ? ".env" : "Firestore zohoTokenDetails/config");
      }
      return null;
    }

    const expiresIn = Number(data.expires_in || 3600);
    const expiresAt = now + (expiresIn - 300) * 1000;

    const tokenData = {
      accessToken: data.access_token,
      expiresAt,
      expiresIn,
      createdAt: snapshot.exists ? snapshot.data()?.createdAt ?? now : now,
      updatedAt: now,
    };

    await tokenRef.set(tokenData);
    console.log("✅ Token saved to Firestore");

    inMemoryToken = data.access_token;
    inMemoryExpiry = expiresAt;

    return data.access_token;

  } catch (error: any) {
    console.error("💥 Token system error:", error.message);
    return null;
  }
}
