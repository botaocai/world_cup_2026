import { NextResponse } from "next/server";
import { readDb } from "@/lib/store";
import { teamZh } from "@/lib/teams";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  const expected = process.env.ADMIN_PASSWORD || "admin";
  return Boolean(password && password === expected);
}

function csvCell(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(headers: string[], rows: Array<Array<unknown>>) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function download(body: string, filename: string, contentType = "text/csv; charset=utf-8") {
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function playerSummaryRows() {
  const db = readDb();
  return db.users
    .map((user) => {
      const invite = db.inviteCodes.find((item) => item.id === user.inviteCodeId);
      const bets = db.bets.filter((bet) => bet.userId === user.id);
      const settled = bets.filter((bet) => bet.status !== "pending");
      const pending = bets.filter((bet) => bet.status === "pending");
      const stake = bets.reduce((sum, bet) => sum + bet.stake, 0);
      const profit = settled.reduce((sum, bet) => sum + bet.profit, 0);
      const pendingStake = pending.reduce((sum, bet) => sum + bet.stake, 0);
      return [
        user.displayName,
        invite?.code || "",
        user.balance,
        bets.length,
        pending.length,
        settled.length,
        stake,
        pendingStake,
        profit,
        user.createdAt,
        user.lastLoginAt,
      ];
    })
    .sort((a, b) => Number(b[8]) - Number(a[8]));
}

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const db = readDb();
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "summary";

  if (type === "json") {
    return download(JSON.stringify(db, null, 2), "worldcup-db.json", "application/json; charset=utf-8");
  }

  if (type === "players") {
    return download(
      csv(
        ["玩家", "邀请码", "余额", "总下注", "待结算", "已结算", "总投注额", "待结算本金", "已结算盈亏", "创建时间", "最后登录"],
        playerSummaryRows(),
      ),
      "worldcup-player-summary.csv",
    );
  }

  if (type === "bets") {
    const rows = db.bets
      .map((bet) => {
        const user = db.users.find((item) => item.id === bet.userId);
        const match = bet.matchId ? db.matches.find((item) => item.id === bet.matchId) : null;
        return [
          bet.orderNo,
          user?.displayName || "",
          bet.type,
          match ? `${teamZh(match.homeTeam)} vs ${teamZh(match.awayTeam)}` : "",
          match?.homeScore !== undefined && match?.awayScore !== undefined ? `${match.homeScore}:${match.awayScore}` : "",
          bet.market,
          bet.selectionLabel,
          bet.price,
          bet.stake,
          bet.possiblePayout,
          bet.status,
          bet.profit,
          bet.createdAt,
          bet.settledAt || "",
        ];
      })
      .sort((a, b) => String(b[12]).localeCompare(String(a[12])));
    return download(
      csv(["订单号", "玩家", "类型", "比赛", "比分", "玩法", "投注项", "赔率", "本金", "可赢", "状态", "盈亏", "下注时间", "结算时间"], rows),
      "worldcup-bets.csv",
    );
  }

  if (type === "transactions") {
    const rows = db.walletTransactions
      .map((tx) => {
        const user = db.users.find((item) => item.id === tx.userId);
        const bet = tx.betId ? db.bets.find((item) => item.id === tx.betId) : null;
        return [
          tx.createdAt,
          user?.displayName || "",
          tx.type,
          bet?.orderNo || "",
          tx.amount,
          tx.balance,
          tx.note || "",
        ];
      })
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    return download(csv(["时间", "玩家", "类型", "订单号", "变动", "余额", "备注"], rows), "worldcup-transactions.csv");
  }

  return NextResponse.json({
    exports: [
      { type: "players", path: "/api/admin/export?type=players" },
      { type: "bets", path: "/api/admin/export?type=bets" },
      { type: "transactions", path: "/api/admin/export?type=transactions" },
      { type: "json", path: "/api/admin/export?type=json" },
    ],
  });
}
