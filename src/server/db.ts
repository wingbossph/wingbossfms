import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { runtimeDatabaseUrl } from "@/lib/db-url";

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

function createClient() {
  const adapter = new PrismaPg({ connectionString: runtimeDatabaseUrl() });
  return new PrismaClient({ adapter });
}

// Reuse one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
