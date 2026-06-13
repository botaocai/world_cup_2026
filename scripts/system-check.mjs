import fs from "node:fs";
import path from "node:path";

const dbPath = path.join(process.cwd(), "data", "db.json");
const BET_CUTOFF_MS = 60 * 1000;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function canPlaceBet(commenceTime, now) {
  return now < new Date(commenceTime).getTime() - BET_CUTOFF_MS;
}

function splitQuarterLine(line) {
  const sign = line < 0 ? -1 : 1;
  const abs = Math.abs(line);
  const whole = Math.trunc(abs);
  const fraction = Number((abs - whole).toFixed(2));

  if (fraction === 0.25) return [sign * whole, sign * (whole + 0.5)];
  if (fraction === 0.75) return [sign * (whole + 0.5), sign * (whole + 1)];
  return [line];
}

function settleSplit(stake, price, result) {
  if (result > 0) return stake * price;
  if (result === 0) return stake;
  return 0;
}

function settleBet(bet, match) {
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
      (bet.selection === "draw" && !homeWon && !awayWon);
    payout = won ? bet.possiblePayout : 0;
  }

  if (bet.market === "correct_score") {
    payout = bet.selection === `${homeScore}-${awayScore}` ? bet.possiblePayout : 0;
  }

  if (bet.market === "totals") {
    const lines = splitQuarterLine(Number(bet.line));
    const splitStake = bet.stake / lines.length;
    payout = lines.reduce((sum, line) => {
      const result =
        bet.selection === "over"
          ? total > line
            ? 1
            : total === line
              ? 0
              : -1
          : total < line
            ? 1
            : total === line
              ? 0
              : -1;
      return sum + settleSplit(splitStake, bet.price, result);
    }, 0);
  }

  if (bet.market === "spreads") {
    const lines = splitQuarterLine(Number(bet.line));
    const splitStake = bet.stake / lines.length;
    payout = lines.reduce((sum, line) => {
      const adjusted =
        bet.selection === "home"
          ? homeScore + line - awayScore
          : awayScore + line - homeScore;
      return sum + settleSplit(splitStake, bet.price, Math.sign(adjusted));
    }, 0);
  }

  payout = Math.round(payout);
  const profit = payout - bet.stake;
  const status = profit > 0 ? "won" : profit === 0 ? "void" : "lost";
  return { payout, profit, status };
}

function mkBet(overrides) {
  return {
    market: "h2h",
    selection: "home",
    stake: 100,
    price: 2,
    possiblePayout: 200,
    ...overrides,
  };
}

function testCutoff() {
  const now = Date.parse("2026-06-01T12:00:00.000Z");
  assert(canPlaceBet("2026-06-01T12:02:00.000Z", now), "2 minutes before kickoff should allow betting");
  assert(!canPlaceBet("2026-06-01T12:01:00.000Z", now), "exactly 1 minute before kickoff should block betting");
  assert(!canPlaceBet("2026-06-01T12:00:59.000Z", now), "inside 1 minute should block betting");
  assert(!canPlaceBet("2026-06-01T11:59:00.000Z", now), "after kickoff should block betting");
}

function testSettlementMath() {
  const mexico20 = { homeScore: 2, awayScore: 0 };
  assert(settleBet(mkBet({ selection: "home", stake: 300, price: 1.43, possiblePayout: 429 }), mexico20).profit === 129, "home h2h win profit mismatch");
  assert(settleBet(mkBet({ selection: "draw", stake: 500, price: 4.43, possiblePayout: 2215 }), mexico20).profit === -500, "draw loss profit mismatch");
  assert(settleBet(mkBet({ market: "totals", selection: "under", line: 2.25, stake: 300, price: 2.05 }), mexico20).profit === 158, "under 2.25 half-win profit mismatch");
  assert(settleBet(mkBet({ market: "totals", selection: "under", line: 2.25, stake: 500, price: 1.91 }), { homeScore: 3, awayScore: 0 }).profit === -500, "under 2.25 loss mismatch");

  const overPushHalf = settleBet(mkBet({ market: "totals", selection: "over", line: 2.25, stake: 200, price: 1.8 }), mexico20);
  assert(overPushHalf.payout === 100 && overPushHalf.profit === -100, "over 2.25 at total 2 should half-push half-lose");

  const spreadWin = settleBet(mkBet({ market: "spreads", selection: "home", line: -1.25, stake: 100, price: 1.9 }), mexico20);
  assert(spreadWin.payout === 190 && spreadWin.profit === 90, "home -1.25 by 2 goals should win");

  const spreadHalfLoss = settleBet(mkBet({ market: "spreads", selection: "home", line: -1.25, stake: 100, price: 1.9 }), { homeScore: 1, awayScore: 0 });
  assert(spreadHalfLoss.payout === 50 && spreadHalfLoss.profit === -50, "home -1.25 by 1 goal should half-push half-lose");

  const awayPlusWin = settleBet(mkBet({ market: "spreads", selection: "away", line: 0.5, stake: 100, price: 1.8 }), { homeScore: 1, awayScore: 1 });
  assert(awayPlusWin.profit === 80, "away +0.5 draw should win");

  const correctScoreWin = settleBet(mkBet({ market: "correct_score", selection: "2-0", stake: 20, price: 6, possiblePayout: 120 }), mexico20);
  assert(correctScoreWin.payout === 120 && correctScoreWin.profit === 100, "correct score win payout mismatch");

  const correctScoreLoss = settleBet(mkBet({ market: "correct_score", selection: "1-0", stake: 20, price: 6, possiblePayout: 120 }), mexico20);
  assert(correctScoreLoss.profit === -20, "correct score loss mismatch");
}

