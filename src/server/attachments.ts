import "server-only";
import type { Tx } from "@/server/db";
import { UserFacingError } from "@/lib/errors";

/**
 * Links uploaded attachments to a saved record. Only unlinked files uploaded
 * by the same user can be attached, so ids from the client can't hijack
 * someone else's files.
 */
export async function linkAttachments(
  tx: Pick<Tx, "attachment">,
  ids: readonly string[],
  args: { actorId: string; entityType: string; entityId: string; locationId: string },
) {
  if (!ids.length) return;
  const res = await tx.attachment.updateMany({
    where: { id: { in: [...ids] }, uploadedById: args.actorId, entityId: null },
    data: { entityType: args.entityType, entityId: args.entityId, locationId: args.locationId },
  });
  if (res.count !== ids.length) throw new UserFacingError("One of the attached files couldn't be linked. Upload it again.");
}

export async function attachmentsFor(tx: Pick<Tx, "attachment">, entityType: string, entityId: string) {
  return tx.attachment.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "asc" } });
}
