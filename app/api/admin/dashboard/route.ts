import { NextResponse } from "next/server";
import { readDb } from "@/lib/store";
import { teamZh } from "@/lib/teams";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const db = readDb();
  const users = db.users
    .map((user) => {
      const bets = db.bets.filter((bet) => bet.userId === user.id);
      const settled = bets.filter((bet) => bet.status !== "pending");
      const pending = bets.filter((bet) => bet.status === "pending");
      const invite = db.inviteCodes.find((item) => item.id === user.inviteCodeId);
      return {
        id: user.id,
        displayName: user.displayName,
        balance: user.balance,
        inviteCode: invite?.code || "",
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        totalBets: bets.length,
        pendingBets: pending.length,
        settledBets: settled.length,
        totalStake: bets.reduce((sum, bet) => sum + bet.stake, 0),
        netProfit: settled.reduce((sum, bet) => sum + bet.profit, 0),
      };
    })
    .sort((a, b) => b.netProfit - a.netProfit || b.balance - a.balance);

  const bets = db.bets
    .map((bet) => {
      const user = db.users.find((item) => item.id === bet.userId);
      const match = bet.matchId ? db.matches.find((item) => item.id === bet.matchId) : null;
      return {
        ...bet,
        userName: user?.displayName || "未知玩家",
        matchTitle: match ? `${teamZh(match.homeTeam)} v ${teamZh(match.awayTeam)}` : bet.selection,
        matchStatus: match?.status || "",
        score:
          match?.homeScore !== undefined && match?.awayScore !== undefined
            ? `${match.homeScore}:${match.awayScore}`
            : "",
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const transactions = db.walletTransactions
    .map((transaction) => {
      const user = db.users.find((item) => item.id === transaction.userId);
      const bet = transaction.betId ? db.bets.find((item) => item.id === transaction.betId) : null;
      return {
        ...transaction,
        userName: user?.displayName || "未知玩家",
        orderNo: bet?.orderNo || "",
        betLabel: bet?.selectionLabel || "",
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const invites = db.inviteCodes
    .map((invite) => ({
      ...invite,
      user: db.users.find((user) => user.inviteCodeId === invite.id) || null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const outrights = db.outrightOdds
    .map((odd) => ({
      ...odd,
      pendingBets: db.bets.filter(
        (bet) => bet.outrightOddsId === odd.id && bet.status === "pending",
      ).length,
    }))
    .sort((a, b) => a.price - b.price);

  const matches = db.matches
    .map((match) => ({
      ...match,
      homeTeamZh: teamZh(match.homeTeam),
      awayTeamZh: teamZh(match.awayTeam),
      pendingBets: db.bets.filter((bet) => bet.matchId === match.id && bet.status === "pending").length,
      totalBets: db.bets.filter((bet) => bet.matchId === match.id).length,
    }))
    .sort((a, b) => a.commenceTime.localeCompare(b.commenceTime));

  const summary = {
    users: db.users.length,
    totalBalance: db.users.reduce((sum, user) => sum + user.balance, 0),
    bets: db.bets.length,
    pendingBets: db.bets.filter((bet) => bet.status === "pending").length,
    settledBets: db.bets.filter((bet) => bet.status !== "pending").length,
    netProfit: db.bets
      .filter((bet) => bet.status !== "pending")
      .reduce((sum, bet) => sum + bet.profit, 0),
    invites: db.inviteCodes.length,
    unusedInvites: db.inviteCodes.filter((invite) => invite.status === "unused").length,
  };

  return NextResponse.json({ summary, users, bets, transactions, invites, outrights, matches });
}
