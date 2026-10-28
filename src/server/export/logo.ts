import { readFileSync } from "node:fs";
import path from "node:path";

// The black logo for PDFs. Bundled with the server functions via
// outputFileTracingIncludes (next.config.ts); PDFs fall back to text without it.
let logo: Buffer | null | undefined;

export function pdfLogo(): Buffer | null {
  if (logo === undefined) {
    try {
      logo = readFileSync(path.join(process.cwd(), "public/logo-dark.png"));
    } catch {
      logo = null;
    }
  }
  return logo;
}
