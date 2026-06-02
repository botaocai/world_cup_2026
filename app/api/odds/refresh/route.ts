import { NextResponse } from "next/server";
import { refreshMatchOdds, refreshOutrightOdds } from "@/lib/odds";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const matches = await refreshMatchOdds();
  let outrights;
  try {
    outrights = await refreshOutrightOdds();
  } catch (error) {
    outrights = {
      skipped: true,
      reason: error instanceof Error ? error.message : "outrights refresh failed",
    };
  }

  return NextResponse.json({ matches, outrights });
}
