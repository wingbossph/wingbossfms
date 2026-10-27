import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getObject } from "@/server/storage";
import { getCurrentUser } from "@/server/auth/session";

/** Streams an attachment to users who can access its location (or who uploaded it). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const att = await db.attachment.findUnique({ where: { id } });
  if (!att) return new NextResponse("Not found", { status: 404 });
  const allowed = user.isOwner || att.uploadedById === user.id || (att.locationId && user.access.locationIds.includes(att.locationId));
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  const body = await getObject(att.storagePath);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Disposition": `inline; filename="${att.fileName.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
