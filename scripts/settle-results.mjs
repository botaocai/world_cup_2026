import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const dbPath = path.join(dataDir, "db.json");
const envPath = path.join(root, ".env");
const WORLD_CUP_LEAGUE_ID = "1";
const WORLD_CUP_SEASON = "2026";
const RESULT_DELAY_MS = 3 * 60 * 60 * 1000;
const FINAL_STATUSES = new Set(["FT", "AET", "PEN"]);

function loadEnv() {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function readDb() {
  if (!fs.existsSync(dbPath)) {
    throw new Error("data/db.json not found. Start the app or refresh odds once first.");
  }
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function writeDb(db) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeTeam(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\brepublic\b/g, "")
    .replace(/\bunited states\b/g, "usa")
    .replace(/\bkorea republic\b/g, "south korea")
    .replace(/\bbosnia and herzegovina\b/g, "bosnia herzegovina")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function teamsMatch(a, b) {
  return normalizeTeam(a) === normalizeTeam(b);
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

async function fetchFixturesByDate(date) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error("Missing API_FOOTBALL_KEY in .env");
  }

  const url = new URL("https://v3.football.api-sports.io/fixtures");
  url.searchParams.set("league", WORLD_CUP_LEAGUE_ID);
  url.searchParams.set("season", WORLD_CUP_SEASON);
  url.searchParams.set("date", date);

  const response = await fetch(url, {
    headers: { "x-apisports-key": key },
  });

  if (!response.ok) {
    throw new Error(`API-FOOTBALL fixtures failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload.response || [];
}

function findFixture(fixtures, match) {
  return fixtures.find((fixture) => {
    const home = fixture.teams?.home?.name;
    const away = fixture.teams?.away?.name;
    return teamsMatch(home, match.homeTeam) && teamsMatch(away, match.awayTeam);
  });
}

loadEnv();
const db = readDb();
const now = Date.now();
const candidates = db.matches.filter((match) => {
  if (match.status === "finished") return false;
  const hasPendingBets = db.bets.some(
    (bet) => bet.matchId === match.id && bet.status === "pending",
  );
  return hasPendingBets && new Date(match.commenceTime).getTime() + RESULT_DELAY_MS <= now;
});

const fixturesByDate = new Map();
const settled = [];
const skipped = [];
const settledAt = new Date().toISOString();

for (const match of candidates) {
  const date = isoDate(match.commenceTime);
  if (!fixturesByDate.has(date)) {
    fixturesByDate.set(date, await fetchFixturesByDate(date));
  }

  const fixture = findFixture(fixturesByDate.get(date), match);
  if (!fixture) {
    skipped.push({ match: `${match.homeTeam} v ${match.awayTeam}`, reason: "fixture not found" });
    continue;
  }

  const status = fixture.fixture?.status?.short;
  if (!FINAL_STATUSES.has(status)) {
    skipped.push({ match: `${match.homeTeam} v ${match.awayTeam}`, reason: `status ${status}` });
    continue;
  }

  match.externalId = String(fixture.fixture.id);
  match.homeScore = Number(fixture.goals.home);
  match.awayScore = Number(fixture.goals.away);
  match.status = "finished";
  match.lastSyncedAt = settledAt;

  for (const bet of db.bets.filter((item) => item.matchId === match.id && item.status === "pending")) {
    const user = db.users.find((item) => item.id === bet.userId);
    if (!user) continue;

    const result = settleBet(bet, match);
    bet.status = result.status;
    bet.profit = result.profit;
    bet.settledAt = settledAt;

    if (result.payout > 0) {
      user.balance += result.payout;
      db.walletTransactions.push({
        id: crypto.randomUUID(),
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
      label: bet.selectionLabel,
      status: bet.status,
      payout: result.payout,
      profit: result.profit,
    });
  }
}

writeDb(db);

console.log(
  JSON.stringify(
    {
      checkedMatches: candidates.length,
      settledBets: settled.length,
      settled,
      skipped,
    },
    null,
    2,
  ),
);