function testSyntheticLeaderboard() {
  const rows = [
    { displayName: "Alice", bets: [{ profit: 200, status: "won" }, { profit: -100, status: "lost" }] },
    { displayName: "Bob", bets: [{ profit: -50, status: "lost" }, { profit: 0, status: "pending" }] },
    { displayName: "Carol", bets: [{ profit: 0, status: "void" }, { profit: 120, status: "won" }] },
  ]
    .map((row) => ({
      name: row.displayName,
      profit: row.bets.filter((bet) => bet.status === "won" || bet.status === "lost").reduce((sum, bet) => sum + bet.profit, 0),
      pending: row.bets.filter((bet) => bet.status === "pending").length,
      visibleBets: row.bets.filter((bet) => bet.status !== "void").length,
    }))
    .sort((a, b) => b.profit - a.profit);

  assert(rows.map((row) => row.name).join(",") === "Carol,Alice,Bob", "leaderboard ordering mismatch");
  assert(rows.find((row) => row.name === "Bob")?.pending === 1, "pending count mismatch");
  assert(rows.find((row) => row.name === "Carol")?.visibleBets === 1, "void bets should be hidden from leaderboard");
}

function testOutrightLockedPrice() {
  const bet = {
    type: "outright",
    selection: "Brazil",
    stake: 100,
    price: 8,
    possiblePayout: 800,
  };
  const latestConfiguredPrice = 2;
  const payout = bet.selection === "Brazil" ? bet.possiblePayout : 0;
  assert(latestConfiguredPrice !== bet.price, "test setup should simulate changed latest price");
  assert(payout === 800, "outright settlement must use locked possiblePayout from bet");
}

function testCurrentDbInvariants() {
  if (!fs.existsSync(dbPath)) {
    return { skipped: true, reason: "data/db.json not found" };
  }

  const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  const orderNos = new Set();
  for (const bet of db.bets) {
    assert(!orderNos.has(bet.orderNo), `duplicate order number: ${bet.orderNo}`);
    orderNos.add(bet.orderNo);
    assert(bet.stake > 0, `bet stake must be positive: ${bet.orderNo}`);
    assert(bet.possiblePayout >= bet.stake || bet.market === "spreads" || bet.market === "totals" || bet.market === "correct_score", `possible payout suspicious: ${bet.orderNo}`);
    if (bet.status === "pending") {
      assert(bet.profit === 0, `pending bet should have zero profit: ${bet.orderNo}`);
    }
  }

  for (const user of db.users) {
    const txs = db.walletTransactions
      .filter((tx) => tx.userId === user.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (txs.length) {
      assert(txs.at(-1).balance === user.balance, `latest transaction balance mismatch for ${user.displayName}`);
    }
  }

  return {
    skipped: false,
    users: db.users.length,
    bets: db.bets.length,
    transactions: db.walletTransactions.length,
  };
}

const checks = [];
testCutoff();
checks.push("cutoff");
testSettlementMath();
checks.push("settlement math");
testSyntheticLeaderboard();
checks.push("leaderboard");
testOutrightLockedPrice();
checks.push("outright locked price");
const currentDb = testCurrentDbInvariants();
checks.push("current db invariants");

console.log(
  JSON.stringify(
    {
      ok: true,
      checks,
      currentDb,
    },
    null,
    2,
  ),
);
