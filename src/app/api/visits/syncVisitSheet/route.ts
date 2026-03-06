import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { adminDb, adminStorage } from "@/lib/firebase-admin";

const DEFAULT_SHEET_ID = "11gMXD3ZQiH7D9NtCFx1q3COH18jQQRTh3mLSaa8RFKA";
const DEFAULT_SHEET_NAME = "Installer";
const SYNC_VISIT_ROUTE_VERSION = "2026-03-06-visit-sheet-redesign-v3";

const canonicalHeader = [
  "Measurement Timestamp",
  "Deal Id",
  "Customer Name",
  "Mob",
  "Address",
  "Measurement/Installation/Delivery",
  "Installer Name",
  "Image link",
  "Up Selling/Cross Selling/ Not Req",
  "Type time",
];

const getSheetsClient = async () => {
  const serviceAccountKey =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVICE_ACCOUNT_KEY.");
  }

  const credentials = JSON.parse(serviceAccountKey);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
};

const chunkArray = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const parseDateValue = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  return new Date(value);
};

const formatDateOnly = (value?: string) => {
  if (!value) return "";
  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value?: string) => {
  if (!value) return "";
  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

const rowScore = (row: string[]) =>
  row.filter((cell) => String(cell ?? "").trim() !== "").length;

const formatAddressParts = (address: any) => {
  if (!address) return "";
  return [
    address.line1 || address.addressLine1 || address.address,
    address.line2 || address.addressLine2,
    address.landmark,
    address.city,
    address.state,
    address.pincode || address.pinCode || address.zip || address.zipCode,
  ]
    .filter(Boolean)
    .join(", ");
};

const buildCustomerAddress = (visit: any, customer: any) => {
  const fromVisit = String(visit?.customerAddress || visit?.customerSnapshot?.address || "").trim();
  if (fromVisit) return fromVisit;

  const fromCustomerSnapshot = formatAddressParts(
    customer?.shippingAddress || customer?.billingAddress
  );
  if (fromCustomerSnapshot) return fromCustomerSnapshot;

  const savedAddress =
    Array.isArray(customer?.savedAddresses) && customer.savedAddresses.length > 0
      ? customer.savedAddresses[0]
      : null;
  if (savedAddress?.address) {
    return [savedAddress.address, savedAddress.landmark].filter(Boolean).join(", ");
  }

  return String(customer?.address || customer?.addressPinCode || "").trim();
};

const resolveVisitTypeLabel = (rawType: string) => {
  const normalized = String(rawType || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("measurement")) return "Measurement";
  if (normalized.includes("delivery")) return "Delivery";
  if (normalized.includes("fitting") || normalized.includes("installation")) return "Installation";
  return rawType;
};

const resolveUpsellStatus = (visit: any) => {
  const rawValue =
    visit?.upSelling ??
    visit?.upSellingStatus ??
    visit?.upSellStatus ??
    visit?.crossSelling ??
    visit?.crossSellingStatus ??
    visit?.upsell ??
    visit?.crosssell;
  const normalized = String(rawValue ?? "").trim().toLowerCase();
  if (!normalized) return "Not Req";
  if (["upselling", "up selling", "up_sell", "up sell", "up"].includes(normalized)) return "Up Selling";
  if (["crossselling", "cross selling", "cross_sell", "cross sell", "cross"].includes(normalized)) {
    return "Cross Selling";
  }
  if (["not req", "not required", "na", "n/a", "none", "no"].includes(normalized)) return "Not Req";
  return String(rawValue).trim();
};

const getVisitImageSource = (visit: any) =>
  String(
    visit?.measurementPdfUrl ||
      visit?.imageUrl ||
      visit?.photoUrl ||
      visit?.imageLink ||
      visit?.pdfUrl ||
      ""
  ).trim();

const parseStorageObjectFromUrl = (rawUrl: string) => {
  const raw = String(rawUrl || "").trim();
  if (!raw) return {};

  if (raw.startsWith("gs://")) {
    const noPrefix = raw.slice("gs://".length);
    const slashIdx = noPrefix.indexOf("/");
    if (slashIdx === -1) return {};
    return {
      bucket: noPrefix.slice(0, slashIdx),
      objectPath: decodeURIComponent(noPrefix.slice(slashIdx + 1)),
    };
  }

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const parts = parsed.pathname.split("/").filter(Boolean);

    let bucket = "";
    let objectPath = "";

    if (host === "firebasestorage.googleapis.com") {
      if (parts[0] === "v0" && parts[1] === "b" && parts[3] === "o" && parts.length >= 5) {
        bucket = parts[2] || "";
        objectPath = decodeURIComponent(parts.slice(4).join("/"));
      }
    } else if (host === "storage.googleapis.com") {
      if (
        parts[0] === "download" &&
        parts[1] === "storage" &&
        parts[2] === "v1" &&
        parts[3] === "b" &&
        parts[5] === "o" &&
        parts.length >= 7
      ) {
        bucket = parts[4] || "";
        objectPath = decodeURIComponent(parts.slice(6).join("/"));
      } else if (parts.length >= 2) {
        bucket = parts[0] || "";
        objectPath = decodeURIComponent(parts.slice(1).join("/"));
      }
    } else if (host.endsWith(".storage.googleapis.com")) {
      bucket = host.replace(".storage.googleapis.com", "");
      objectPath = decodeURIComponent(parts.join("/"));
    }

    if (!objectPath) {
      const byQuery = parsed.searchParams.get("name");
      if (byQuery) objectPath = decodeURIComponent(byQuery);
    }

    return {
      bucket: bucket || undefined,
      objectPath: objectPath || undefined,
    };
  } catch {
    return {};
  }
};

