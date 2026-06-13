import { NextResponse } from "next/server";
import { z } from "zod";
import { aiContestDashboard, initAiContestAgents, resetAiContest, runAiContestRound } from "@/lib/ai-contest";

export const maxDuration = 300;

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

const schema = z.object({
  action: z.enum(["init", "run", "reset"]),
  windowHours: z.coerce.number().int().min(1).max(72).optional(),
});

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }
  return NextResponse.json(aiContestDashboard());
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  if (parsed.data.action === "reset") return NextResponse.json(resetAiContest());
  if (parsed.data.action === "init") return NextResponse.json(initAiContestAgents());
  return NextResponse.json(await runAiContestRound(parsed.data.windowHours || 24));
}
