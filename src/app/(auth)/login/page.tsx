import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { currentDevice } from "@/server/auth/device";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  const device = await currentDevice();

  return (
    <div className="space-y-6">
      <LoginForm next={next ?? "/"} />
      {device && (
        <p className="text-center text-sm text-neutral-400">
          Staff on this {device.location.name} device?{" "}
          <Link href="/pin" className="font-semibold text-white underline underline-offset-4">
            Log in with PIN
          </Link>
        </p>
      )}
    </div>
  );
}
