import { NextResponse } from "next/server";
import { z } from "zod";
import { createId, readDb, timestamp, writeDb } from "@/lib/store";
import { teamZh } from "@/lib/teams";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

const schema = z.object({
  champion: z.string().trim().min(1).max(40),
});

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入冠军队名" }, { status: 400 });
  }

  const champion = teamZh(parsed.data.champion);
  const db = readDb();
  const settledAt = timestamp();
  const settled = [];

  for (const bet of db.bets.filter(
    (item) => item.type === "outright" && item.status === "pending",
  )) {
    const user = db.users.find((item) => item.id === bet.userId);
    if (!user) continue;

    const won = bet.selection === champion;
    const payout = won ? bet.possiblePayout : 0;
    bet.status = won ? "won" : "lost";
    bet.profit = payout - bet.stake;
    bet.settledAt = settledAt;

    if (payout > 0) {
      user.balance += payout;
      db.walletTransactions.push({
        id: createId(),
        userId: user.id,
        betId: bet.id,
        amount: payout,
        balance: user.balance,
        type: "outright_settlement",
        note: `${bet.selectionLabel} settlement`,
        createdAt: settledAt,
      });
    }

    settled.push({
      orderNo: bet.orderNo,
      selection: bet.selection,
      lockedPrice: bet.price,
      stake: bet.stake,
      payout,
      profit: bet.profit,
      status: bet.status,
    });
  }

  writeDb(db);
  return NextResponse.json({ ok: true, champion, settled });
}
