/* eslint-disable @next/next/no-img-element */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-black px-4 py-10 text-white">
      <div className="mb-8 flex flex-col items-center gap-3">
        <img src="/logo.png" alt="Wing Boss: the boss of all wings" className="h-auto w-64 sm:w-72" />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
