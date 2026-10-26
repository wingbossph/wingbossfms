import type { DefaultSession } from "next-auth";

type LoginMethod = "password" | "pin";

declare module "next-auth" {
  interface User {
    sessionVersion: number;
    method: LoginMethod;
    deviceId?: string | null;
    locationId?: string | null;
    idleMinutes: number;
  }

  interface Session {
    user: { id: string } & DefaultSession["user"];
    sv: number;
    method: LoginMethod;
    deviceId: string | null;
    locationId: string | null;
    idleUntil: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    sv?: number;
    method?: LoginMethod;
    deviceId?: string | null;
    locationId?: string | null;
    idleMinutes?: number;
    idleUntil?: number;
  }
}
