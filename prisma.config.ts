import "dotenv/config";
import { defineConfig } from "prisma/config";
import { directDatabaseUrl } from "./src/lib/db-url";

// Migrations use the direct (non-pooled) connection. On Supabase, DATABASE_URL
// is the pooled connection used by the app at runtime, and DIRECT_URL is the
// direct connection string.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed/index.ts",
  },
  datasource: {
    url: directDatabaseUrl() ?? "",
    // Only needed to generate new migrations (`prisma migrate diff --from-migrations`).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
