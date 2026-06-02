function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message}\nexpected: ${e}\nactual:   ${a}`);
  }
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

function bet(overrides) {
  const base = {
    market: "h2h",
    selection: "home",
    stake: 100,
    price: 2,
    possiblePayout: 200,
  };
  return { ...base, ...overrides };
}

const cases = [
  {
    name: "h2h home win",
    bet: bet({ market: "h2h", selection: "home", stake: 100, price: 2.1, possiblePayout: 210 }),
    match: { homeScore: 2, awayScore: 1 },
    expected: { payout: 210, profit: 110, status: "won" },
  },
  {
    name: "h2h draw win",
    bet: bet({ market: "h2h", selection: "draw", stake: 100, price: 3.2, possiblePayout: 320 }),
    match: { homeScore: 1, awayScore: 1 },
    expected: { payout: 320, profit: 220, status: "won" },
  },
  {
    name: "h2h away loss",
    bet: bet({ market: "h2h", selection: "away", stake: 100, price: 2.9, possiblePayout: 290 }),
    match: { homeScore: 1, awayScore: 1 },
    expected: { payout: 0, profit: -100, status: "lost" },
  },
  {
    name: "correct score exact hit",
    bet: bet({ market: "correct_score", selection: "2-0", stake: 50, price: 8, possiblePayout: 400 }),
    match: { homeScore: 2, awayScore: 0 },
    expected: { payout: 400, profit: 350, status: "won" },
  },
  {
    name: "correct score wrong side",
    bet: bet({ market: "correct_score", selection: "0-2", stake: 50, price: 8, possiblePayout: 400 }),
    match: { homeScore: 2, awayScore: 0 },
    expected: { payout: 0, profit: -50, status: "lost" },
  },
  {
    name: "over 2.5 win at 3 goals",
    bet: bet({ market: "totals", selection: "over", line: 2.5, stake: 100, price: 1.9 }),
    match: { homeScore: 2, awayScore: 1 },
    expected: { payout: 190, profit: 90, status: "won" },
  },
  {
    name: "over 2.5 lose at 2 goals",
    bet: bet({ market: "totals", selection: "over", line: 2.5, stake: 100, price: 1.9 }),
    match: { homeScore: 1, awayScore: 1 },
    expected: { payout: 0, profit: -100, status: "lost" },
  },
  {
    name: "under 2.5 win at 2 goals",
    bet: bet({ market: "totals", selection: "under", line: 2.5, stake: 100, price: 1.9 }),
    match: { homeScore: 1, awayScore: 1 },
    expected: { payout: 190, profit: 90, status: "won" },
  },
  {
    name: "under 2.5 lose at 3 goals",
    bet: bet({ market: "totals", selection: "under", line: 2.5, stake: 100, price: 1.9 }),
    match: { homeScore: 2, awayScore: 1 },
    expected: { payout: 0, profit: -100, status: "lost" },
  },
  {
    name: "over 3 push at 3 goals",
    bet: bet({ market: "totals", selection: "over", line: 3, stake: 100, price: 1.9 }),
    match: { homeScore: 2, awayScore: 1 },
    expected: { payout: 100, profit: 0, status: "void" },
  },
  {
    name: "under 3 push at 3 goals",
    bet: bet({ market: "totals", selection: "under", line: 3, stake: 100, price: 1.9 }),
    match: { homeScore: 2, awayScore: 1 },
    expected: { payout: 100, profit: 0, status: "void" },
  },
  {
    name: "over 2.25 half win at 3 goals",
    bet: bet({ market: "totals", selection: "over", line: 2.25, stake: 100, price: 2 }),
    match: { homeScore: 2, awayScore: 1 },
    expected: { payout: 200, profit: 100, status: "won" },
  },
  {
    name: "over 2.25 half loss at 2 goals",
    bet: bet({ market: "totals", selection: "over", line: 2.25, stake: 100, price: 2 }),
    match: { homeScore: 1, awayScore: 1 },
    expected: { payout: 50, profit: -50, status: "lost" },
  },
  {
    name: "under 2.25 half win at 2 goals",
    bet: bet({ market: "totals", selection: "under", line: 2.25, stake: 100, price: 2 }),
    match: { homeScore: 1, awayScore: 1 },
    expected: { payout: 150, profit: 50, status: "won" },
  },
  {
    name: "under 2.25 full loss at 3 goals",
    bet: bet({ market: "totals", selection: "under", line: 2.25, stake: 100, price: 2 }),
    match: { homeScore: 2, awayScore: 1 },
    expected: { payout: 0, profit: -100, status: "lost" },
  },
  {
    name: "over 2.75 half win at 3 goals",
    bet: bet({ market: "totals", selection: "over", line: 2.75, stake: 100, price: 2 }),
    match: { homeScore: 2, awayScore: 1 },
    expected: { payout: 150, profit: 50, status: "won" },
  },
  {
    name: "under 2.75 half loss at 3 goals",
    bet: bet({ market: "totals", selection: "under", line: 2.75, stake: 100, price: 2 }),
    match: { homeScore: 2, awayScore: 1 },
    expected: { payout: 50, profit: -50, status: "lost" },
  },
  {
    name: "home -0.5 win",
    bet: bet({ market: "spreads", selection: "home", line: -0.5, stake: 100, price: 1.8 }),
    match: { homeScore: 1, awayScore: 0 },
    expected: { payout: 180, profit: 80, status: "won" },
  },
  {
    name: "home -0.5 draw loss",
    bet: bet({ market: "spreads", selection: "home", line: -0.5, stake: 100, price: 1.8 }),
    match: { homeScore: 1, awayScore: 1 },
    expected: { payout: 0, profit: -100, status: "lost" },
  },
  {
    name: "away +0.5 draw win",
    bet: bet({ market: "spreads", selection: "away", line: 0.5, stake: 100, price: 1.8 }),
    match: { homeScore: 1, awayScore: 1 },
    expected: { payout: 180, profit: 80, status: "won" },
  },
  {
    name: "home -1 push by one",
    bet: bet({ market: "spreads", selection: "home", line: -1, stake: 100, price: 1.9 }),
    match: { homeScore: 1, awayScore: 0 },
    expected: { payout: 100, profit: 0, status: "void" },
  },
  {
    name: "away +1 push loses by one",
    bet: bet({ market: "spreads", selection: "away", line: 1, stake: 100, price: 1.9 }),
    match: { homeScore: 1, awayScore: 0 },
    expected: { payout: 100, profit: 0, status: "void" },
  },
  {
    name: "home -1.25 half loss by one",
    bet: bet({ market: "spreads", selection: "home", line: -1.25, stake: 100, price: 2 }),
    match: { homeScore: 1, awayScore: 0 },
    expected: { payout: 50, profit: -50, status: "lost" },
  },
  {
    name: "home -1.25 full win by two",
    bet: bet({ market: "spreads", selection: "home", line: -1.25, stake: 100, price: 2 }),
    match: { homeScore: 2, awayScore: 0 },
    expected: { payout: 200, profit: 100, status: "won" },
  },
  {
    name: "away +1.25 half win loses by one",
    bet: bet({ market: "spreads", selection: "away", line: 1.25, stake: 100, price: 2 }),
    match: { homeScore: 1, awayScore: 0 },
    expected: { payout: 150, profit: 50, status: "won" },
  },
  {
    name: "away +1.25 full loss loses by two",
    bet: bet({ market: "spreads", selection: "away", line: 1.25, stake: 100, price: 2 }),
    match: { homeScore: 2, awayScore: 0 },
    expected: { payout: 0, profit: -100, status: "lost" },
  },
  {
    name: "home -1.75 half win by two",
    bet: bet({ market: "spreads", selection: "home", line: -1.75, stake: 100, price: 2 }),
    match: { homeScore: 2, awayScore: 0 },
    expected: { payout: 150, profit: 50, status: "won" },
  },
  {
    name: "away +1.75 half loss loses by two",
    bet: bet({ market: "spreads", selection: "away", line: 1.75, stake: 100, price: 2 }),
    match: { homeScore: 2, awayScore: 0 },
    expected: { payout: 50, profit: -50, status: "lost" },
  },
  {
    name: "rounding payout",
    bet: bet({ market: "totals", selection: "over", line: 2.5, stake: 333, price: 1.87 }),
    match: { homeScore: 2, awayScore: 1 },
    expected: { payout: 623, profit: 290, status: "won" },
  },
];

for (const item of cases) {
  assertEqual(settleBet(item.bet, item.match), item.expected, item.name);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checked: cases.length,
      markets: ["h2h", "correct_score", "totals", "spreads"],
      cases: cases.map((item) => item.name),
    },
    null,
    2,
  ),
);
