import { afterEach, describe, expect, it } from "vitest";
import { directDatabaseUrl, runtimeDatabaseUrl } from "@/lib/db-url";

const KEYS = ["DATABASE_URL", "DIRECT_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) if (saved[k] === undefined) delete process.env[k];
  else process.env[k] = saved[k];
});
const set = (env: Record<string, string>) => {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
};

describe("database URLs", () => {
  it("prefers our own names", () => {
    set({ DATABASE_URL: "postgres://a/app", DIRECT_URL: "postgres://a/direct", POSTGRES_PRISMA_URL: "postgres://b/x" });
    expect(runtimeDatabaseUrl()).toBe("postgres://a/app");
    expect(directDatabaseUrl()).toBe("postgres://a/direct");
  });

  it("falls back to the Vercel ↔ Supabase integration names, keeping libpq's sslmode=require", () => {
    set({ POSTGRES_PRISMA_URL: "postgres://u:p@pooler:6543/postgres?sslmode=require&pgbouncer=true", POSTGRES_URL_NON_POOLING: "postgres://u:p@pooler:5432/postgres?sslmode=require" });
    expect(runtimeDatabaseUrl()).toBe("postgres://u:p@pooler:6543/postgres?sslmode=require&pgbouncer=true&uselibpqcompat=true");
    expect(directDatabaseUrl()).toBe("postgres://u:p@pooler:5432/postgres?sslmode=require");
  });
});
