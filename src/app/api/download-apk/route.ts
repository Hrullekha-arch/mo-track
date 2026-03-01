import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const FILE_ID = "1-AQv2EmeygulvybM0T7NDPEtfa-Ensb3"

    if (!FILE_ID) {
      return new Response("Missing file ID", { status: 500 });
    }

    // Use usercontent domain (better for large files)
    const driveUrl = `https://drive.usercontent.google.com/download?id=${FILE_ID}&export=download`;

    const driveResponse = await fetch(driveUrl);

    if (!driveResponse.ok) {
      return new Response("Drive download failed", { status: 500 });
    }

    // Stream file instead of loading in memory
    return new Response(driveResponse.body, {
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": 'attachment; filename="MoTrack.apk"',
        "Cache-Control": "no-store",
      },
    });

  } catch (error) {
    console.error("Download error:", error);
    return new Response("Server error", { status: 500 });
  }
}