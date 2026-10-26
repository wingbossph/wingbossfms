import Link from "next/link";

export const metadata = { title: "No access" };

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-4xl">No access</h1>
      <p className="mt-2 text-muted-foreground">
        Your account doesn&apos;t have permission to open that page. Ask the Owner if you need it.
      </p>
      <Link href="/" className="mt-6 inline-block font-semibold underline underline-offset-4">
        Back to home
      </Link>
    </div>
  );
}
