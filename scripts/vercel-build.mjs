// Vercel runs this instead of `npm run build` (the "vercel-build" script).
// With a database connected it applies migrations and seeds an empty
// database once (the seed skips a database that already has data), then builds.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const hasDb = ["DIRECT_URL", "DATABASE_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL", "POSTGRES_URL"].some((k) => process.env[k]);

if (hasDb) {
  run("npx prisma migrate deploy");
  run("npx prisma db seed");
} else {
  console.log("No database configured for this environment: skipping migrations and seed.");
}
run("npm run build");
