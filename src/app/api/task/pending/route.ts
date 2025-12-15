import { fetchPendingTasks } from "@/lib/googleSheets";
import { NextResponse } from "next/server";


export async function GET(req: Request) {
  console.log("📥 API HIT:", req.url);

  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    console.log("👤 Email param =", email);

    if (!email) {
      return NextResponse.json({
        success: false,
        error: "Missing email parameter",
      });
    }

    console.log("📡 Fetching tasks from Google Sheets...");
    const tasks = await fetchPendingTasks();

    console.log("📦 Total tasks fetched:", tasks.length);

    const userTasks = tasks.filter((t: any) =>
      t["Email"]?.toLowerCase() === email.toLowerCase()
    );

    console.log("👤 Tasks for user:", userTasks.length);

    return NextResponse.json({
      success: true,
      tasks: userTasks,
    });

  } catch (error) {
    console.error("🔥 API ERROR:", error);

    return NextResponse.json({
      success: false,
      error: String(error),
    });
  }
}
