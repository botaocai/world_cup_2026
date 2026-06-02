import { formatDateTime, formatPoints } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";
import { readDb } from "@/lib/store";
import { teamZh } from "@/lib/teams";

const statusText: Record<string, string> = {
  pending: "待结算",
  won: "已赢",
  lost: "已输",
  void: "已退回",
};

export default async function BetsPage() {
  const user = await getCurrentUser();
  const db = readDb();
  const bets = db.bets
    .filter((bet) => bet.userId === user!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((bet) => ({
      ...bet,
      match: bet.matchId ? db.matches.find((match) => match.id === bet.matchId) : null,
    }));

  return (
    <main className="content">
      <div className="section-label">投注记录</div>
      {bets.map((bet) => (
        <article className="record-card" key={bet.id}>
          <div className="record-header">
            <div>
              <strong>{bet.type === "outright" ? "世界杯冠军" : "足球"}</strong>
              <div>
                {bet.match
                  ? `${teamZh(bet.match.homeTeam)} v ${teamZh(bet.match.awayTeam)}`
                  : bet.selection}
              </div>
            </div>
            <span className={`status ${bet.status}`}>{statusText[bet.status] || bet.status}</span>
          </div>
          <div className="record-body">
            <strong>
              {bet.selectionLabel} @ {bet.price.toFixed(2)}
            </strong>
            <div className="record-line">
              <span>投注金额</span>
              <strong>{formatPoints(bet.stake)}</strong>
            </div>
            <div className="record-line">
              <span>{bet.status === "pending" ? "可赢金额" : "本单盈亏"}</span>
              <strong className={bet.profit >= 0 ? "profit" : "loss"}>
                {bet.status === "pending"
                  ? formatPoints(bet.possiblePayout - bet.stake)
                  : formatPoints(bet.profit)}
              </strong>
            </div>
            <div className="record-line">
              <span>{bet.orderNo}</span>
              <span>{formatDateTime(bet.createdAt)}</span>
            </div>
          </div>
        </article>
      ))}
      {bets.length === 0 ? <p className="muted">还没有投注记录。</p> : null}
    </main>
  );
}
