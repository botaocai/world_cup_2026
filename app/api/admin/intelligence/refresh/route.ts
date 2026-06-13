import { NextResponse } from "next/server";
import {
  generateMatchIntelligence,
  refreshDueMatchIntelligence,
  refreshUpcomingMatchIntelligence,
} from "@/lib/match-intelligence";

export const maxDuration = 300;

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const hoursParam = Number(url.searchParams.get("hours") || 24);
  const hours = Number.isFinite(hoursParam) ? hoursParam : 24;
  const body = await request.json().catch(() => ({}));
  const matchIds = Array.isArray(body.matchIds)
    ? body.matchIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
    : [];

  if (matchIds.length) {
    const results = [];
    for (const matchId of matchIds) {
      results.push(await generateMatchIntelligence(matchId, true));
    }
    return NextResponse.json({
      triggerWindowHours: Number(process.env.AI_INTEL_TRIGGER_HOURS || 12),
      dueMatches: matchIds.length,
      generated: results.filter((item) => !item.skipped && !item.failed).length,
      failed: results.filter((item) => item.failed).length,
      results,
    });
  }

  const result = force
    ? await refreshUpcomingMatchIntelligence(hours)
    : await refreshDueMatchIntelligence(false);
  return NextResponse.json(result);
}
