"use server";

import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { putObject } from "@/server/storage";
import { requireActor } from "@/server/auth/session";
import { handleAction, UserFacingError } from "@/server/action";
import { manilaDateString } from "@/lib/dates";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/csv": "csv",
};
const MAX_BYTES = 10 * 1024 * 1024;

/** Uploads one file for a location. Returns its attachment id, to be linked when the record is saved. */
export async function uploadAttachment(formData: FormData): Promise<{ ok: boolean; id?: string; message?: string }> {
  let id: string | undefined;
  const result = await handleAction(async () => {
    const actor = await requireActor();
    const file = formData.get("file");
    const locationId = String(formData.get("locationId") ?? "");
    if (!(file instanceof File)) throw new UserFacingError("No file received.");
    if (!actor.access.locationIds.includes(locationId)) throw new UserFacingError("Choose one of your locations.");
    const ext = ALLOWED[file.type];
    if (!ext) throw new UserFacingError("Upload a photo (JPG/PNG), PDF or CSV.");
    if (file.size > MAX_BYTES) throw new UserFacingError("Files must be 10 MB or smaller.");

    const storagePath = `${locationId}/${manilaDateString().slice(0, 7)}/${randomUUID()}.${ext}`;
    await putObject(storagePath, Buffer.from(await file.arrayBuffer()), file.type);
    const att = await db.attachment.create({
      data: { storagePath, fileName: file.name.slice(0, 200), mimeType: file.type, sizeBytes: file.size, locationId, uploadedById: actor.id },
    });
    id = att.id;
  });
  return { ok: !!result?.ok, id, message: result?.message };
}
