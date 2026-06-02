import { NextResponse } from "next/server";
import { createId, readDb, timestamp, writeDb } from "@/lib/store";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const target = Number(process.env.INITIAL_BALANCE || 3000);
  const db = readDb();
  const now = timestamp();
  const changed = [];

  for (const user of db.users) {
    const diff = target - user.balance;
    if (diff === 0) continue;
    user.balance = target;
    db.walletTransactions.push({
      id: createId(),
      userId: user.id,
      amount: diff,
      balance: user.balance,
      type: "admin_reset_balance",
      note: `Reset balance to ${target}`,
      createdAt: now,
    });
    changed.push({ userId: user.id, displayName: user.displayName, amount: diff, balance: user.balance });
  }

  writeDb(db);
  return NextResponse.json({ ok: true, target, changed });
}
