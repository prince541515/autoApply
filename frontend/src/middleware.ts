import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get("role")?.value;
  const accountStatus = request.cookies.get("account_status")?.value;

  if (pathname.startsWith("/admin")) {
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  if (pathname.startsWith("/candidate")) {
    if (role !== "candidate") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (accountStatus === "pending" && pathname !== "/candidate/home") {
      return NextResponse.redirect(new URL("/candidate/home", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/candidate/:path*"],
};
