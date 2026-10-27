"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { handleAction, UserFacingError, type ActionState } from "@/server/action";
import { assertCan, requireActor } from "@/server/auth/session";
import { linkAttachments } from "@/server/attachments";
import { pesoField } from "@/domains/admin/schemas";
import { manilaDateString } from "@/lib/dates";
import { recordMoneyTransfer } from "./service";

const transferSchema = z.object({
  type: z.enum(["TRANSFER", "CASH_DEPOSIT", "PETTY_REPLENISH", "WITHDRAWAL"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  locationId: z.string().min(1),
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amount: pesoField,
  fee: pesoField,
  reference: z.string().trim().max(80).optional().default(""),
  notes: z.string().trim().max(300).optional().default(""),
  attachmentIds: z.array(z.string()).max(5).default([]),
});

export async function recordTransferAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await requireActor();
    const input = transferSchema.parse(raw);
    assertCan(actor, input.type === "CASH_DEPOSIT" ? "cash:deposit" : "money:transfer", input.locationId);
    if (input.date > manilaDateString()) throw new UserFacingError("The date can't be in the future.");
    if (input.type === "CASH_DEPOSIT" && !input.reference && input.attachmentIds.length === 0) {
      throw new UserFacingError("Add the deposit slip reference number or a photo of the slip.");
    }
    await db.$transaction(async (tx) => {
      const t = await recordMoneyTransfer(
        tx,
        {
          type: input.type,
          date: input.date,
          locationId: input.locationId,
          fromAccountId: input.fromAccountId,
          toAccountId: input.toAccountId,
          amountCents: input.amount,
          feeCents: input.fee,
          reference: input.reference,
          notes: input.notes,
        },
        actor.id,
      );
      await linkAttachments(tx, input.attachmentIds, { actorId: actor.id, entityType: "MoneyTransfer", entityId: t.id, locationId: input.locationId });
    });
    revalidatePath("/cash");
    return { ok: true, message: input.type === "CASH_DEPOSIT" ? "Deposit recorded." : "Transfer recorded." };
  });
}
