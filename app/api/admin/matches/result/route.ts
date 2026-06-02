import { NextResponse } from "next/server";
import { z } from "zod";
import { settleMatchBets } from "@/lib/settlement";
import { readDb, timestamp, writeDb } from "@/lib/store";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

const schema = z.object({
  matchId: z.string().min(1),
  homeScore: z.coerce.number().int().min(0).max(30),
  awayScore: z.coerce.number().int().min(0).max(30),
});

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入完整赛果" }, { status: 400 });
  }

  const db = readDb();
  const match = db.matches.find((item) => item.id === parsed.data.matchId);
  if (!match) {
    return NextResponse.json({ error: "比赛不存在" }, { status: 404 });
  }

  match.homeScore = parsed.data.homeScore;
  match.awayScore = parsed.data.awayScore;
  match.status = "finished";
  match.lastSyncedAt = timestamp();

  const settled = settleMatchBets(db, match);
  const markets = settled.reduce<Record<string, number>>((map, bet) => {
    map[bet.market] = (map[bet.market] || 0) + 1;
    return map;
  }, {});
  writeDb(db);

  return NextResponse.json({
    ok: true,
    match: {
      id: match.id,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      status: match.status,
    },
    settled,
    markets,
  });
}
