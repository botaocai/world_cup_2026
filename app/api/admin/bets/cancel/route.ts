import { NextResponse } from "next/server";
import { z } from "zod";
import { createId, readDb, timestamp, writeDb } from "@/lib/store";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

const schema = z.object({
  betId: z.string().min(1),
  note: z.string().trim().max(80).optional(),
});

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "订单信息不完整" }, { status: 400 });
  }

  const db = readDb();
  const bet = db.bets.find((item) => item.id === parsed.data.betId);
  if (!bet) {
    return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  }
  if (bet.status !== "pending") {
    return NextResponse.json({ error: "只能取消待结算订单" }, { status: 400 });
  }

  const user = db.users.find((item) => item.id === bet.userId);
  if (!user) {
    return NextResponse.json({ error: "玩家不存在" }, { status: 404 });
  }

  bet.status = "void";
  bet.profit = 0;
  bet.settledAt = timestamp();
  user.balance += bet.stake;
  db.walletTransactions.push({
    id: createId(),
    userId: user.id,
    betId: bet.id,
    amount: bet.stake,
    balance: user.balance,
    type: "admin_cancel_bet",
    note: parsed.data.note || "后台取消订单并退回本金",
    createdAt: timestamp(),
  });

  writeDb(db);
  return NextResponse.json({ ok: true });
}
