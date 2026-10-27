import { z } from "zod";

/** A login is an email address or a simple username (letters, digits, . _ -). Stored lowercase. */
export const loginIdField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters")
  .max(120)
  .refine((v) => z.email().safeParse(v).success || /^[a-z0-9][a-z0-9._-]*$/.test(v), "Use an email address or a username (letters, numbers, dot, dash, underscore)");

export const isEmail = (v: string | null | undefined) => !!v && z.email().safeParse(v).success;