const toPermanentTokenLink = async (rawUrl: string): Promise<string> => {
  const source = String(rawUrl || "").trim();
  if (!source) return "";

  const hasToken = source.includes("token=");
  const isSignedUrl = source.includes("X-Goog-Algorithm=") || source.includes("Signature=");
  if (hasToken && !isSignedUrl) {
    return source;
  }

  if (!adminStorage) return source;

  const parsed = parseStorageObjectFromUrl(source);
  if (!parsed.objectPath) return source;

  const bucketName = parsed.bucket || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) return source;

  try {
    const file = adminStorage.bucket(bucketName).file(parsed.objectPath);
    const [metadata] = await file.getMetadata();
    const customMetadata = metadata?.metadata || {};
    let token = String(customMetadata.firebaseStorageDownloadTokens || "")
      .split(",")
      .map((entry) => entry.trim())
      .find(Boolean);

    if (!token) {
      token = randomUUID();
      await file.setMetadata({
        metadata: {
          ...customMetadata,
          firebaseStorageDownloadTokens: token,
        },
      });
    }

    const encodedPath = encodeURIComponent(parsed.objectPath);
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
  } catch (error) {
    console.warn("Failed to convert image URL to permanent token URL:", error);
    return source;
  }
};

export async function POST() {
  try {
    const sheets = await getSheetsClient();
    const sheetId = process.env.VISITS_SHEET_ID || DEFAULT_SHEET_ID;
    const sheetName = process.env.VISITS_SHEET_NAME || DEFAULT_SHEET_NAME;

    const visitsSnapshot = await adminDb.collectionGroup("visits").get();
    if (visitsSnapshot.empty) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: `${sheetName}!A1:Z`,
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [canonicalHeader] },
      });
      return NextResponse.json({ success: true, rows: 0, syncVersion: SYNC_VISIT_ROUTE_VERSION });
    }

    const customerIdsForLookup = new Set<string>();
    const installerIds = new Set<string>();
    const visits = visitsSnapshot.docs.map((docSnap) => {
      const visit = docSnap.data() as any;
      const parts = docSnap.ref.path.split("/");
      const customerId = parts[1];
      const dealDocId = parts[3];
      const visitId = docSnap.id;

      if (customerId) customerIdsForLookup.add(customerId);
      if (visit.assignedTo) installerIds.add(String(visit.assignedTo));

      return { visit, customerId, dealDocId, visitId };
    });

    const customersById = new Map<string, any>();
    const customerRefs = Array.from(customerIdsForLookup).map((id) =>
      adminDb.collection("customers").doc(id)
    );
    for (const batch of chunkArray(customerRefs, 500)) {
      const docs = await adminDb.getAll(...batch);
      docs.forEach((doc) => {
        if (doc.exists) customersById.set(doc.id, doc.data());
      });
    }

    const installerNameById = new Map<string, string>();
    const installerRefs = Array.from(installerIds).map((id) =>
      adminDb.collection("users").doc(id)
    );
    for (const batch of chunkArray(installerRefs, 500)) {
      const docs = await adminDb.getAll(...batch);
      docs.forEach((doc) => {
        if (!doc.exists) return;
        const data = doc.data() as any;
        if (data?.name) installerNameById.set(doc.id, data.name);
      });
    }

    const imageSourceSet = new Set<string>();
    visits.forEach(({ visit }) => {
      const imageSource = getVisitImageSource(visit);
      if (imageSource) imageSourceSet.add(imageSource);
    });

    const permanentImageLinkBySource = new Map<string, string>();
    for (const imageSource of imageSourceSet) {
      const permanent = await toPermanentTokenLink(imageSource);
      permanentImageLinkBySource.set(imageSource, permanent);
    }

    const rowMap = new Map<string, string[]>();
    visits.forEach(({ visit, customerId, dealDocId, visitId }) => {
      const customer = customersById.get(customerId) || {};
      const resolvedCustomerName = String(
        visit?.customerSnapshot?.name || visit?.customerName || customer?.name || "Unknown"
      ).trim();
      const mobile = String(
        visit?.customerSnapshot?.phone ||
          visit?.customerPhone ||
          customer?.mobileNo ||
          customer?.phone ||
          ""
      ).trim();

      const dealId = String(visit?.dealId || visit?.dealSnapshot?.dealCode || dealDocId || "").trim();
      const address = buildCustomerAddress(visit, customer);
      const typeLabel = resolveVisitTypeLabel(visit?.typeOfVisit || visit?.visitType || visit?.purpose || "");
      const installerName = visit?.assignedTo
        ? installerNameById.get(String(visit.assignedTo)) || ""
        : "";

      const measurementTimestamp = formatDateTime(
        String(
          visit?.measurementSavedAt ||
            visit?.measurementDate ||
            visit?.visitEndTime ||
            visit?.updatedAt ||
            visit?.createdAt ||
            ""
        )
      );

      const slotDate = String(visit?.slotDate || visit?.dueDate || "").trim();
      const slotLabel = String(
        visit?.slotLabel ||
          (visit?.slotStart && visit?.slotEnd ? `${visit.slotStart} - ${visit.slotEnd}` : "")
      ).trim();
      const typeTime = [formatDateOnly(slotDate), slotLabel].filter(Boolean).join(" ").trim();

      const imageSource = getVisitImageSource(visit);
      const imageLink = imageSource ? permanentImageLinkBySource.get(imageSource) || imageSource : "";
      const upSellingStatus = resolveUpsellStatus(visit);

      const row = [
        measurementTimestamp,
        dealId,
        resolvedCustomerName,
        mobile,
        address,
        typeLabel,
        installerName,
        imageLink,
        upSellingStatus,
        typeTime,
      ];

      const dedupeKey = `${customerId || ""}|${dealDocId || ""}|${visitId || ""}` || row.map(normalize).join("|");
      if (!dedupeKey) return;
      const existing = rowMap.get(dedupeKey);
      if (!existing || rowScore(row) > rowScore(existing)) {
        rowMap.set(dedupeKey, row);
      }
    });

    const rows = Array.from(rowMap.values());
    rows.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:Z`,
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [canonicalHeader, ...rows],
      },
    });

    return NextResponse.json({
      success: true,
      syncVersion: SYNC_VISIT_ROUTE_VERSION,
      rows: rows.length,
      dedupedRows: visits.length - rows.length,
    });
  } catch (error) {
    console.error("Visit sheet sync failed:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
