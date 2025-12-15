import { google } from "googleapis";

export async function getGoogleSheetsClient() {
  console.log("📝 Checking FIREBASE_SERVICE_ACCOUNT_KEY...");

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.error("❌ MISSING FIREBASE_SERVICE_ACCOUNT_KEY ENV");
    throw new Error("Service account env missing");
  }

  let credentials;

  try {
    credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    console.log("🔑 Service account parsed successfully");
  } catch (err) {
    console.error("❌ FAILED TO PARSE SERVICE ACCOUNT JSON", err);
    throw err;
  }

  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");

  console.log("🔐 Creating GoogleAuth Client...");

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  console.log("📗 Sheets client created!");
  return google.sheets({ version: "v4", auth });
}

export async function fetchPendingTasks() {
  try {
    console.log("📄 Fetching Sheet: Master");
    const sheets = await getGoogleSheetsClient();

    const spreadsheetId = "12KDSmvuKeWd7bAvZ9AJ2GuH6ThJZE3nZn_Zv75YVhPE";
    console.log("📘 Spreadsheet ID:", spreadsheetId);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Master!A1:Z999",
    });

    if (!response.data.values) {
      console.error("❌ Sheet returned no values");
      return [];
    }

    console.log("📦 Total rows fetched:", response.data.values.length);

    const rows = response.data.values;
    const header = rows[0];
    const data = rows.slice(1);

    const tasks = data.map((row) => {
      let obj: any = {};
      header.forEach((col, index) => {
        obj[col] = row[index] || "";
      });
      return obj;
    });

    console.log("📊 Parsed tasks:", tasks.length);

    const pending = tasks.filter((t: any) => !t["Actual"]);

    console.log("⏳ Pending tasks:", pending.length);

    return pending;

  } catch (error) {
    console.error("🔥 GOOGLE SHEETS ERROR:", error);
    throw error;
  }
}
