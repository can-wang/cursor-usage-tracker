import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/cron"];
const ADMIN_ONLY_PAGE_PATHS = ["/settings"];
const ADMIN_ONLY_API_PATHS = ["/api/settings"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  if (!process.env.AUTH_SECRET) return NextResponse.next();
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

  const session = await auth();

  if (!session?.user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = session.user.role ?? "admin";
  const pathname = request.nextUrl.pathname;

  if (role !== "admin") {
    if (matchesPrefix(pathname, ADMIN_ONLY_API_PATHS)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (matchesPrefix(pathname, ADMIN_ONLY_PAGE_PATHS)) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      homeUrl.search = "";
      return NextResponse.redirect(homeUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon\\.png|logo\\.png|.*\\.svg).*)"],
};
