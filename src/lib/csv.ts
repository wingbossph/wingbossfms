/** RFC 4180 CSV. Cells starting with = + - @ are prefixed with ' so spreadsheets don't run them as formulas. */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let s = cell === null || cell === undefined ? "" : String(cell);
          if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

/** Browser-only: triggers a CSV download (with BOM so Excel reads ₱ and accents). */
export function downloadCsv(fileName: string, csv: string) {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
