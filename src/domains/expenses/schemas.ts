import { z } from "zod";
import { pesoField } from "@/domains/admin/schemas";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const expenseLineSchema = z.object({
  accountId: z.string().optional().default(""),
  itemId: z.string().optional().default(""),
  qty: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Quantity like 10 or 2.5").optional().or(z.literal("")),
  unit: z.enum(["BASE", "PURCHASE"]).default("BASE"),
  description: z.string().trim().max(200).optional().default(""),
  amount: pesoField,
});

export const expenseSchema = z
  .object({
    id: z.string().optional(),
    locationId: z.string().min(1),
    date: ymd,
    supplierId: z.string().optional().default(""),
    newSupplierName: z.string().trim().max(120).optional().default(""),
    terms: z.enum(["PAID_NOW", "ON_ACCOUNT"]),
    paidFromMoneyAccountId: z.string().optional().default(""),
    dueDate: ymd.optional().or(z.literal("")),
    receiptNo: z.string().trim().max(60).optional().default(""),
    isVatInvoice: z.boolean().default(false),
    vat: pesoField.optional(),
    notes: z.string().trim().max(500).optional().default(""),
    lines: z.array(expenseLineSchema).min(1, "Add at least one line").max(50),
    attachmentIds: z.array(z.string()).max(10).default([]),
    submit: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.terms === "PAID_NOW" && !v.paidFromMoneyAccountId) ctx.addIssue({ code: "custom", path: ["paidFromMoneyAccountId"], message: "Where was it paid from?" });
    if (v.terms === "ON_ACCOUNT" && !v.supplierId && !v.newSupplierName) ctx.addIssue({ code: "custom", path: ["supplierId"], message: "Bills need a supplier" });
    v.lines.forEach((l, i) => {
      if (!l.accountId && !l.itemId) ctx.addIssue({ code: "custom", path: ["lines", i, "accountId"], message: "Choose a category or an inventory item" });
      if (l.itemId && !l.qty) ctx.addIssue({ code: "custom", path: ["lines", i, "qty"], message: "Enter the quantity bought" });
      if (l.amount <= 0n) ctx.addIssue({ code: "custom", path: ["lines", i, "amount"], message: "Amount must be more than zero" });
    });
  });
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const paymentSchema = z.object({
  expenseId: z.string().min(1),
  date: ymd,
  moneyAccountId: z.string().min(1),
  amount: pesoField,
  reference: z.string().trim().max(80).optional().default(""),
});

export const decisionSchema = z.object({
  expenseId: z.string().min(1),
  note: z.string().trim().max(300).optional().default(""),
});

export const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(120),
  tin: z.string().trim().max(20).optional().default(""),
  contactName: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().max(120).optional().default(""),
  termsDays: z.coerce.number().int().min(0).max(180).default(0),
  defaultAccountId: z.string().optional().default(""),
  isActive: z.boolean().default(true),
});

export const recurringSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  locationId: z.string().min(1),
  supplierId: z.string().optional().default(""),
  accountId: z.string().min(1),
  amount: pesoField,
  terms: z.enum(["PAID_NOW", "ON_ACCOUNT"]),
  moneyAccountId: z.string().optional().default(""),
  frequency: z.enum(["WEEKLY", "SEMI_MONTHLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  dayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
  nextRunOn: ymd,
  endOn: ymd.optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});
