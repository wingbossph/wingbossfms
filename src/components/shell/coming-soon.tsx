import { PageHeader } from "./page-header";

export function ComingSoon({ title, phase, children }: { title: string; phase: number; children?: React.ReactNode }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-display text-2xl tracking-wide">Coming in Phase {phase}</p>
        {children && <div className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">{children}</div>}
      </div>
    </>
  );
}
