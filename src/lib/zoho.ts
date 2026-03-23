import { adminDb } from "./firebase-admin";

let inMemoryToken: string | null = null;
let inMemoryExpiry = 0;

export async function getZohoToken(): Promise<string | null> {
  const now = Date.now();

  try {
    // 🔥 Firestore reference (ADMIN SDK)
    const tokenRef = adminDb.collection("zohoTokenDetails").doc("main");

    // ✅ 0. ENV CHECK (VERY IMPORTANT)
    if (
      !process.env.ZOHO_REFRESH_TOKEN ||
      !process.env.ZOHO_CLIENT_ID ||
      !process.env.ZOHO_CLIENT_SECRET
    ) {
      console.error("❌ Missing ENV variables");
      return null;
    }

    // ✅ 1. In-memory cache
    if (inMemoryToken && now < inMemoryExpiry) {
      console.log("⚡ Using in-memory token");
      return inMemoryToken;
    }

    // ✅ 2. Firestore cache
    const snapshot = await tokenRef.get();

    if (snapshot.exists) {
      const data = snapshot.data();

      console.log("📦 Token found in Firestore");

      if (data.expiresAt > now) {
        console.log("⚡ Using Firestore cached token");

        // sync memory
        inMemoryToken = data.accessToken;
        inMemoryExpiry = data.expiresAt;

        return data.accessToken;
      }

      console.log("⏳ Token expired in Firestore");
    }

    // ✅ 3. Fetch new token
    console.log("🔄 Fetching new Zoho token...");

    const res = await fetch("https://accounts.zoho.in/oauth/v2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token:"1000.b92124e5d06a71a38c5b03eab35b04f1.65c433d44cce4b16265b277c962e38ad",
        client_id:"1000.W9SCXR6JXB50PH7XQRPFGVYF0RS3WD",
        client_secret:"e908cc1d3e74c8f264ed91c9f2635c2ca0ef2d4080",
        grant_type: "refresh_token",
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.access_token) {
      console.error("❌ Zoho Token Error:", data);

      if (data.error === "invalid_code") {
        console.error("🚨 INVALID REFRESH TOKEN — regenerate from Zoho");
      }

      return null;
    }

    const expiresIn = Number(data.expires_in || 3600);

    // 🔥 expire 5 min early
    const expiresAt = now + (expiresIn - 300) * 1000;

    const tokenData = {
      accessToken: data.access_token,
      expiresAt,
      expiresIn,
      createdAt: snapshot.exists ? snapshot.data()?.createdAt || now : now,
      updatedAt: now,
    };

    // ✅ 4. Save using ADMIN SDK
    await tokenRef.set(tokenData);

    console.log("✅ Token saved to Firestore");

    // sync memory
    inMemoryToken = data.access_token;
    inMemoryExpiry = expiresAt;

    return data.access_token;

  } catch (error: any) {
    console.error("💥 Token system error:", error.message);
    return null;
  }
}