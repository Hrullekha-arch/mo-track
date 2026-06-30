import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/dashboard/selectionForm") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/selectionform";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/selectionForm"],
};
