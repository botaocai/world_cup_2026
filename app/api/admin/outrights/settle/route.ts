import { NextResponse } from "next/server";
import { z } from "zod";
import { createId, readDb, timestamp, writeDb } from "@/lib/store";
import { teamZh } from "@/lib/teams";
import { settleAiContestOutrights } from "@/lib/ai-contest";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

const schema = z.object({
  mode: z.enum(["champion", "eliminated"]).default("champion"),
  champion: z.string().trim().min(1).max(40).optional(),
  outrightId: z.string().trim().min(1).optional(),
});

function settleLostOutrightBet(bet: { status: "pending" | "won" | "lost" | "void"; profit: number; stake: number; settledAt?: string }, settledAt: string) {
  bet.status = "lost";
  bet.profit = -bet.stake;
  bet.settledAt = settledAt;
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入冠军队名" }, { status: 400 });
  }

  const db = readDb();
  const settledAt = timestamp();
  const settled = [];

  if (parsed.data.mode === "eliminated") {
    if (!parsed.data.outrightId) {
      return NextResponse.json({ error: "请选择要淘汰结算的球队" }, { status: 400 });
    }

    const odd = db.outrightOdds.find((item) => item.id === parsed.data.outrightId);
    if (!odd) {
      return NextResponse.json({ error: "未找到这条冠军赔率" }, { status: 404 });
    }

    const eliminatedTeam = teamZh(odd.teamName);
    for (const bet of db.bets.filter(
      (item) =>
        item.type === "outright" &&
        item.status === "pending" &&
        (item.outrightOddsId === odd.id || teamZh(item.selection) === eliminatedTeam),
    )) {
      settleLostOutrightBet(bet, settledAt);
      settled.push({
        orderNo: bet.orderNo,
        selection: bet.selection,
        lockedPrice: bet.price,
        stake: bet.stake,
        payout: 0,
        profit: bet.profit,
        status: bet.status,
      });
    }

    writeDb(db);
    return NextResponse.json({ ok: true, mode: "eliminated", team: eliminatedTeam, settled });
  }

  if (!parsed.data.champion) {
    return NextResponse.json({ error: "请输入冠军队名" }, { status: 400 });
  }

  const champion = teamZh(parsed.data.champion);

  for (const bet of db.bets.filter(
    (item) => item.type === "outright" && item.status === "pending",
  )) {
    const user = db.users.find((item) => item.id === bet.userId);
    if (!user) continue;

    const won = bet.selection === champion;
    const payout = won ? bet.possiblePayout : 0;
    if (won) {
      bet.status = "won";
      bet.profit = payout - bet.stake;
      bet.settledAt = settledAt;
    } else {
      settleLostOutrightBet(bet, settledAt);
    }

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

  const aiSettled = settleAiContestOutrights(db, champion);

  writeDb(db);
  return NextResponse.json({ ok: true, champion, settled, aiSettled });
}
