import { execSync } from "node:child_process";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { seedBase } from "../../prisma/seed/base";

export const TEST_OWNER = { email: "owner@test.local", password: "Test-password-1" };

/** Recreates the test schema from migrations and loads base data once per run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/wingboss_test";
  if (!/test/i.test(url)) throw new Error(`Refusing to reset a database whose URL doesn't contain "test": ${url}`);
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.end();
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, stdio: "pipe" });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  await seedBase(db, { ownerEmail: TEST_OWNER.email, ownerPassword: TEST_OWNER.password });
  await db.$disconnect();
}
