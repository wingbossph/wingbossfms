// Seeds an empty database: base data (seedBase) and, with SEED_DEMO=1,
// 60 days of demo activity (seedDemo).
//
// Run with `npm run db:seed`, or `npm run db:reset` to wipe and reseed.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DEMO_PASSWORD, seedBase } from "./base";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  if ((await db.location.count()) > 0) {
    console.log("Database already seeded. Use `npm run db:reset` to start over.");
    return;
  }
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "owner@wingboss.ph";
  await seedBase(db, { ownerEmail, ownerPassword: process.env.SEED_OWNER_PASSWORD ?? DEMO_PASSWORD });
  console.log("Seeded base data: 4 locations, roles, chart of accounts, users, items, menu.");

  console.log(`
Demo logins
  Owner        ${ownerEmail} / (SEED_OWNER_PASSWORD)   PIN 1111
  Admin        admin@wingboss.ph / ${DEMO_PASSWORD}   PIN 2222  (Matina + Lanang)
  Cashiers     PIN only: Carlo 3001, Mika 3002 (Matina) · Lito 4001, Joy 4002 (Lanang)
  Commissary   PIN only: Ben 5001
PIN login needs a registered device: log in as Owner/Admin on the tablet,
then Admin → Devices → "Register this device".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
