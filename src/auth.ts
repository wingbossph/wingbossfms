import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { loginIdField } from "@/lib/login-id";
import { authConfig, PASSWORD_IDLE_MINUTES } from "@/auth.config";
import { db } from "@/server/db";
import { DEVICE_COOKIE, findDeviceByToken } from "@/server/auth/device";
import { isLoginBlocked, recordLoginAttempt } from "@/server/auth/rate-limit";

// Compared against when the email doesn't exist, so response time doesn't reveal it.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

class TooManyAttempts extends CredentialsSignin {
  code = "too_many_attempts";
}

class DeviceNotRegistered extends CredentialsSignin {
  code = "device_not_registered";
}

const passwordSchema = z.object({
  email: loginIdField,
  password: z.string().min(1).max(200),
});

const pinSchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4,6}$/),
});

function clientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

async function auditLogin(userId: string, locationId: string | null, method: string, request: Request) {
  await db.auditLog.create({
    data: {
      userId,
      locationId,
      action: "LOGIN",
      entityType: "User",
      entityId: userId,
      after: { method },
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: "password",
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = passwordSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const ip = clientIp(request);

        if (await isLoginBlocked(email, ip)) throw new TooManyAttempts();

        const user = await db.user.findUnique({ where: { email } });
        const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        const success = Boolean(user && user.isActive && user.passwordHash && ok);
        await recordLoginAttempt({ identifier: email, ip, userId: user?.id ?? null, success });
        if (!success || !user) return null;

        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await auditLogin(user.id, null, "password", request);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          sessionVersion: user.sessionVersion,
          method: "password",
          idleMinutes: PASSWORD_IDLE_MINUTES,
        };
      },
    }),
    Credentials({
      id: "pin",
      credentials: { userId: {}, pin: {} },
      async authorize(raw, request) {
        const parsed = pinSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { userId, pin } = parsed.data;

        const device = await findDeviceByToken(readCookie(request, DEVICE_COOKIE));
        if (!device) throw new DeviceNotRegistered();

        const ip = clientIp(request);
        const identifier = `pin:${device.id}:${userId}`;
        if (await isLoginBlocked(identifier, ip)) throw new TooManyAttempts();

        const user = await db.user.findUnique({
          where: { id: userId },
          include: { roleAssignments: true },
        });
        const hasAccessHere =
          !!user &&
          (user.isOwner ||
            user.roleAssignments.some(
              (r) => r.locationId === null || r.locationId === device.locationId,
            ));
        const ok = !!user?.pinHash && (await bcrypt.compare(pin, user.pinHash));
        const success = Boolean(user && user.isActive && hasAccessHere && ok);
        await recordLoginAttempt({ identifier, ip, userId: user?.id ?? null, success });
        if (!success || !user) return null;

        await db.$transaction([
          db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
          db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }),
        ]);
        await auditLogin(user.id, device.locationId, "pin", request);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          sessionVersion: user.sessionVersion,
          method: "pin",
          deviceId: device.id,
          locationId: device.locationId,
          idleMinutes: device.idleTimeoutMinutes,
        };
      },
    }),
  ],
});
