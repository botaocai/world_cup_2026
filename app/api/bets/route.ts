import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { createId, readDb, timestamp, writeDb } from "@/lib/store";
import { teamZh } from "@/lib/teams";

const schema = z.object({
  kind: z.enum(["match", "outright"]),
  oddsId: z.string(),
  stake: z.coerce.number().int().min(1).max(3000),
});

const BET_CUTOFF_MS = 60 * 1000;

function orderNo() {
  return `OU${Date.now()}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please login first" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bet request" }, { status: 400 });
  }

  const { kind, oddsId, stake } = parsed.data;
  const db = readDb();
  const freshUser = db.users.find((item) => item.id === user.id);
  if (!freshUser || freshUser.balance < stake) {
    return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
  }

  if (kind === "match") {
    const odds = db.oddsSnapshots.find((item) => item.id === oddsId);
    const match = odds ? db.matches.find((item) => item.id === odds.matchId) : null;
    if (!odds || !match) {
      return NextResponse.json({ error: "Odds not found" }, { status: 404 });
    }

    const cutoffTime = new Date(match.commenceTime).getTime() - BET_CUTOFF_MS;
    if (Date.now() >= cutoffTime) {
      return NextResponse.json({ error: "比赛开赛前 1 分钟停止下注" }, { status: 400 });
    }

    const payout = Math.round(stake * odds.price);
    const bet = {
      id: createId(),
      orderNo: orderNo(),
      userId: user.id,
      type: "match" as const,
      matchId: odds.matchId,
      oddsSnapshotId: odds.id,
      market: odds.market,
      selection: odds.selection,
      selectionLabel: `${teamZh(match.homeTeam)} v ${teamZh(match.awayTeam)} - ${odds.label}`,
      line: odds.line,
      price: odds.price,
      stake,
      possiblePayout: payout,
      status: "pending" as const,
      profit: 0,
      createdAt: timestamp(),
    };

    freshUser.balance -= stake;
    db.bets.push(bet);
    db.walletTransactions.push({
      id: createId(),
      userId: user.id,
      betId: bet.id,
      amount: -stake,
      balance: freshUser.balance,
      type: "bet_stake",
      note: bet.selectionLabel,
      createdAt: timestamp(),
    });
    writeDb(db);

    return NextResponse.json({ bet });
  }

  const odds = db.outrightOdds.find((item) => item.id === oddsId);
  if (!odds) {
    return NextResponse.json({ error: "Odds not found" }, { status: 404 });
  }

  const payout = Math.round(stake * odds.price);
  const bet = {
    id: createId(),
    orderNo: orderNo(),
    userId: user.id,
    type: "outright" as const,
    outrightOddsId: odds.id,
    market: "outrights",
    selection: odds.teamName,
    selectionLabel: `${odds.teamName} 冠军`,
    price: odds.price,
    stake,
    possiblePayout: payout,
    status: "pending" as const,
    profit: 0,
    createdAt: timestamp(),
  };

  freshUser.balance -= stake;
  db.bets.push(bet);
  db.walletTransactions.push({
    id: createId(),
    userId: user.id,
    betId: bet.id,
    amount: -stake,
    balance: freshUser.balance,
    type: "bet_stake",
    note: bet.selectionLabel,
    createdAt: timestamp(),
  });
  writeDb(db);

  return NextResponse.json({ bet });
}
