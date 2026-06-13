import { NextResponse } from "next/server";
import { writeDb, type Db } from "@/lib/store";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

function isArray(value: unknown) {
  return Array.isArray(value);
}

function isDb(value: unknown): value is Db {
  const db = value as Db;
  return Boolean(
    db &&
      isArray(db.users) &&
      isArray(db.inviteCodes) &&
      isArray(db.matches) &&
      isArray(db.oddsSnapshots) &&
      isArray(db.outrightOdds) &&
      isArray(db.bets) &&
      isArray(db.walletTransactions),
  );
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const db = await request.json().catch(() => null);
  if (!isDb(db)) {
    return NextResponse.json({ error: "文件不是有效的完整数据库 JSON" }, { status: 400 });
  }

  db.matchIntelligence ||= [];
  db.aiContestAgents ||= [];
  db.aiContestBets ||= [];
  db.aiContestRounds ||= [];
  db.aiContestDiscussions ||= [];
  writeDb(db);
  return NextResponse.json({
    ok: true,
    users: db.users.length,
    bets: db.bets.length,
    matches: db.matches.length,
  });
}
