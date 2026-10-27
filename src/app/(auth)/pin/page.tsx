import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { currentDevice } from "@/server/auth/device";
import { getCurrentUser } from "@/server/auth/session";
import { PinPad } from "./pin-pad";

export const metadata = { title: "PIN login" };

export default async function PinPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  const device = await currentDevice();

  if (!device) {
    return (
      <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-950 p-6 text-center">
        <h1 className="text-2xl">Device not registered</h1>
        <p className="text-sm text-neutral-400">
          PIN login only works on a registered branch device. An Owner or Admin can register this device from
          Admin → Devices.
        </p>
        <Link href="/login" className="inline-block font-semibold underline underline-offset-4">
          Log in with email instead
        </Link>
      </div>
    );
  }

  // Staff who can work at this device's location and have a PIN set.
  const staff = await db.user.findMany({
    where: {
      isActive: true,
      pinHash: { not: null },
      OR: [
        { isOwner: true },
        { roleAssignments: { some: { OR: [{ locationId: device.locationId }, { locationId: null }] } } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-4">
      <p className="text-center text-sm uppercase tracking-widest text-neutral-400">{device.location.name}</p>
      <PinPad staff={staff} next={next ?? "/"} />
      <p className="text-center text-sm text-neutral-500">
        <Link href="/login" className="underline underline-offset-4">
          Log in with email
        </Link>
      </p>
    </div>
  );
}
