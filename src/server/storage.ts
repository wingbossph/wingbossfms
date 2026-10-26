import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// File storage for receipt photos, deposit slips, DTR photos and imports.
// Production: Supabase Storage (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
// Development: the local .uploads/ folder (Vercel's filesystem is not persistent).

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "attachments";
const LOCAL_DIR = path.join(process.cwd(), ".uploads");

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

export async function putObject(storagePath: string, body: Buffer, contentType: string) {
  const sb = supabase();
  if (sb) {
    const res = await fetch(`${sb.url}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sb.key}`, "Content-Type": contentType, "x-upsert": "false" },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${await res.text()}`);
    return;
  }
  if (process.env.VERCEL) throw new Error("File storage isn't configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const file = path.join(LOCAL_DIR, storagePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function getObject(storagePath: string): Promise<Buffer> {
  const sb = supabase();
  if (sb) {
    const res = await fetch(`${sb.url}/storage/v1/object/${BUCKET}/${storagePath}`, {
      headers: { Authorization: `Bearer ${sb.key}` },
    });
    if (!res.ok) throw new Error(`Storage download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const file = path.join(LOCAL_DIR, storagePath);
  if (!file.startsWith(LOCAL_DIR)) throw new Error("Invalid path");
  return readFile(file);
}
