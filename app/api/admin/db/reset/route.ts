import { NextResponse } from "next/server";
import { readDb, writeDb } from "@/lib/store";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const db = readDb();
  const before = {
    users: db.users.length,
    invites: db.inviteCodes.length,
    bets: db.bets.length,
    transactions: db.walletTransactions.length,
  };

  db.users = [];
  db.inviteCodes = [];
  db.bets = [];
  db.walletTransactions = [];
  db.matches = db.matches.map((match) => {
    const { homeScore, awayScore, lastSyncedAt, ...rest } = match;
    return {
      ...rest,
      status: match.status === "cancelled" ? "cancelled" : "scheduled",
    };
  });

  writeDb(db);
  return NextResponse.json({ ok: true, cleared: before });
}
