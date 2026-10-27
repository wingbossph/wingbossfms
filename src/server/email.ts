import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type Email = { to: string[]; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] };

/**
 * Sends through Resend (RESEND_API_KEY, EMAIL_FROM). Without a key — local
 * development — the message is written to .uploads/outbox instead.
 */
export async function sendEmail(email: Email): Promise<{ sent: boolean; id?: string; file?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    const dir = path.join(process.cwd(), ".uploads", "outbox");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${email.subject.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.html`);
    await writeFile(file, `<!-- to: ${email.to.join(", ")} | attachments: ${(email.attachments ?? []).map((a) => a.filename).join(", ")} -->\n${email.html}`);
    return { sent: false, file };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Wingboss <reports@resend.dev>",
      to: email.to,
      subject: email.subject,
      html: email.html,
      attachments: (email.attachments ?? []).map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
    }),
  });
  if (!res.ok) throw new Error(`Email failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { id?: string };
  return { sent: true, id: body.id };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Minimal, mail-client-safe HTML: a heading, a few figures, a link. */
export function emailHtml(title: string, lines: [string, string][], footer: { text: string; href?: string }) {
  const rows = lines.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${esc(k)}</td><td style="padding:4px 0;font-weight:bold;text-align:right">${esc(v)}</td></tr>`).join("");
  return `<div style="font-family:Helvetica,Arial,sans-serif;color:#000;max-width:560px"><p style="letter-spacing:2px;font-weight:bold;margin:0">WINGBOSS</p><h1 style="font-size:20px;margin:4px 0 16px">${esc(title)}</h1><table style="border-collapse:collapse;font-size:14px">${rows}</table><p style="font-size:13px;margin-top:20px">${footer.href ? `<a href="${esc(footer.href)}">${esc(footer.text)}</a>` : esc(footer.text)}</p></div>`;
}
