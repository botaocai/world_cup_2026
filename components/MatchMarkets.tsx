"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { BetButton } from "@/components/BetSheet";

type PageOdd = {
  id: string;
  market: string;
  selection: string;
  label: string;
  price: number;
};

export function MatchMarkets({
  spreads,
  totals,
  h2h,
  correctScores,
  context,
  homeTeam,
  awayTeam,
}: {
  spreads: PageOdd[];
  totals: PageOdd[];
  h2h: PageOdd[];
  correctScores: PageOdd[];
  context: string;
  homeTeam: string;
  awayTeam: string;
}) {
  const [scoreOpen, setScoreOpen] = useState(false);
  const scoreGroups = useMemo(() => groupCorrectScores(correctScores), [correctScores]);
  const scoreCount = correctScores.length;

  return (
    <>
      <div className="markets-board">
        <MarketColumn title="让球" odds={spreads} context={context} />
        <MarketColumn title="大小" odds={totals} context={context} />
        <MarketColumn title="独赢" odds={h2h} context={context} />
      </div>
      <div className="correct-score-panel">
        <button
          className={`correct-score-toggle ${scoreOpen ? "open" : ""}`}
          onClick={() => setScoreOpen((value) => !value)}
          type="button"
        >
          <span>波胆</span>
          <strong>{scoreCount ? `${scoreCount}项` : "待刷新"}</strong>
          <ChevronDown size={16} aria-hidden />
        </button>
        {scoreOpen ? (
          scoreCount ? (
            <div className="correct-score-board">
              <ScoreGroup title={homeTeam} odds={scoreGroups.home} context={context} />
              <ScoreGroup title="平" odds={scoreGroups.draw} context={context} narrow />
              <ScoreGroup title={awayTeam} odds={scoreGroups.away} context={context} />
            </div>
          ) : (
            <div className="correct-score-empty">波胆赔率会在下一次赔率刷新后显示</div>
          )
        ) : null}
      </div>
    </>
  );
}

function MarketColumn({
  title,
  odds,
  context,
}: {
  title: string;
  odds: PageOdd[];
  context: string;
}) {
  return (
    <div className="market-col">
      <div className="market-title">{title}</div>
      <div className="market-options">
        {odds.map((odd) => (
          <BetButton
            key={odd.id}
            selection={{
              kind: "match",
              oddsId: odd.id,
              label: odd.label,
              context,
              price: odd.price,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ScoreGroup({
  title,
  odds,
  context,
  narrow = false,
}: {
  title: string;
  odds: PageOdd[];
  context: string;
  narrow?: boolean;
}) {
  return (
    <div className={`score-group ${narrow ? "narrow" : ""}`}>
      <div className="score-group-title">{title}</div>
      <div className="score-group-grid">
        {odds.map((odd) => (
          <BetButton
            key={odd.id}
            compact
            selection={{
              kind: "match",
              oddsId: odd.id,
              label: odd.label,
              context: `${context} 波胆`,
              price: odd.price,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function groupCorrectScores(odds: PageOdd[]) {
  const groups = {
    home: [] as PageOdd[],
    draw: [] as PageOdd[],
    away: [] as PageOdd[],
  };

  for (const odd of odds) {
    const score = parseScore(odd.selection);
    if (!score) continue;
    if (score.home > score.away) groups.home.push(odd);
    else if (score.home === score.away) groups.draw.push(odd);
    else groups.away.push(odd);
  }

  groups.home.sort((a, b) => compareScore(a.selection, b.selection));
  groups.draw.sort((a, b) => compareScore(a.selection, b.selection));
  groups.away.sort((a, b) => compareScore(a.selection, b.selection));
  return groups;
}

function compareScore(a: string, b: string) {
  const scoreA = parseScore(a);
  const scoreB = parseScore(b);
  if (!scoreA || !scoreB) return a.localeCompare(b);

  const totalDiff = scoreA.total - scoreB.total;
  if (totalDiff !== 0) return totalDiff;
  const marginDiff = Math.abs(scoreA.home - scoreA.away) - Math.abs(scoreB.home - scoreB.away);
  if (marginDiff !== 0) return marginDiff;
  return scoreA.home - scoreB.home;
}

function parseScore(value: string) {
  const match = value.match(/^(\d+)-(\d+)$/);
  if (!match) return undefined;
  const home = Number(match[1]);
  const away = Number(match[2]);
  return { home, away, total: home + away };
}
