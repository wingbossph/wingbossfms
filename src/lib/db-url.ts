// Database connection strings. Our own names (DATABASE_URL, DIRECT_URL) win;
// otherwise the names the Vercel ↔ Supabase integration sets are used, so a
// project connected through the Vercel marketplace works with no extra setup.

/** node-postgres treats sslmode=require as "verify the certificate"; Supabase's chain isn't in Node's store, so keep libpq's meaning (encrypt). */
function libpqSsl(url: string | undefined) {
  if (!url || !/[?&]sslmode=require/.test(url) || /[?&]uselibpqcompat=/.test(url)) return url;
  return `${url}&uselibpqcompat=true`;
}

/** Pooled connection for the app at runtime. */
export function runtimeDatabaseUrl() {
  return libpqSsl(process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL);
}

/** Direct (non-pooled) connection for migrations. */
export function directDatabaseUrl() {
  return process.env.DIRECT_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL;
}
