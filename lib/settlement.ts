import { createId, timestamp, type Bet, type Db, type Match } from "@/lib/store";

function settleSplit(stake: number, price: number, result: number) {
  if (result > 0) return Math.round(stake * price);
  if (result === 0) return stake;
  return 0;
}

export function settleBet(bet: Bet, match: Pick<Match, "homeScore" | "awayScore">) {
  const homeScore = Number(match.homeScore);
  const awayScore = Number(match.awayScore);
  const total = homeScore + awayScore;
  const homeWon = homeScore > awayScore;
  const awayWon = awayScore > homeScore;
  let payout = 0;

  if (bet.market === "h2h") {
    const won =
      (bet.selection === "home" && homeWon) ||
      (bet.selection === "away" && awayWon) ||
      (bet.selection === "draw" && homeScore === awayScore);
    payout = won ? bet.possiblePayout : 0;
  }

  if (bet.market === "correct_score") {
    payout = bet.selection === `${homeScore}-${awayScore}` ? bet.possiblePayout : 0;
  }

  if (bet.market === "totals") {
    const line = Number(bet.line);
    const splits = Number.isInteger(line)
      ? [line]
      : Math.abs(line * 100) % 50 === 25
        ? [line - 0.25, line + 0.25]
        : [line];
    payout = splits.reduce((sum, split) => {
      const result =
        bet.selection === "over"
          ? Math.sign(total - split)
          : Math.sign(split - total);
      return sum + settleSplit(bet.stake / splits.length, bet.price, result);
    }, 0);
  }

  if (bet.market === "spreads") {
    const line = Number(bet.line);
    const splits = Number.isInteger(line)
      ? [line]
      : Math.abs(line * 100) % 50 === 25
        ? [line - 0.25, line + 0.25]
        : [line];
    payout = splits.reduce((sum, split) => {
      const adjusted =
        bet.selection === "home"
          ? homeScore + split - awayScore
          : awayScore + split - homeScore;
      return sum + settleSplit(bet.stake / splits.length, bet.price, Math.sign(adjusted));
    }, 0);
  }

  payout = Math.round(payout);
  const profit = payout - bet.stake;
  return {
    payout,
    profit,
    status: profit > 0 ? "won" as const : profit === 0 ? "void" as const : "lost" as const,
  };
}

export function settleMatchBets(db: Db, match: Match) {
  const settledAt = timestamp();
  const settled = [];
  const pendingBets = db.bets.filter((bet) => bet.matchId === match.id && bet.status === "pending");

  for (const bet of pendingBets) {
    const result = settleBet(bet, match);
    bet.status = result.status;
    bet.profit = result.profit;
    bet.settledAt = settledAt;

    const user = db.users.find((item) => item.id === bet.userId);
    if (user && result.payout > 0) {
      user.balance += result.payout;
      db.walletTransactions.push({
        id: createId(),
        userId: user.id,
        betId: bet.id,
        amount: result.payout,
        balance: user.balance,
        type: "bet_settlement",
        note: `${bet.selectionLabel} settlement`,
        createdAt: settledAt,
      });
    }

    settled.push({
      orderNo: bet.orderNo,
      selection: bet.selectionLabel,
      status: bet.status,
      payout: result.payout,
      profit: result.profit,
    });
  }

  return settled;
}
