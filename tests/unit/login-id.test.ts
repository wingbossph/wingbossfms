import { describe, expect, it } from "vitest";
import { isEmail, loginIdField } from "@/lib/login-id";

describe("login id", () => {
  it("accepts emails and simple usernames, lowercased", () => {
    expect(loginIdField.parse(" WingbossPH ")).toBe("wingbossph");
    expect(loginIdField.parse("Owner@Wingboss.ph")).toBe("owner@wingboss.ph");
    expect(loginIdField.parse("juan.dela-cruz_2")).toBe("juan.dela-cruz_2");
  });
  it("rejects spaces, symbols and very short ids", () => {
    for (const bad of ["ab", "juan dela cruz", "a/b", "-x"]) expect(loginIdField.safeParse(bad).success).toBe(false);
  });
  it("tells emails from usernames", () => {
    expect(isEmail("owner@wingboss.ph")).toBe(true);
    expect(isEmail("wingbossph")).toBe(false);
    expect(isEmail(null)).toBe(false);
  });
});
