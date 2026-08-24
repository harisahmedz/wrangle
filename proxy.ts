import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/today",
  "/boards",
  "/money",
  "/learn",
  "/settings",
  "/p",
  "/trash",
];

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = SESSION_COOKIES.some((c) =>
    request.cookies.has(c),
  );
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isProtected && !hasSessionCookie) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  const boardMatch = pathname.match(
    /^\/p\/([0-9a-f-]{36})\/b\/(todo|ideas|work)$/,
  );
  if (boardMatch && hasSessionCookie) {
    const response = NextResponse.next();
    response.cookies.set("wrangle-last-board", `${boardMatch[1]}:${boardMatch[2]}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    return response;
  }

  if (pathname === "/signin" && hasSessionCookie) {
    return NextResponse.redirect(new URL("/today", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|sw\\.js|manifest\\.webmanifest|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
