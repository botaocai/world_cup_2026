import { formatPoints } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";
import { readDb } from "@/lib/store";

export default async function LeaderboardPage() {
  const currentUser = await getCurrentUser();
  const db = readDb();
  const rows = db.users
    .map((user) => {
      const bets = db.bets.filter((bet) => bet.userId === user.id);
      const settled = bets.filter((bet) => bet.status !== "pending");
      const profit = settled.reduce((sum, bet) => sum + bet.profit, 0);
      const stake = bets.reduce((sum, bet) => sum + bet.stake, 0);
      const won = settled.filter((bet) => bet.status === "won").length;
      const lost = settled.filter((bet) => bet.status === "lost").length;
      const pending = bets.filter((bet) => bet.status === "pending").length;

      return {
        user,
        profit,
        stake,
        won,
        lost,
        pending,
      };
    })
    .sort((a, b) => b.profit - a.profit || b.user.balance - a.user.balance);

  return (
    <main className="content">
      <div className="section-label">排行榜</div>
      <section className="leaderboard-panel">
        {rows.map((row, index) => {
          const isCurrent = row.user.id === currentUser?.id;
          return (
            <article
              className={`leaderboard-row ${isCurrent ? "current" : ""}`}
              key={row.user.id}
            >
              <div className={`rank-badge rank-${index + 1}`}>{index + 1}</div>
              <div className="rank-main">
                <div className="rank-name">
                  <strong>{row.user.displayName}</strong>
                  {isCurrent ? <span>我</span> : null}
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
            </article>
          );
        })}
        {rows.length === 0 ? <p className="muted">还没有玩家。</p> : null}
      </section>
    </main>
  );
}
