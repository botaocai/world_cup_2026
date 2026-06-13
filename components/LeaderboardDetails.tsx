"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { formatDateTime, formatPoints } from "@/lib/format";

type LeaderboardBet = {
  id: string;
  orderNo: string;
  title: string;
  selectionLabel: string;
  price: number;
  stake: number;
  possiblePayout: number;
  status: string;
  profit: number;
  createdAt: string;
};

type LeaderboardRow = {
  rank: number;
  isCurrent: boolean;
  user: { id: string; displayName: string; balance: number };
  profit: number;
  stake: number;
  won: number;
  lost: number;
  pending: number;
  currentBets: LeaderboardBet[];
  historyBets: LeaderboardBet[];
};

const statusText: Record<string, string> = {
  pending: "待结算",
  won: "已赢",
  lost: "已输",
  void: "已退回",
};

export function LeaderboardDetails({ rows }: { rows: LeaderboardRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="leaderboard-panel">
      {rows.map((row) => {
        const open = openId === row.user.id;
        return (
          <article className={`leaderboard-entry ${row.isCurrent ? "current" : ""}`} key={row.user.id}>
            <button
              className="leaderboard-row"
              onClick={() => setOpenId(open ? null : row.user.id)}
              type="button"
            >
              <div className={`rank-badge rank-${row.rank}`}>{row.rank}</div>
              <div className="rank-main">
                <div className="rank-name">
                  <strong>{row.user.displayName}</strong>
                  {row.isCurrent ? <span>我</span> : null}
                </div>
                <div className="rank-meta">
                  已结算 {row.won + row.lost} 单 · 赢 {row.won} · 输 {row.lost}
                  {row.pending ? ` · 待结算 ${row.pending}` : ""}
                </div>
              </div>
              <div className="rank-score">
                <strong className={row.profit >= 0 ? "profit" : "loss"}>
                  {row.profit >= 0 ? "+" : ""}
                  {formatPoints(row.profit)}
                </strong>
                <span>余额 {formatPoints(row.user.balance)}</span>
              </div>
              <ChevronDown className={`rank-chevron ${open ? "open" : ""}`} size={18} />
            </button>
            {open ? (
              <div className="leaderboard-detail">
                <BetSection title="当前下注方案" empty="暂无待结算下注" bets={row.currentBets} pending />
                <BetSection title="历史下注记录" empty="暂无历史下注" bets={row.historyBets} />
              </div>
            ) : null}
          </article>
        );
      })}
      {rows.length === 0 ? <p className="muted leaderboard-empty">还没有玩家。</p> : null}
    </section>
  );
}

function BetSection({
  title,
  empty,
  bets,
  pending = false,
}: {
  title: string;
  empty: string;
  bets: LeaderboardBet[];
  pending?: boolean;
}) {
  return (
    <div className="leaderboard-bet-section">
      <div className="leaderboard-bet-title">{title}</div>
      {bets.length ? (
        <div className="leaderboard-bet-list">
          {bets.map((bet) => (
            <div className="leaderboard-bet" key={bet.id}>
              <div>
                <strong>{bet.title}</strong>
                <span>{bet.selectionLabel} @ {bet.price.toFixed(2)}</span>
              </div>
              <div className="leaderboard-bet-meta">
                <span>本金 {formatPoints(bet.stake)}</span>
                <span>{pending ? `可赢 ${formatPoints(bet.possiblePayout - bet.stake)}` : `盈亏 ${bet.profit >= 0 ? "+" : ""}${formatPoints(bet.profit)}`}</span>
                <span className={`status ${bet.status}`}>{statusText[bet.status] || bet.status}</span>
                <span>{formatDateTime(bet.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="leaderboard-bet-empty">{empty}</div>
      )}
    </div>
  );
}
