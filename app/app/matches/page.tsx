import { MatchMarkets } from "@/components/MatchMarkets";
import { MatchSupporters } from "@/components/MatchSupporters";
import { formatDateTime } from "@/lib/format";
import { readDb, type Bet, type Db } from "@/lib/store";
import { teamZh } from "@/lib/teams";

type PageOdd = {
  id: string;
  market: string;
  selection: string;
  label: string;
  line?: number;
  price: number;
  fetchedAt: Date;
  sourcePayload?: string;
};

const BET_CUTOFF_MS = 60 * 1000;

function latestByMarket(odds: PageOdd[]) {
  const map = new Map<string, PageOdd>();
  for (const odd of odds) {
    const key = `${odd.market}-${odd.selection}-${odd.line ?? "none"}`;
    const current = map.get(key);
    if (!current || current.fetchedAt < odd.fetchedAt) {
      map.set(key, odd);
    }
  }
  return Array.from(map.values());
}

function isAltMarket(odd: PageOdd) {
  if (!odd.sourcePayload) return false;
  try {
    const payload = JSON.parse(odd.sourcePayload);
    return String(payload.marketName || "").toLowerCase().includes("alternative");
  } catch {
    return false;
  }
}

function marketOrder(odds: PageOdd[], selections: string[]) {
  return odds.sort((a, b) => selections.indexOf(a.selection) - selections.indexOf(b.selection));
}

function betLean(bet: Bet) {
  if (bet.market === "h2h") {
    if (bet.selection === "home") return -1;
    if (bet.selection === "away") return 1;
    return 0;
  }

  if (bet.market === "spreads") {
    if (bet.selection === "home") return -0.85;
    if (bet.selection === "away") return 0.85;
    return 0;
  }

  if (bet.market === "correct_score") {
    const score = bet.selection.match(/^(\d+)-(\d+)$/);
    if (!score) return 0;
    const home = Number(score[1]);
    const away = Number(score[2]);
    if (home > away) return -1;
    if (away > home) return 1;
    return 0;
  }

  return 0;
}

function supporterSummary(bets: Bet[]) {
  return bets
    .slice(0, 2)
    .map((bet) => `${bet.selectionLabel.split(" - ").at(-1) || bet.selection} ${bet.stake}分`)
    .join("；");
}

function matchSupporters(db: Db, matchId: string) {
  const rows = db.users
    .map((user) => {
      const bets = db.bets.filter(
        (bet) => bet.userId === user.id && bet.matchId === matchId && bet.status === "pending",
      );
      if (!bets.length) return null;
      const totalStake = bets.reduce((sum, bet) => sum + bet.stake, 0);
      const netStake = bets.reduce((sum, bet) => sum + betLean(bet) * bet.stake, 0);
      return {
        id: user.id,
        name: user.displayName,
        stake: totalStake,
        netStake,
        lean: 0,
        betCount: bets.length,
        summary: supporterSummary(bets),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.stake - a.stake);

  const maxNetStake = Math.max(...rows.map((item) => Math.abs(item.netStake)), 1);
  return rows.map((item) => ({
    ...item,
    lean: item.netStake / maxNetStake,
  }));
}

export default async function MatchesPage() {
  const db = readDb();
  const now = Date.now();
  const matches = db.matches
    .filter((match) => {
      if (match.status !== "scheduled") return false;
      return new Date(match.commenceTime).getTime() - BET_CUTOFF_MS > now;
    })
    .sort((a, b) => a.commenceTime.localeCompare(b.commenceTime))
    .map((match) => ({
      ...match,
      oddsSnapshots: db.oddsSnapshots
        .filter((odd) => odd.matchId === match.id)
        .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt)),
    }));

  return (
    <main className="content match-content">
      <div className="section-label">赛事</div>
      {matches.map((match) => {
        const odds = latestByMarket(
          match.oddsSnapshots.map((odd) => ({ ...odd, fetchedAt: new Date(odd.fetchedAt) })),
        );
        const spreads = marketOrder(
          odds.filter((odd) => odd.market === "spreads" && !isAltMarket(odd)),
          ["home", "away"],
        );
        const totals = marketOrder(
          odds.filter((odd) => odd.market === "totals" && !isAltMarket(odd)),
          ["over", "under"],
        );
        const extraSpreads = odds.filter((odd) => odd.market === "spreads" && isAltMarket(odd));
        const extraTotals = odds.filter((odd) => odd.market === "totals" && isAltMarket(odd));
        const h2h = marketOrder(
          odds.filter((odd) => odd.market === "h2h"),
          ["home", "draw", "away"],
        );
        const correctScores = odds.filter((odd) => odd.market === "correct_score");
        const matchTitle = `${teamZh(match.homeTeam)} v ${teamZh(match.awayTeam)}`;
        const intel = db.matchIntelligence
          .filter((item) => item.matchId === match.id)
          .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
        const supporters = matchSupporters(db, match.id);

        return (
          <section className="match-card" key={match.id}>
            <div className="match-head">
              <span>{match.groupName || "世界杯2026"}</span>
              <span>{formatDateTime(match.commenceTime)}</span>
            </div>
            <div className="teams-strip">
              <div className="team-row">
                <span className="flag">{match.homeFlag || ""}</span>
                <strong>{teamZh(match.homeTeam)}</strong>
              </div>
              <span className="versus">vs</span>
              <div className="team-row away">
                <strong>{teamZh(match.awayTeam)}</strong>
                <span className="flag">{match.awayFlag || ""}</span>
              </div>
            </div>
            <MatchMarkets
              spreads={spreads}
              totals={totals}
              extraSpreads={extraSpreads}
              extraTotals={extraTotals}
              h2h={h2h}
              correctScores={correctScores}
              intel={intel}
              context={matchTitle}
              homeTeam={teamZh(match.homeTeam)}
              awayTeam={teamZh(match.awayTeam)}
            />
            <MatchSupporters
              homeTeam={teamZh(match.homeTeam)}
              awayTeam={teamZh(match.awayTeam)}
              supporters={supporters}
            />
          </section>
        );
      })}
      {matches.length === 0 ? <section className="empty-state">目前没有可下注的比赛。</section> : null}
    </main>
  );
}
