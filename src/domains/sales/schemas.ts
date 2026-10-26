import { z } from "zod";
import { pesoField } from "@/domains/admin/schemas";

export const qtyField = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Quantity like 3 or 1.5");

export const salesDraftSchema = z.object({
  reportId: z.string().min(1),
  lines: z.array(z.object({ productId: z.string().min(1), qty: qtyField })).max(200),
  discounts: z
    .array(
      z.object({
        discountTypeId: z.string().min(1),
        amount: pesoField,
        customerName: z.string().trim().max(120).optional().default(""),
        idNumber: z.string().trim().max(60).optional().default(""),
        receiptNo: z.string().trim().max(60).optional().default(""),
        notes: z.string().trim().max(200).optional().default(""),
      }),
    )
    .max(200),
  voids: z
    .array(
      z.object({
        amount: pesoField,
        isRefund: z.boolean(),
        reason: z.string().trim().min(3, "Give a reason").max(200),
        receiptNo: z.string().trim().max(60).optional().default(""),
      }),
    )
    .max(100),
  serviceCharge: pesoField,
  payments: z
    .array(z.object({ channelId: z.string().min(1), amount: pesoField, reference: z.string().trim().max(80).optional().default("") }))
    .max(30),
  mismatchExplanation: z.string().trim().max(500).optional().default(""),
});
export type SalesDraftInput = z.infer<typeof salesDraftSchema>;

export const openReportSchema = z.object({
  locationId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftNo: z.coerce.number().int().min(1).max(4).default(1),
});

export const cashCountSchema = z.object({
  reportId: z.string().min(1),
  bills: z.record(z.string(), z.coerce.number().int().min(0).max(100000)),
  coins: pesoField,
  otherCashIn: pesoField,
  otherCashOut: pesoField,
  reason: z.string().trim().max(300).optional().default(""),
});

export const reopenSchema = z.object({
  reportId: z.string().min(1),
  reason: z.string().trim().min(5, "Explain what needs correcting").max(500),
});
