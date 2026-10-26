/* eslint-disable @next/next/no-img-element */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-black px-4 py-10 text-white">
      <div className="mb-8 flex flex-col items-center gap-3">
        <img src="/logo.svg" alt="Wingboss" className="size-16" />
        <p className="font-display text-4xl tracking-wider">WINGBOSS</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
