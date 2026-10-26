"use client";

import { Button } from "@/components/ui/button";

export function PrintButton({ children }: { children: React.ReactNode }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      {children}
    </Button>
  );
}
