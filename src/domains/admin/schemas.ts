import { loginIdField } from "@/lib/login-id";
import { z } from "zod";
import { parsePeso } from "@/lib/money";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Peso amount typed by a user → centavos. */
export const pesoField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const cents = parsePeso(v === "" ? "0" : v);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Enter an amount like 1,500.00" });
      return z.NEVER;
    }
    return cents;
  });

export const LOCATION_TYPES = ["BRANCH", "COMMISSARY", "OFFICE"] as const;

export const DEFAULT_LOCATION_MONEY_ACCOUNTS = ["CASH_DRAWER", "UNDEPOSITED_CASH", "PETTY_CASH"] as const;

export const locationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,6}$/, "2–6 letters or digits, e.g. LAN"),
  type: z.enum(LOCATION_TYPES),
  address: z.string().trim().max(300).optional().default(""),
  openedOn: ymd.optional().or(z.literal("")),
  drawerFloat: pesoField,
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const newLocationSchema = locationSchema.extend({
  moneyAccounts: z.array(z.enum(DEFAULT_LOCATION_MONEY_ACCOUNTS)).default([]),
  channelIds: z.array(z.string().min(1)).default([]),
  staff: z
    .array(z.object({ userId: z.string().min(1), roleId: z.string().min(1) }))
    .default([]),
});

export type NewLocationInput = z.infer<typeof newLocationSchema>;

export const editLocationSchema = locationSchema.extend({
  id: z.string().min(1),
  isActive: z.boolean(),
  channelIds: z.array(z.string().min(1)).default([]),
});

export const userSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: loginIdField
    .optional()
    .or(z.literal("").transform(() => undefined)),
  password: z
    .string()
    .min(10, "At least 10 characters")
    .max(200)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  pin: z
    .string()
    .regex(/^\d{4,6}$/, "4–6 digits")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  isActive: z.boolean().default(true),
  roles: z
    .array(z.object({ roleId: z.string().min(1), locationId: z.string().nullable() }))
    .default([]),
  overrides: z
    .array(
      z.object({
        permissionKey: z.string().min(1),
        locationId: z.string().nullable(),
        effect: z.enum(["ALLOW", "DENY"]),
      }),
    )
    .default([]),
});

export const newUserSchema = userSchema.refine((u) => u.email || u.pin, {
  message: "Give the user an email + password, a PIN, or both.",
  path: ["email"],
});

export const editUserSchema = userSchema.extend({ id: z.string().min(1) });

export const roleMatrixSchema = z.object({
  roleId: z.string().min(1),
  permissionKeys: z.array(z.string()),
});

export const newRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional().default(""),
  copyFromRoleId: z.string().optional(),
});

export const registerDeviceSchema = z.object({
  name: z.string().trim().min(2).max(60),
  locationId: z.string().min(1),
  idleTimeoutMinutes: z.coerce.number().int().min(1).max(240).default(15),
});
