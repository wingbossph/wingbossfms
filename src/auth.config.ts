import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

// Edge-safe part of the Auth.js config (no Prisma). Used by middleware.
// Providers live in src/auth.ts.

const PUBLIC_PATHS = ["/login", "/pin", "/api/auth", "/manifest.webmanifest"];

export const PASSWORD_IDLE_MINUTES = 120;

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  providers: [],
  logger: {
    // A wrong password/PIN is expected and already recorded in LoginAttempt.
    error(error) {
      if (error.name === "CredentialsSignin") return;
      console.error(error);
    },
  },
  callbacks: {
    jwt({ token, user }) {
      const now = Date.now();
      if (user) {
        token.sub = user.id;
        token.sv = user.sessionVersion;
        token.method = user.method;
        token.deviceId = user.deviceId ?? null;
        token.locationId = user.locationId ?? null;
        token.idleMinutes = user.idleMinutes;
      }
      // Sliding idle timeout: every authenticated request (middleware runs
      // auth() on each navigation) pushes the deadline forward.
      if (typeof token.idleUntil === "number" && now > token.idleUntil) return null;
      token.idleUntil = now + (token.idleMinutes ?? PASSWORD_IDLE_MINUTES) * 60_000;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.sv = token.sv ?? -1;
      session.method = token.method ?? "password";
      session.deviceId = token.deviceId ?? null;
      session.locationId = token.locationId ?? null;
      session.idleUntil = token.idleUntil ?? 0;
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
      if (auth?.user) {
        // The top-bar location (wb_loc cookie) is every page's default location
        // filter: a page opened without ?location= sees it as if it were in the URL.
        const loc = request.cookies.get("wb_loc")?.value;
        if (request.method === "GET" && loc && !pathname.startsWith("/api/") && !request.nextUrl.searchParams.has("location")) {
          const url = request.nextUrl.clone();
          url.searchParams.set("location", loc);
          return NextResponse.rewrite(url);
        }
        return true;
      }
      // Branch devices go to the PIN pad; everyone else to the email login.
      const target = request.cookies.has("wb_device") ? "/pin" : "/login";
      const url = new URL(target, request.nextUrl);
      if (pathname !== "/") url.searchParams.set("next", pathname);
      return Response.redirect(url);
    },
  },
} satisfies NextAuthConfig;
