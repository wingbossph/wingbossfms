import { NextResponse, type NextRequest } from "next/server";
import { runJob, JOBS } from "@/server/jobs";

// Vercel Cron calls these with "Authorization: Bearer $CRON_SECRET".
export async function GET(request: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { job } = await params;
  if (!(job in JOBS)) return new NextResponse("Unknown job", { status: 404 });
  const result = await runJob(job as keyof typeof JOBS);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
