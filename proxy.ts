import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/today",
  "/upcoming",
  "/shutdown",
  "/weekly",
  "/wrapped",
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

// Enforced CSP (V3 S0c). It is built here, not in next.config.ts, because
// `script-src` carries a per-request nonce: Next reads it back from this
// request's Content-Security-Policy header and stamps it on every script it
// emits, including the inline `self.__next_f.push(...)` RSC flight chunks
// that differ on every request (which is why fixed hashes can't work), and
// the two boot scripts in app/layout.tsx and app/(app)/layout.tsx read it
// from `x-nonce` via headers(). style-src keeps 'unsafe-inline': dnd-kit and
// several components set style attributes. 'unsafe-eval' is dev-only (React
// rebuilds server error stacks with eval there).
function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com https://avatars.githubusercontent.com",
    "media-src 'self' blob: https://res.cloudinary.com",
    "font-src 'self'",
    // openrouter.ai: the bring-your-own-key AI calls (V3 S0). huggingface.co
    // and its CDNs (`*.hf.co` is where model files 302 to today,
    // `*.huggingface.co` covers the older cdn-lfs hosts): the Whisper model
    // download (V3 S7).
    "connect-src 'self' https://openrouter.ai https://api.cloudinary.com https://*.sentry.io https://huggingface.co https://*.huggingface.co https://*.hf.co",
    // 'self' for sw.js, blob: for the Whisper worker (V3 S7).
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    // The sign-in forms are server actions whose redirect() lands on the
    // provider, and Chrome checks form-action against redirects too.
    "form-action 'self' https://accounts.google.com https://github.com",
    "frame-ancestors 'none'",
  ].join("; ");
}

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

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  const boardMatch = pathname.match(
    /^\/p\/([0-9a-f-]{36})\/b\/(todo|ideas|work)$/,
  );
  if (boardMatch && hasSessionCookie) {
    response.cookies.set("wrangle-last-board", `${boardMatch[1]}:${boardMatch[2]}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|sw\\.js|manifest\\.webmanifest|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
