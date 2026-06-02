import { MatchMarkets } from "@/components/MatchMarkets";
import { formatDateTime } from "@/lib/format";
import { readDb } from "@/lib/store";
import { teamZh } from "@/lib/teams";

type PageOdd = {
  id: string;
  market: string;
  selection: string;
  label: string;
  price: number;
  fetchedAt: Date;
};

const BET_CUTOFF_MS = 60 * 1000;

function latestByMarket(odds: PageOdd[]) {
  const map = new Map<string, PageOdd>();
  for (const odd of odds) {
    const key = `${odd.market}-${odd.selection}`;
    const current = map.get(key);
    if (!current || current.fetchedAt < odd.fetchedAt) {
      map.set(key, odd);
    }
  }
  return Array.from(map.values());
}

function marketOrder(odds: PageOdd[], selections: string[]) {
  return odds.sort((a, b) => selections.indexOf(a.selection) - selections.indexOf(b.selection));
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
          odds.filter((odd) => odd.market === "spreads"),
          ["home", "away"],
        );
        const totals = marketOrder(
          odds.filter((odd) => odd.market === "totals"),
          ["over", "under"],
        );
        const h2h = marketOrder(
          odds.filter((odd) => odd.market === "h2h"),
          ["home", "draw", "away"],
        );
        const correctScores = odds.filter((odd) => odd.market === "correct_score");
        const matchTitle = `${teamZh(match.homeTeam)} v ${teamZh(match.awayTeam)}`;

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
              h2h={h2h}
              correctScores={correctScores}
              context={matchTitle}
              homeTeam={teamZh(match.homeTeam)}
              awayTeam={teamZh(match.awayTeam)}
            />
          </section>
        );
      })}
      {matches.length === 0 ? <section className="empty-state">目前没有可下注的比赛。</section> : null}
    </main>
  );
}
